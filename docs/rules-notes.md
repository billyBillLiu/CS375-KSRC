# Exploratory rules notes

## Core Rules

### Win Condition:
A winning hand consists of:
- **5 Triplets** (or quadruplets)
- **1 Pair**

---

## Actions:

### Draw
- Draw **1 tile from the front of the wall**
- Discard **1 tile**

### Chi
- Claim a **consecutive triplet**
- Only allowed from the **player to your left**
- Draw afterwards

### Peng
- Claim an **identical triplet or quadruplet** from **any player's discard**
- Takes **precedence over Chi**
- Draw afterwards

### Kong (Same as Peng but for quadruplets)
- If you already hold a **hidden triplet** (dragon or wind):
  - You may declare **Gong** upon receiving the 4th tile
  - Draw from BACK of wall afterwards

## Dealing Phase
1. Each player forms a 2x18 wall of tiles in front of them.
2. Each player rolls dice, largest gets to be dealer. Winner gets dealer later.
3. Roll dice to get __X__ number.
4. Starting with dealer as 1, count counter clockwise __X__ players. Whoever it lands on will be the starting wall.
5. Count clockwise (right to left) on the starting wall __X__ pairs of tiles.
6. After __X__ pairs of tiles, in a counter clockwise motion, starting with the dealer, everyone draws 2 pairs (4 tiles) until everyone has 16 tiles.
7. Dealer draws an extra one (17 total for them)
8. In a counter clockwise fasion, starting with the Dealer again, everyone discards their winds and flowers and draws the same amount from the BACK of the wall. Until no one has any flowers or winds.
9. Take one more tile from the back and reveal it as a "Gold" or Wild Card. If it is a wind or flower, discard it and reveal the next one.

## Pseudo Code:

```
int Tiles: { one of 36 integers (0-35) }

struct Player {
    vector of Tiles hand;
    vector of Tiles revealed;
    vector of Tiles revealedSpecials;
}

struct GameState{
    vector of Tiles revealedDiscards;
    array of Players playerList
    deque of Tiles wall
    int Tile goldTile
}
```

```
# Choose the starting wall

                        2
                    3       1
                        0

    Players         [0, 1, 2, 3]      -array of Player Structs
                    [E, N, W, S]

    <--- (prev) Clockwise | Counter Clockwise (next) ---> 

 StartWallIndex = ( DealerIndex + (DiceRoll - 1 ) ) % 4

```

```

    the wall before break: (if we rolled a 3)
                 2
            [72 ... 107]                            
        [71            [108
     3  ...             ...  1
        36]            143]
            [35  ...  0]
                 0


# Calculate where to break wall

    Wall;       [0, 1, 2, ..., 143]     -deque of 144 tiles 
                                        -put 4 of each tile type in and shuffle
                                        -StartPoints = [0, 108, 72, 36]
        <--- Right | Left (Clockwise) --->

StartingTile = StartPoints[StartWallIndex] + 2 * DiceRoll 
```
```
# Deal 4 to each 4 times

current = DealerIndex
repeat 4 times: 
    Players[current].hand.add(drawFront())
    Players[current].hand.add(drawFront())
    current = (current + 1) % 4
Players[current].hand.add(drawFront())
```
```
# Each player gets rid of special cards until none left

fun isSpecial(tile):
    return isFlower(tile) OR isWind(tile) OR isDragon(tile)

needScanning = true

while needScanning:
    needScanning = false
    current = DealerIndex

    repeat 4 times:
        player = players[current]

        for j = 0 to player.hand.size - 1
            if isSpecial(player.hand[j]):
                player.revealedSpecials.add(player.hand[j])
                player.hand.removeAt(j)

                newTile = drawBack()
                player.hand.add(newTile)

                needScanning = true

        current = ( current + 1 ) % 4
```
```
# Draw and reveal gold card

goldCard = drawBack()
while goldCard.isSpecial():
    goldCard = drawBack()

revealGold()
```

Gold:

Count dice_roll_num from the back
If flower: go next
