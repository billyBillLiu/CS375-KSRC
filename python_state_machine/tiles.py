"""Tile identities from Assets/Data, using TileData.tileID (not asset filenames)."""

from typing import Optional

SUITS = ("WAN", "TAO", "BIN")
TILE_IDS = (
    tuple(f"{rank}{suit}" for suit in SUITS for rank in range(1, 10))
    + ("WIND_EAST", "WIND_SOUTH", "WIND_WEST", "WIND_NORTH")
    + ("DRGN_RED", "DRGN_GREEN", "DRGN_WHITE")
    + tuple(f"FLO_{i}" for i in range(1, 5))
    + ("SZN_SPR", "SZN_SUM", "SZN_AUT", "SZN_WNT")
)


_HONOR_SORT_ORDER = {
    "WIND_EAST": 30, "WIND_SOUTH": 31, "WIND_WEST": 32, "WIND_NORTH": 33,
    "DRGN_RED": 40, "DRGN_GREEN": 41, "DRGN_WHITE": 42,
}
_SOLVER_SUIT_BASE = {"BIN": 0, "TAO": 10, "WAN": 20}


def is_special(tile: str) -> bool:
    tag = tile.upper()
    return any(part in tag for part in ("FLO", "SZN", "WIND", "DRGN"))


def tile_count(tile: str) -> int:
    """GameRules.GetTileCount: four ordinary/honor tiles, one flower/season."""
    tag = tile.upper()
    if any(part in tag for part in ("WAN", "TAO", "BIN", "WIND", "DRGN")):
        return 4
    return 1 if "FLO" in tag or "SZN" in tag else 0


def build_wall() -> list[str]:
    return [tile for tile in TILE_IDS for _ in range(tile_count(tile))]


def parse_tile(tile: str) -> Optional[tuple[int, str]]:
    """Parse a canonical suited TileData.tileID."""
    if len(tile) != 4 or tile[0] not in "123456789" or tile[1:] not in SUITS:
        return None
    return int(tile[0]), tile[1:]


def hand_sort_key(tile: str) -> int:
    """GameRules.GetHandSortValue; playable tiles sort WAN, TAO, BIN."""
    parsed = parse_tile(tile)
    if parsed:
        return SUITS.index(parsed[1]) * 10 + parsed[0]
    return _HONOR_SORT_ORDER.get(tile, 100)


def solver_sort_key(tile: str) -> int:
    parsed = parse_tile(tile)
    if not parsed:
        return 999
    rank, suit = parsed
    return _SOLVER_SUIT_BASE[suit] + rank
