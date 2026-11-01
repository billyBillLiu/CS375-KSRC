"""Replace Policy.choose to experiment without giving bots privileged state."""

import random
from typing import Callable, Optional, Protocol, Sequence

from .game import Game
from .state import PLAYER_COUNT, Action, ActionKind, Observation, Phase


class Policy(Protocol):
    def choose(self, observation: Observation, actions: tuple[Action, ...]) -> Action:
        ...


class RandomPolicy:
    """Random physical-tile discards and greedy claims, including Gold."""

    def __init__(self, seed: Optional[int] = None):
        self.rng = random.Random(seed)

    def choose(self, observation: Observation, actions: tuple[Action, ...]) -> Action:
        if not actions:
            raise ValueError("No action is available")
        if actions[0].kind == ActionKind.DISCARD:
            return Action(ActionKind.DISCARD, self.rng.choice(observation.hand))
        # Claims arrive in Win/Kong/Peng/Chi order; seat 0 also greedily claims.
        return actions[0]


def advance(game: Game, policies: Sequence[Policy]) -> None:
    """Advance one decision boundary using four seat policies."""
    if len(policies) != PLAYER_COUNT:
        raise ValueError("Provide exactly four seat policies")
    if game.state.phase == Phase.OVER:
        return
    if game.state.phase == Phase.CLAIMS:
        decisions = {player: policy.choose(game.observe(player), game.legal_actions(player))
                     for player, policy in enumerate(policies)}
        game.resolve_claims(decisions)
    else:
        player = game.state.current_player
        game.step(player, policies[player].choose(game.observe(player), game.legal_actions(player)))


def play_round(
    game: Game,
    policies: Sequence[Policy],
    max_steps: int = 10000,
    on_step: Optional[Callable[[int], None]] = None,
) -> int:
    """Run a round; optionally observe each boundary, including the terminal state."""
    if max_steps < 0:
        raise ValueError("max_steps must be nonnegative")
    for step in range(max_steps + 1):
        if on_step is not None:
            on_step(step)
        if game.state.phase == Phase.OVER:
            return step
        if step == max_steps:
            break
        advance(game, policies)
    raise RuntimeError(f"Round exceeded {max_steps} decisions")
