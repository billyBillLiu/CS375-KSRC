"""Macaque's dependency-free Python Mahjong lab."""

from .game import DRAW, PASS, Game
from .rules import can_win_with_tile, is_winning_hand
from .state import Action, ActionKind, GameState, Meld, Observation, Phase, Player

__all__ = ["Game", "GameState", "Player", "Meld", "Observation", "Phase", "Action",
           "ActionKind", "DRAW", "PASS", "is_winning_hand", "can_win_with_tile"]
