**Considerations:**

Overlap of consecutives (233445 -> 234 and 345, but think about how the scoring should be here, other case would be 234456, getting a new piece of 4 and how useful that piece is)

Goal of the bot is to get the max score, but potentially just to maximize the current score so a greedy approach would most likely work here

Throw out the worst scoring piece (generally the least synergy piece)

**Bot AI scoring for cards (kind of an interface for scoring algorithm):**

Bot AI should have the knowledge of the whole game state as how many cards are left within the deck and their types, what is discarded, and their current hand to generate a score per tile

We would score individual tiles as follows: 
- 1 for every available neighbor for consecutive cards (for card 2, we would score 123,234 and thus a score of 2. For the card 1, we would score 1 since only 123 exists)
  - (Min: 1, Max: 3)
- 3 points for a second of the same card, and 5 for the third same card (this applies per piece obtained on the order they are received. If the bot receives the 3rd piece of the same card it is score 5 but no changes to the other pieces)
  - Min: 1, Max: 5 (4th would also be 5 points but I think this generally needs experimentation and is not required exactly to win)
- If one type of tile is discarded on the table pile and the bot has it, then that piece loses a point of value (-1).  
  - If the bot has 3 of a kind but one of the tiles was discarded, we can ignore the value loss 
- 10 for a wildcard (basically never throw this out no matter what since this can be used to match any tiles)
- If a piece is eligible for a match rule, then the piece should have additional 2 points of value
  - This is mainly used to prevent the wildcard cards from being useless. 

**Bot difficulties:**

To validate, I think we will pair 2 bots of same difficulty against 2 bots of higher difficulty and see who wins more

- Easy bot:
  - When bot gets a playable phase: Chooses a random move 75% of the time, chooses a greedy move 25% of the time
- Medium bot:
  - When bot gets a playable phase: Chooses a random move 40% of the time, chooses a greedy move 60% of the time
- Hard bot:
  - When bot gets a playable phase: Chooses a random move 5% of the time, chooses a greedy move 95% of the time (could be all greedy but that needs actual testing)
