"""Mutable simulator state and immutable actions/observations."""

from collections import deque
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


PLAYER_COUNT = 4
MELDS_PER_HAND = 5


class Phase(str, Enum):
    DRAW = "draw"
    DISCARD = "discard"
    CLAIMS = "claims"
    OVER = "over"


class ActionKind(str, Enum):
    DRAW = "draw"
    DISCARD = "discard"
    WIN = "win"
    KONG = "kong"
    PENG = "peng"
    CHI = "chi"
    PASS = "pass"


@dataclass(frozen=True)
class Action:
    kind: ActionKind
    tile: Optional[str] = None


@dataclass(frozen=True)
class Meld:
    kind: ActionKind
    tiles: tuple[str, ...]
    group_id: int
    from_player: int


@dataclass(frozen=True)
class Discard:
    tile: str
    player: int


@dataclass
class Player:
    hand: list[str] = field(default_factory=list)
    melds: list[Meld] = field(default_factory=list)
    specials: list[str] = field(default_factory=list)
    discards: list[str] = field(default_factory=list)

    @property
    def total_hand_count(self) -> int:
        # GetHand() in Unity includes locked meld tiles, including all four of a Kong.
        return len(self.hand) + sum(len(meld.tiles) for meld in self.melds)

    @property
    def locked_meld_count(self) -> int:
        return len({meld.group_id for meld in self.melds if meld.group_id >= 0})

    @property
    def needs_draw(self) -> bool:
        return len(self.hand) < (MELDS_PER_HAND - self.locked_meld_count) * 3 + 2


@dataclass
class GameState:
    players: list[Player] = field(default_factory=lambda: [Player() for _ in range(PLAYER_COUNT)])
    wall: deque[str] = field(default_factory=deque)
    current_player: int = 0
    phase: Phase = Phase.DRAW
    current_discard: Optional[Discard] = None
    gold_tile: Optional[str] = None
    skipped_gold_specials: list[str] = field(default_factory=list)
    next_meld_id: int = 0
    winner: Optional[int] = None
    end_reason: Optional[str] = None


@dataclass(frozen=True)
class Observation:
    """Information a seat can see; no wall ordering or opponents' hidden tiles."""

    player: int
    hand: tuple[str, ...]
    hand_sizes: tuple[int, ...]
    melds: tuple[tuple[Meld, ...], ...]
    specials: tuple[tuple[str, ...], ...]
    discards: tuple[tuple[str, ...], ...]
    current_discard: Optional[Discard]
    gold_tile: Optional[str]
    wall_size: int
    current_player: int
    phase: Phase
    winner: Optional[int]
    end_reason: Optional[str]
