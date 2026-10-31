"""Run from GameAI: python3 -m macaque_ai --seed 7 --games 100."""

import argparse
import json
from collections import Counter
from dataclasses import asdict

from .bot import RandomPolicy, play_round
from .game import Game
from .state import PLAYER_COUNT


def main() -> None:
    parser = argparse.ArgumentParser(description="Macaque C# behavior mirror / Python AI lab")
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--games", type=int, default=1)
    parser.add_argument("--trace", action="store_true", help="Print seat 0 observations as JSON lines")
    args = parser.parse_args()
    if args.games < 1:
        parser.error("--games must be positive")
    results = Counter()
    winners = Counter()
    total_steps = 0
    for offset in range(args.games):
        seed = args.seed + offset
        game = Game.new(seed=seed)
        policies = [RandomPolicy(seed * 4 + seat) for seat in range(PLAYER_COUNT)]
        def trace(step: int) -> None:
            print(json.dumps({"seed": seed, "step": step, **asdict(game.observe(0))}))

        steps = play_round(game, policies, on_step=trace if args.trace else None)
        results[game.state.end_reason] += 1
        if game.state.winner is not None:
            winners[game.state.winner] += 1
        total_steps += steps
    print(json.dumps({"games": args.games, "first_seed": args.seed,
                      "results": dict(results), "winners": dict(winners),
                      "decisions": total_steps}, sort_keys=True))


if __name__ == "__main__":
    main()
