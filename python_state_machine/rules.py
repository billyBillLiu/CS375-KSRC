"""Headless translations of WallManager claim checks and WinChecker."""

from collections import Counter
from typing import Optional

from .state import MELDS_PER_HAND, Player
from .tiles import parse_tile, solver_sort_key


def chi_matches(hand: list[str], discard: str) -> list[tuple[str, str]]:
    parsed = parse_tile(discard)
    if not parsed:
        return []
    rank, suit = parsed
    pairs = ((rank - 2, rank - 1), (rank - 1, rank + 1), (rank + 1, rank + 2))
    return [(f"{a}{suit}", f"{b}{suit}") for a, b in pairs
            if f"{a}{suit}" in hand and f"{b}{suit}" in hand]


def is_winning_hand(player: Player, gold: Optional[str]) -> bool:
    return _check(player.hand, player.locked_meld_count, gold)


def can_win_with_tile(player: Player, candidate: str, gold: Optional[str]) -> bool:
    return _check(player.hand + [candidate], player.locked_meld_count, gold)


def _check(hand: list[str], locked_melds: int, gold: Optional[str]) -> bool:
    needed = MELDS_PER_HAND - locked_melds
    if needed < 0:
        return False
    freq = Counter(tile for tile in hand if tile != gold)
    wilds = hand.count(gold) if gold is not None else 0
    return _solve(freq, wilds, needed, False)


def _solve(freq: Counter, wilds: int, melds: int, pair_found: bool) -> bool:
    remaining = sum(freq.values())
    if remaining + wilds != melds * 3 + (0 if pair_found else 2):
        return False
    if melds == 0 and pair_found:
        return remaining == 0 and wilds == 0
    if remaining == 0:
        return wilds == melds * 3 + (0 if pair_found else 2)

    first = min((tile for tile, count in freq.items() if count > 0), key=solver_sort_key)

    def consume_identical(size: int, wilds_used: int, next_melds: int, next_pair: bool) -> bool:
        normals = size - wilds_used
        if freq[first] < normals or wilds < wilds_used:
            return False
        freq[first] -= normals
        result = _solve(freq, wilds - wilds_used, next_melds, next_pair)
        freq[first] += normals
        return result

    if not pair_found:
        for used in (0, 1):
            if consume_identical(2, used, melds, True):
                return True
    if melds > 0:
        for used in (0, 1, 2):
            if consume_identical(3, used, melds - 1, pair_found):
                return True
        parsed = parse_tile(first)
        if parsed:
            rank, suit = parsed
            for start in range(max(1, rank - 2), min(7, rank) + 1):
                sequence = tuple(f"{start + offset}{suit}" for offset in range(3))
                anchor = sequence.index(first)
                # Always use the first natural tile, but try Gold in either of
                # the other slots, even when that natural tile is available.
                for mask in range(7, -1, -1):
                    if not mask & (1 << anchor):
                        continue
                    natural = [tile for i, tile in enumerate(sequence) if mask & (1 << i)]
                    missing = 3 - len(natural)
                    if missing > wilds or any(freq[tile] == 0 for tile in natural):
                        continue
                    for tile in natural:
                        freq[tile] -= 1
                    result = _solve(freq, wilds - missing, melds - 1, pair_found)
                    for tile in natural:
                        freq[tile] += 1
                    if result:
                        return True
    return False
