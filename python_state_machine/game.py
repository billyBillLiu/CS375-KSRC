"""Synchronous state machine for Fuzhou Mahjong rounds."""

import copy
import random
from collections import deque
from typing import Iterable, Mapping, Optional

from .rules import can_win_with_tile, chi_matches, is_winning_hand
from .state import PLAYER_COUNT, Action, ActionKind, Discard, GameState, Meld, Observation, Phase
from .tiles import TILE_IDS, build_wall, hand_sort_key, is_special

PASS = Action(ActionKind.PASS)
DRAW = Action(ActionKind.DRAW)
CLAIM_PRIORITY = (ActionKind.WIN, ActionKind.KONG, ActionKind.PENG, ActionKind.CHI)


class Game:
    def __init__(self, state: GameState, rng: Optional[random.Random] = None):
        self.state = state
        self.rng = rng if rng is not None else random.Random()

    @classmethod
    def new(cls, seed: Optional[int] = None, wall: Optional[Iterable[str]] = None) -> "Game":
        """Deal a round. An explicit wall is front-to-back and is never shuffled.

        Random generators can differ across languages. Use an explicit wall for replay.
        Short explicit walls are allowed for exhaustion tests.
        """
        rng = random.Random(seed)
        tiles = list(wall) if wall is not None else build_wall()
        if any(tile not in TILE_IDS for tile in tiles):
            raise ValueError("Wall contains an unknown tile identity")
        if wall is None:
            rng.shuffle(tiles)
        game = cls(GameState(wall=deque(tiles)), rng)
        game._setup()
        return game

    def clone(self) -> "Game":
        """Independent state and RNG for tree search / counterfactual rollouts."""
        return copy.deepcopy(self)

    def observe(self, player: int) -> Observation:
        self._validate_player(player)
        state = self.state
        return Observation(
            player=player, hand=tuple(state.players[player].hand),
            hand_sizes=tuple(len(p.hand) for p in state.players),
            melds=tuple(tuple(p.melds) for p in state.players),
            specials=tuple(tuple(p.specials) for p in state.players),
            discards=tuple(tuple(p.discards) for p in state.players),
            current_discard=state.current_discard, gold_tile=state.gold_tile,
            wall_size=len(state.wall), current_player=state.current_player,
            phase=state.phase, winner=state.winner, end_reason=state.end_reason,
        )

    def legal_actions(self, player: int) -> tuple[Action, ...]:
        self._validate_player(player)
        state = self.state
        if state.phase == Phase.OVER:
            return ()
        if state.phase == Phase.CLAIMS:
            claims = self._claim_actions(player)
            # Seat 0 exposes only its highest-priority claim.
            return tuple(claims[:1] if player == 0 else claims) + (PASS,)
        if player != state.current_player:
            return ()
        # A retained human claim remains clickable until drawing/discarding.
        retained = self._claim_actions(0)[:1] if player == 0 else []
        if state.phase == Phase.DRAW:
            # Retain the previous discard until the human draws if Chi is possible.
            return tuple(retained) + (DRAW,)
        return tuple(retained) + tuple(Action(ActionKind.DISCARD, tile)
                                       for tile in dict.fromkeys(state.players[player].hand))

    def step(self, player: int, action: Action) -> GameState:
        """Take a draw/discard or seat-0 claim/pass; resolve_claims handles all seats.

        Passing seat 0's claim window applies automatic bot claim priority.
        Draws include chained special replacements and automatic self-win checks.
        """
        if action not in self.legal_actions(player):
            raise ValueError(f"Illegal action for player {player}: {action}")
        state = self.state
        if state.phase == Phase.CLAIMS:
            if player != 0:
                raise ValueError("Submit bot claims together using resolve_claims()")
            self.resolve_claims({0: action})
        elif action.kind == ActionKind.DRAW:
            if self._draw_playable(player):
                self._after_draw()
        elif action.kind == ActionKind.DISCARD:
            state.players[player].hand.remove(action.tile)
            self._clear_discard()
            state.current_discard = Discard(action.tile, player)
            state.phase = Phase.CLAIMS
        else:
            self._claim(player, action)
        return state

    def resolve_claims(self, decisions: Optional[Mapping[int, Action]] = None) -> GameState:
        """Close the window and resolve all seats: Win > Kong > Peng > Chi.

        Omitted seat 0 passes; omitted bots automatically select their best claim.
        Explicit PASS lets a lab policy decline. All decisions are validated before
        mutation. Ties follow turn order starting after the discarder.
        """
        if self.state.phase != Phase.CLAIMS:
            raise ValueError("No claim window is open")
        choices = dict(decisions or {})
        legal = {seat: self.legal_actions(seat) for seat in range(PLAYER_COUNT)}
        for player, action in choices.items():
            self._validate_player(player)
            if action not in legal[player]:
                raise ValueError(f"Illegal claim for player {player}: {action}")
        choices.setdefault(0, PASS)
        discard = self.state.current_discard
        for kind in CLAIM_PRIORITY:
            for offset in range(1, PLAYER_COUNT):
                player = (discard.player + offset) % PLAYER_COUNT
                action = Action(kind)
                if player in choices and choices[player] != action:
                    continue
                if action in legal[player]:
                    self._claim(player, action)
                    return self.state

        # Preserve the pending discard only if the human can Chi.
        if not self._can_chi(0):
            self._clear_discard()
        self.state.current_player = (discard.player + 1) % PLAYER_COUNT
        self._begin_turn()
        return self.state

    def _validate_player(self, player: int) -> None:
        if not isinstance(player, int) or not 0 <= player < PLAYER_COUNT:
            raise ValueError("Player index must be 0, 1, 2, or 3")

    def _setup(self) -> None:
        state = self.state
        # Deal four packets per seat, then the dealer's extra tile.
        for _ in range(4):
            for player in state.players:
                for _ in range(4):
                    tile = self._take()
                    if tile is None:
                        return
                    player.hand.append(tile)
        tile = self._take()
        if tile is None:
            return
        state.players[0].hand.append(tile)

        # Scan backwards once per seat, then repeat all seats until specials are gone.
        found = True
        while found:
            found = False
            for player in state.players:
                for index in range(len(player.hand) - 1, -1, -1):
                    if is_special(player.hand[index]):
                        found = True
                        player.specials.append(player.hand.pop(index))
                        tile = self._take(back=True)
                        if tile is None:
                            return
                        player.hand.append(tile)

        while True:
            tile = self._take(back=True)
            if tile is None:
                return
            if not is_special(tile):
                state.gold_tile = tile
                break
            # Track skipped Gold candidates privately for tile conservation.
            state.skipped_gold_specials.append(tile)
        for player in state.players:
            player.hand.sort(key=hand_sort_key)
        self._begin_turn()

    def _take(self, back: bool = False) -> Optional[str]:
        if not self.state.wall:
            # Exhaustion ends the round, including when it happens during setup.
            self.state.phase = Phase.OVER
            self.state.end_reason = "wall_exhausted"
            return None
        return self.state.wall.pop() if back else self.state.wall.popleft()

    def _begin_turn(self) -> None:
        player = self.state.players[self.state.current_player]
        if player.needs_draw:
            self.state.phase = Phase.DRAW
        else:
            self._after_draw()

    def _after_draw(self) -> None:
        state = self.state
        if is_winning_hand(state.players[state.current_player], state.gold_tile):
            self._win(state.current_player, "self_draw")
        else:
            state.phase = Phase.DISCARD

    def _draw_playable(self, player_index: int) -> bool:
        # Ordinary and Kong replacement draws start at the front.
        self._clear_discard()
        player = self.state.players[player_index]
        back = False
        while True:
            tile = self._take(back=back)
            if tile is None:
                return False
            if is_special(tile):
                player.specials.append(tile)
                back = True
            else:
                player.hand.append(tile)
                self._sort(player_index)
                return True

    def _sort(self, player: int) -> None:
        # Keep seat 0's manually arranged order after the initial sort.
        if player != 0:
            self.state.players[player].hand.sort(key=hand_sort_key)

    def _clear_discard(self) -> None:
        discard = self.state.current_discard
        if discard is not None:
            self.state.players[discard.player].discards.append(discard.tile)
            self.state.current_discard = None

    def _can_chi(self, player: int) -> bool:
        discard = self.state.current_discard
        return (discard is not None and (discard.player + 1) % PLAYER_COUNT == player
                and bool(chi_matches(self.state.players[player].hand, discard.tile)))

    def _claim_actions(self, player_index: int) -> list[Action]:
        state = self.state
        discard = state.current_discard
        if discard is None or discard.player == player_index:
            return []
        player = state.players[player_index]
        actions = []
        if can_win_with_tile(player, discard.tile, state.gold_tile):
            actions.append(Action(ActionKind.WIN))
        count = player.hand.count(discard.tile)
        if count >= 3:
            actions.append(Action(ActionKind.KONG))
        if count >= 2:
            actions.append(Action(ActionKind.PENG))
        if self._can_chi(player_index):
            actions.append(Action(ActionKind.CHI))
        return actions

    def _claim(self, player_index: int, action: Action) -> None:
        state = self.state
        discard = state.current_discard
        player = state.players[player_index]
        state.current_discard = None
        if action.kind == ActionKind.WIN:
            player.hand.append(discard.tile)
            # A discard win records the winner separately from the current turn seat.
            self._win(player_index, "discard_claim")
            return
        state.current_player = player_index
        if action.kind == ActionKind.CHI:
            matched = chi_matches(player.hand, discard.tile)[0]
        else:
            matched = (discard.tile,) * (3 if action.kind == ActionKind.KONG else 2)
        for tile in matched:
            player.hand.remove(tile)
        player.melds.append(Meld(action.kind, (discard.tile,) + tuple(matched),
                                 state.next_meld_id, discard.player))
        state.next_meld_id += 1
        self._sort(player_index)
        if action.kind == ActionKind.KONG:
            if not self._draw_playable(player_index):
                return
            if is_winning_hand(player, state.gold_tile):
                self._win(player_index, "self_draw")
                return
        self._begin_turn()

    def _win(self, player: int, reason: str) -> None:
        self.state.winner = player
        self.state.end_reason = reason
        self.state.phase = Phase.OVER
