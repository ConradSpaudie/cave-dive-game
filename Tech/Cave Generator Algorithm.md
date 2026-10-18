# Cave Generator Algorithm

Spec for porting the cave generator prototype to C++ in Unreal Engine 5. It implements the plan in [[Procedural Cave Generation]] for the design in [[Cave Generation]], and uses the layout archetypes and modifiers from [[Run Variety System]]. Written October 2026.

**Reference implementation:** `prototypes/cave-gen/generator.js` (plain JavaScript, no dependencies). It is the source of truth. If this note and the code disagree, the code wins, and this note should be fixed.

**Visualizer:** `Prototypes/cave-gen/index.html` ("Cave Generator Lab"), also published as a private page: https://claude.ai/artifact/BVoFb377cVsproTNxVYuST . Type a seed, pick a difficulty, see the cave from the side and from above.

**Tests:** `node prototypes/cave-gen/test.js` runs 1000 seeds per difficulty and checks every rule below.

---

## Plain-language version

Think of the cave as a 3D sheet of graph paper. Every square is a box of rock 8 m on each side. The generator fills some boxes with cave pieces made by an artist: a straight tunnel, a bend, a T junction, a shaft going down, a squeeze, a chamber, and so on. Each piece has holes ("sockets") in the middle of some of its faces, and two pieces connect only where their holes line up. Because every hole is the same size and sits in the same spot, any piece can connect to any other piece.

The generator works in this order:

1. **Dig the main line.** Start at the entrance pool at the surface and take one step at a time: forward, turn, or drop down a shaft. A depth plan says roughly how deep you should be at each point of the run, so the cave sinks steadily through all five zones instead of plunging straight down or wandering flat. Every so often it places a chamber or a landmark room. If it digs itself into a corner, it backs up and tries a different way. It stops with a big bottom chamber once the run is long enough and deep enough.
2. **Add side passages.** Some side passages leave the main line and later rejoin it further down. These are loops: two routes that merge and lead on, as the design asks. Others wander off and end. Some of those dead ends hide treasure.
3. **Decorate the passages with gameplay.** Turn some plain tunnel pieces into squeezes, current sections, and silt floors. Then walk the main line with a stopwatch and drop an air pocket wherever the team would otherwise swim too long without air.
4. **Fingerprint it.** Turn the whole cave into a list of numbers and hash it into one 8-digit code (the checksum). Every player's computer builds the cave from the same seed and checks that its code matches the host's.

A **seed** is just a number. Same seed plus same generator version gives the same cave on every computer. That only works if every random choice uses whole-number math, which is why the generator has its own tiny random number generator instead of using Unreal's `FRandomStream` (see "Deviations").

---

## Deviations from the Tech note, and why

| Tech note said | This spec does | Why |
|---|---|---|
| Cells of about 16 to 20 m | **8 m cells** | Zone 1 is only 20 m deep. With 16 to 20 m cells it would be one layer thick, so depth zones could not be shaped. 8 m also equals the proposed rope spacing between divers, so one cell is roughly one diver's slice of rope, and a 16 m tunnel piece made squeezes and air pockets absurdly long. Big spaces still exist: chambers are 2x2x1 and 3x3x2 cells, the bottom is 4x4x2. |
| Use `FRandomStream` for choices | **Own PRNG: xoshiro128\*\* seeded by SplitMix32**, 32-bit unsigned math only | `FRandomStream::RandRange` goes through a float (`FRand() * range`). It is probably deterministic, but nothing guarantees it, and it cannot be reproduced bit for bit in the JS tool. With our own integer PRNG, the browser tool, the C++ game and the unit tests all produce the same cave and the same checksum. That also lets us preview and curate weekly seeds in the browser. |
| Sockets with size classes (squeeze, small, medium, large) | **One socket profile for everything** | Size classes need matching rules and adapter pieces. With one profile, any piece connects to any piece. A squeeze narrows *inside* its 8 m cell and opens back to the standard socket at both ends. |
| Generate the cave in segments from `seed + segmentIndex` as the leader moves | **Generate the whole run's layout at once** (about 3 ms in JS for a standard run), stream only meshes and decoration by distance | Loops cross segment boundaries, and segment-by-segment generation cannot guarantee no overlaps with earlier segments without knowing them anyway. The layout is a few hundred cells, which is tiny. "Keep going" endless mode can still append segments after the bottom from `seed + segmentIndex`, starting from the bottom chamber, with the existing occupancy as input. |
| Graph first, then place it on the grid | **Graph and grid are built together** (each step reserves cells immediately) | Laying out an abstract graph afterwards can fail to fit. Growing on the grid guarantees no overlaps by construction, and loops are found with A* through free cells, which is exactly the reconnect method the Tech note suggested. |
| Check swimmability with a capsule sweep | **Still do it**, but most failures are now impossible by construction | Every connection is a standard socket on a shared face, and only 8 one-cell shapes are allowed. The capsule sweep remains a cheap safety check per kit piece (in the editor), not per run. |

Additional improvements beyond the Tech note:

- **Separate random streams** for layout, branches and decoration, so tuning squeeze rates does not reshuffle the whole cave.
- **Time-based depth plan** so each zone gets a share of the run time, not just a share of the depth.
- **Air pockets are placed by a stopwatch rule** (a guaranteed maximum swim time between air sources) rather than at random.
- **Built-in retry.** If a rule fails (rare), the generator tries again with the random streams continuing, so the result is still deterministic. Mean attempts: 1.27 easy, 1.02 standard, 1.00 hard.

---

## Coordinates, units and zones

- Grid cell: **8 m cube**. Integer coordinates `(x, y, d)`: x = east, y = north, d = depth layer (0 at the surface, increasing downward).
- Bounds: `-60 <= x, y <= 60`, `0 <= d <= 63`.
- Directions: `0 N(+y)`, `1 E(+x)`, `2 S(-y)`, `3 W(-x)`, `4 UP(d-1)`, `5 DOWN(d+1)`. `OPP = [2,3,0,1,5,4]`. Turning right from heading `h` is `(h+1)&3`, left is `(h+3)&3`.
- Socket mask: bit `1 << dir`.

**Unreal mapping** (UE units are centimetres, Z up): put grid north on UE +X and grid east on UE +Y. Then a clockwise quarter turn on the grid (N to E) is a positive UE yaw.

```
FVector CellMinCorner(x, y, d) = FVector(y * 800.f, x * 800.f, -(d + 1) * 800.f);
FRotator PieceRotation(rot)    = FRotator(0.f, rot * 90.f, 0.f);
```

Floats are only used here, after generation. No layout decision ever touches a float.

**Zones** come from the depth in metres of the piece's vertical centre: `centreM = (2*d + h) * 4` (integer). Boundaries from [[Logbook Species List]]:

| Zone index | Name | Depth | First layer in zone (centre depth) |
|---|---|---|---|
| 0 | The Mouth | 0 to 20 m | d = 0 |
| 1 | Twilight Throat | 20 to 60 m | d = 2 (20 m) |
| 2 | The Black Galleries | 60 to 120 m | d = 7 (60 m) |
| 3 | The Sulfur Deep | 120 to 200 m | d = 15 (124 m) |
| 4 | The Old Water | 200 m and deeper | d = 25 (204 m) |

```
int ZoneOfDepthM(int m) { return m < 20 ? 0 : m < 60 ? 1 : m < 120 ? 2 : m < 200 ? 3 : 4; }
```

---

## Data structures (C++)

```cpp
enum class ECaveDir : uint8 { N, E, S, W, Up, Down };

enum class ECavePieceType : uint8 {   // order matters: used in the checksum
  Straight, Bend, JunctionT, JunctionX, ShaftDown, ShaftUp, Squeeze,
  ChamberSmall, ChamberLarge, AirPocket, DeadEnd, SiltFloor, Current, Landmark
};

enum class ECaveShape : uint8 {       // order matters: used in the checksum
  Cap, Straight, Bend, Tee, Cross, VThrough, VTopH, VBotH, Room
};

enum class ECaveRole : uint8 { Main, Branch, Loop };

namespace ECaveFlag { enum : uint32 { Start = 1, Bottom = 2, Treasure = 4, Dry = 8, Collapse = 16 }; }

struct FCaveSocket { int32 X, Y, D; uint8 Dir; };   // cell inside the piece + face it opens through

struct FCavePiece {
  int32 Id;
  ECavePieceType Type;
  ECaveShape Shape;
  int32 X, Y, D;          // min corner (smallest x, y, d)
  int32 W, L, H;          // size in cells along x, y, d
  uint8 Rot;              // 0..3 quarter turns clockwise seen from above
  uint8 Variant;          // which art variant of this type (landmarks: landmark id 0..29)
  uint8 Zone;             // 0..4
  ECaveRole Role;
  int32 Branch;           // -1 for main path
  uint32 Flags;
  uint8 Mask;             // 1-cell pieces only: socket bits
  TArray<FCaveSocket> Sockets;   // sorted by (X, Y, D, Dir)
  int32 CostSeconds;      // traversal time estimate
  // generation-only state (not in output): InDir, OutDir, Entry, Exit, Banned
};

struct FCaveEdge { int32 A, B; int32 X, Y, D; uint8 Dir; };  // cell in A, face Dir leads into B

struct FCaveBranch {
  int32 Id;
  bool bLoop;             // true: reconnects; false: dead end
  int32 From, To;         // anchor piece id; To = -1 for dead ends
  TArray<int32> Pieces;   // in traversal order, away from the anchor
  bool bTreasure, bBypass, bSplit;
  int32 Seconds;
};

struct FCaveLayout {
  uint32 Version = 1, Seed;
  uint8 Difficulty;       // 0 easy, 1 standard, 2 hard
  uint8 Archetype;        // 0 shaft, 1 maze, 2 river, 3 chain, 4 split
  TArray<FName> Modifiers;// sorted, de-duplicated
  TArray<FCavePiece> Pieces;
  TArray<FCaveEdge> Edges;
  TArray<int32> MainPath; // piece ids, entrance first, bottom last
  TArray<FCaveBranch> Branches;
  int32 BottomLayer, BudgetSeconds, Attempts;
  int32 SwimSeconds, RopeMetres;
  uint32 Checksum;
};
```

Occupancy: a `TMap<uint32, int32>` from cell key to piece id, with
`key = ((x + 1024) * 2048 + (y + 1024)) * 128 + d`.

**Never iterate a TMap or TSet to make a decision.** Their iteration order is not part of the contract. The JS code only does lookups on maps; every choice comes from an array in a defined order.

---

## PRNG (exact)

Two building blocks, all `uint32_t` arithmetic with wraparound.

```cpp
static uint32 Mix32(uint32 z) {               // MurmurHash3 fmix32
  z = (z ^ (z >> 16)) * 0x85EBCA6Bu;
  z = (z ^ (z >> 13)) * 0xC2B2AE35u;
  return z ^ (z >> 16);
}
static uint32 Rotl(uint32 x, int k) { return (x << k) | (x >> (32 - k)); }

struct FCaveRng {                             // xoshiro128** seeded by SplitMix32
  uint32 S[4];
  FCaveRng(uint32 Seed, uint32 Stream) {
    uint32 Sm = Seed ^ (Stream * 0x9E3779B9u);
    for (int i = 0; i < 4; ++i) { Sm += 0x9E3779B9u; S[i] = Mix32(Sm); }
    if ((S[0] | S[1] | S[2] | S[3]) == 0) S[0] = 1;
  }
  uint32 Next() {
    const uint32 Result = Rotl(S[1] * 5u, 7) * 9u;
    const uint32 T = S[1] << 9;
    S[2] ^= S[0]; S[3] ^= S[1]; S[1] ^= S[2]; S[0] ^= S[3];
    S[2] ^= T;
    S[3] = Rotl(S[3], 11);
    return Result;
  }
  uint32 Below(uint32 N) {                    // unbiased [0, N), N >= 1
    const uint32 Threshold = (0u - N) % N;
    for (;;) { const uint32 R = Next(); if (R >= Threshold) return R % N; }
  }
  int32 Range(int32 Lo, int32 Hi) { return Lo + (int32)Below((uint32)(Hi - Lo + 1)); }
  bool Chance(uint32 Pct) { return Below(100) < Pct; }
  int32 Weighted(const TArray<int32>& W) {    // -1 if all zero
    int32 Total = 0; for (int32 w : W) Total += w;
    if (Total <= 0) return -1;
    int32 R = (int32)Below((uint32)Total);
    for (int32 i = 0; i < W.Num(); ++i) { if (R < W[i]) return i; R -= W[i]; }
    return W.Num() - 1;
  }
};
```

Streams: `0` meta (archetype roll), `1` main path, `2` branches and loops, `3` types, decoration, air, variants.

**Test vectors** (copy these into a UE Automation test):

| Call | Expected |
|---|---|
| `FCaveRng(12345, 0).Next()` x10 | 518667457, 440444462, 4232892992, 3757857622, 3939018813, 1334683535, 3795058715, 2092637810, 2829112157, 779180383 |
| `FCaveRng(12345, 1).Next()` x10 | 2407269127, 3079606827, 3141342157, 1759594971, 3892826365, 1788433948, 4142755115, 536123125, 3214941151, 2869886450 |
| `FCaveRng(12345, 0).Below(6)` x10 | 1, 2, 2, 4, 3, 5, 5, 2, 5, 1 |
| `Mix32(0)`, `Mix32(12345)` | 0, 1011272156 |
| `Fnv1aWords({1, 2, 3})` | 0x794671b5 |

**The order of RNG calls is part of the algorithm.** The C++ port must call the same stream, the same function, in the same order as `generator.js`, including calls whose result is thrown away (for example, a room that fails to fit still consumed `Below` calls). Port the functions one to one and check against the golden checksums below.

---

## Generation algorithm

### Stage 0: setup

```
generate(seed, difficulty, modifiers, archetypeOverride):
  mods = sort(unique(modifiers))
  meta = Rng(seed, 0)
  archetype = override if valid else ARCHETYPES[meta.Weighted([20, 20, 20, 25, 15])]
             // shaft, maze, river, chain, split (weights from Run Variety System)
  P = params(difficulty) adjusted by archetype and mods   (tables below)
  rngL = Rng(seed, 1); rngB = Rng(seed, 2); rngF = Rng(seed, 3)
  repeat up to 24 attempts (streams keep advancing, never re-seeded):
     ctx = empty occupancy, pieces, edges, branches
     if !WalkMain(ctx)        -> next attempt
     if !BuildBranches(ctx)   -> next attempt
     AssignZones; AssignTypes; AssignFeatures
     if !PlaceAirPockets(ctx) -> next attempt
     Finalise (variants, costs); stats = ComputeStats
     if stats.minutes outside P.band -> next attempt
     return output with checksum
```

### Stage 1: main path (`WalkMain`, stream 1)

```
budget = rngL.Range(P.budget)            // seconds of main-line time to aim for
B      = rngL.Range(P.bottom)            // bottom layer (25 = 200 m)
nLm    = rngL.Range(P.landmarks)
place entrance room 2x2x1 at (0,0,0), flag Start, cost 30
stack = [entrance]; tBefore = [0]
loop (max 8000 iterations, max 600 backtracks, else fail):
  head = top of stack
  t = tBefore[top] + (head is room ? head.cost : 15)
  target = TargetLayer(t + 60)           // look 60 s ahead
  options, weights = ExitOptions(head, target)
  if no options:                          // dead end while digging: backtrack
     pop head, free its cells; parent.Banned += parent.exit; continue
  exit = options[rngL.Weighted(weights)]
  if head is a cell: head.cost = (entered or leaving vertically) ? 9 : 18
  tAfter = tBefore[top] + head.cost
  next = exit cell + exit dir; m = exit dir
  if tAfter >= budget and next.d >= B:
     try bottom room 4x4x2 at next (top layer = next.d); if it fits: push, stop
  if no room placed and stack size > 2 and tAfter - (time of last room) >= P.roomGap:
     z = zone of next cell
     if z >= 1 and landmarks so far < nLm and no landmark yet in z:
        want = (nLm - placed) >= (5 - z) ? true : rngL.Chance(35)
        if want: try landmark 3x3x2; if its real zone already has one, remove it
     if still nothing and rngL.Chance(P.roomPct):
        large = rngL.Chance(archetype in {chain, shaft} ? 50 : 35)
        try chamber_large 3x3x2 or chamber_small 2x2x1
  if nothing placed: place a 1x1x1 cell at next, InDir = m
  push
landmark count must be inside P.landmarks, else fail
connect consecutive stack pieces through their exits (adds sockets and edges)
```

`TargetLayer(t)`: time progress in per mille `p = min(1000, floor(t*1000/budget))`. Control points are the cumulative zone shares `P.shares` (per mille of run time for zones 0..4) against layers `[0, 2, 7, 15, 25, B]`; linear interpolation with integer floor division.

`ExitOptions(head, target)`:
- For a 1-cell head entered with move `m`: candidate directions are `[m, left, right, DOWN]` if `m` is horizontal, or `[DOWN, N, E, S, W]` if `m` is DOWN. Never UP on the main line.
  - DOWN weight from the deficit `target - head.d`: `>=3: 300`, `2: 120`, `1: 45`, `0: 4`, `<0: 0`. Zero if `head.d >= B + 2` or the current vertical run already equals `P.maxDrop`. Plus `P.shaftBias` when already falling and still behind the plan.
  - Horizontal weight: after a fall 25 each; otherwise forward `P.fwdW`, turns `P.turnW`.
- For a room head: every boundary face except UP and the entry face. DOWN faces weigh `DownWeight(target - roomBottomLayer) >> 1`, horizontal faces 10.
- A candidate is dropped if the target cell is taken, out of bounds, banned, or has no free neighbour (except UP) besides where it came from. Weight becomes 0 beyond `|x|, |y| > 34`. If every weight is 0 but options exist, all get weight 1.

`TryRoom(kind, cell, m)` (2 tries): if entering downward, the room's top is the entry layer and it is offset randomly in x and y so the entry cell lies inside. If entering horizontally, the entry face is on the near wall, offset randomly along the wall, and the room may start up to `h-1` layers higher (bottom room: never higher). All cells must be free.

### Stage 2: loops and dead ends (`BuildBranches`, stream 2)

```
AssignZones
nLoops    = rngB.Range(P.loops)
nBranches = rngB.Range(max(P.branches.min, nLoops + 1), P.branches.max)
if modifier collapse_ahead: up to 12 tries of TryLoop(A in zone 2, B in zones 2..3, span 4..20)
     must succeed; mark it bypass; flag main piece right after A as Collapse
if archetype split: up to 4 tries of TryLoop(A in zone 1, B in zone 3+, span 8..200, maxLen 80)
     (counts as a loop if it works; optional)
up to nLoops*10 tries of TryLoop() until nLoops loops
fail if loops < P.loops.min
need = max(1, nBranches - loops); up to need*8 tries of TryDeadEnd()
fail if total branches outside P.branches or no dead end
```

**Anchor faces** (where a new passage may attach): free horizontal neighbours of a piece. 1-cell pieces qualify only if they have no vertical sockets and exactly 2 or 3 horizontal sockets (a straight or bend becomes a T, a T becomes an X; caps and shafts never become junctions). Rooms qualify except the entrance and the bottom.

`TryLoop`: pick anchor A uniformly from main-path indices `2 .. n-7` that have an anchor face, pick one of its faces, start cell `s` = the free cell beyond it. Pick target B from main indices `A+5 .. A+28` (or the override span) with an anchor face. Goals are the free cells in front of B's anchor faces at Manhattan distance 3 or more from `s`. Run A* (below). Accept a path of 4 or more cells. Commit: create 1-cell pieces along the path (role Loop), connect A to the first cell, each cell to the next, and the last cell to B.

**A\***: 6-neighbour moves through free in-bounds cells within `|x|, |y| <= 38`. Step cost `10 + Noise(cell) + (vertical ? 4 : 0)`, where `Noise = Mix32((x*73856093) ^ (y*19349663) ^ (d*83492791) ^ salt) % 9` (32-bit wrapping multiply; `salt = rngB.Next()` once per search). Heuristic `10 * min Manhattan distance to a goal`. Open list ordered by `(f, insertion counter)`; this total order makes any correct binary heap pop in the same sequence. Path length capped (36 default), expansions capped (6000 default). The noise makes loops wander instead of hugging straight lines.

`TryDeadEnd`: 20% of the time (if branches exist) anchor on a branch or loop piece, else on main indices `2 .. n-3`. Length `rngB.Range(brLen)`. Random walk: from a horizontal heading choose among `[forward, left, right, DOWN, UP]` with weights `50, 25, 25, 20, 4`; after a vertical move `[same, N, E, S, W]` with `30 (down) or 15 (up), 25, 25, 25, 25`. No reversing a vertical move, at most 3 vertical moves in a row, cells must be free and not already on this walk. Stop when stuck. Trim trailing vertical moves (dead-end caps are horizontal). Need at least 2 cells. Last cell becomes the dead end; `rngB.Chance(P.treasurePct)` hides treasure there.

### Stage 3: shapes and types (`AssignTypes`, stream 3)

For rooms: `rot = rngF.Below(4)`. For 1-cell pieces: shape from the socket mask (table in "The kit"), then type:

| Shape | Type |
|---|---|
| cap | dead_end |
| straight / bend | straight / bend |
| tee / cross | junction_t / junction_x |
| v_through, v_top_h, v_bot_h | shaft_up if the path through it only moves up, else shaft_down |

Rotation: all `r` in 0..3 where `RotMask(CANON[shape], r) == mask`; pick `rngF.Below(count)` (symmetric pieces get free visual variety). `RotMask` rotates the 4 horizontal bits left by `r` within the nibble and keeps the vertical bits.

### Stage 4: gameplay features (`AssignFeatures`, stream 3)

Paths are visited in order: main path, then each branch in creation order.

1. **Chain archetype:** for each main-path room (not the bottom), the main piece just before it becomes a squeeze if allowed.
2. **Squeezes:** each plain piece (straight or bend) not touching the entrance or bottom, and not next to another squeeze, becomes a squeeze with `P.sqPct`.
3. **Currents:** runs of 2 to 4 plain pieces along a path, start chance `min(40, P.curPct * curMul)`.
4. **Silt floors:** runs of 1 to 3, start chance `min(40, P.siltPct * siltMul * SILT_ZONE[zone] / 100)` with `SILT_ZONE = [30, 140, 110, 80, 100]` (Twilight Throat is the silt zone).
5. **Dry chambers:** every non-entrance, non-bottom chamber is dry (breathable) with 35%.
6. **Bonus air pockets:** plain pieces on branches and loops become air pockets with 6%.

### Stage 5: air pockets on the main line (`PlaceAirPockets`, stream 3)

Air sources are the entrance, dry chambers, and air pockets. Walk the main line adding each piece's gap cost (its cost without the 30 s rest) to a timer when you enter the next piece. When the timer would exceed `P.maxGap` on entering piece `i`:

- Candidates are main pieces since the last air source whose arrival time is within the limit and that can hold an air dome: straight, bend, current or silt floor on a straight/bend shape, or a v_bot_h shaft top.
- Prefer straight, bend and shaft tops; pick the last one, or the one before it (`rngF.Below(2)`), make it an air pocket, restart the timer from there.
- If there are no candidates, make the latest chamber or landmark in the window dry instead. If there is none, the attempt fails.

The check for "too long" happens before the check for "this piece is an air source", so a dry chamber reached too late still counts as a violation.

### Stage 6: finalise, stats, checksum

- `variant = rngF.Below(KIT_VARIANTS[type])` in piece id order. Landmarks draw unique ids from 0..29 (`do { id = Below(30) } while used`).
- Swim time = sum of main-line costs + for each dead end `floor(2 * cost * 40 / 100)` (40% of teams explore it, there and back) + for each loop `floor(cost * 25 / 100)`.
- Rope on the main line: 8 m per 1-cell piece; for a room, `(Manhattan(entry cell, exit cell) + 1) * 8` (bottom and entrance use their centre or anchor).

**Checksum:** FNV-1a 32-bit over a list of `uint32` words, each fed as 4 bytes little endian (`h = 0x811C9DC5; for each byte: h ^= b; h *= 0x01000193`). Negative coordinates are fed as their two's complement `uint32`. Word order:

```
Version, Seed, DifficultyIndex, ArchetypeIndex, PieceCount,
for each piece in id order:
  TypeIndex, ShapeIndex, X, Y, D, W, L, H, Rot, Variant, Zone, RoleIndex, Branch + 1, Flags,
  SocketCount, then each socket (sorted by X, Y, D, Dir): X, Y, D, Dir
EdgeCount, then each edge in creation order: A, B
MainPathCount, then each main path piece id
```

Modifiers are not hashed directly; their effect on layout is (they change what gets built).

---

## Constraints and tuning

| Rule | Easy | Standard | Hard | Enforced by |
|---|---|---|---|---|
| Swim time band (min) | 12 to 18 | 30 to 45 | 45 to 75 | retry |
| Main-line time budget (s) | 540 to 600 | 1360 to 1500 | 1850 to 2250 | depth plan |
| Bottom layer (depth of bottom chamber top) | 25 (200 m) | 26 to 29 (208 to 232 m) | 29 to 34 (232 to 272 m) | walker |
| Branches total (loops + dead ends) | 2 to 3 | 4 to 6 | 7 to 10 | retry |
| Loops (reconnecting branches) | 1 | 2 to 3 | 3 to 5 | retry |
| Landmark rooms (max 1 per zone) | 1 | 1 to 2 | 2 to 3 | retry |
| Max swim between air sources on main line | 5:00 | 5:30 | 6:30 | air placement |
| Squeeze chance per plain piece | 4% | 6% | 9% | never two adjacent |
| Current run start chance | 3% | 4% | 5% | runs of 2 to 4 |
| Silt run start chance (before zone factor) | 6% | 8% | 10% | runs of 1 to 3 |
| Dead-end branch length (cells) | 2 to 4 | 3 to 9 | 3 to 9 | walk |
| Treasure in a dead end | 35% | 40% | 45% | |
| Zone time shares (per mille, zones 1..5) | 80/170/230/290/230 | 80/180/240/260/240 | 70/170/240/270/250 | depth plan |
| Min time between rooms (s) / room chance | 300 / 12% | 200 / 22% | 220 / 24% | walker |
| Max shaft drop in a row (cells) | 7 | 4 | 4 | walker |

Archetype adjustments ([[Run Variety System]] 1.1):

| Archetype | Changes |
|---|---|
| The Shaft | max drop +3, shaft bias +40, turns 30 |
| The Maze | branches +2 (both ends of the range), loops +1, dead-end length -1, turns 35, forward 40 |
| The River | forward 80, turns 12, currents x3, max drop -1 |
| The Chain | room chance +18, room gap x0.75, squeeze before every main-line room, half of rooms large |
| The Split | an extra long loop from Zone 2 (Twilight Throat) to Zone 4 (Sulfur Deep) when it fits |

Layout modifiers: `flood_surge` currents x2, `shifting_silt` silt x2, `collapse_ahead` guarantees a bypass loop in the Black Galleries and flags the blocked main piece. All other modifiers from [[Run Variety System]] are runtime-only and do not change the layout.

**Swim time model** (seconds per piece, team of up to 4 on the rope, including logging and rope handling; about 0.44 m/s horizontal, 0.9 m/s sinking down a shaft):

| Piece | s | Piece | s |
|---|---|---|---|
| straight, bend, dead end | 18 | squeeze | 63 |
| junction T or X | 28 | current | 40 |
| shaft down | 9 | silt floor | 28 |
| shaft up | 22 | air pocket | 18 + 30 rest |
| chamber small | 60 | chamber large | 110 |
| landmark | 150 | entrance / bottom | 30 / 120 |

These are guesses until playtests. Retune them from real run timings, then retune the budgets; the rest of the system follows.

---

## The kit (what the 3D artist provides)

Every piece fits inside whole 8 m cells. Rules for every piece:

- **One socket profile:** an opening about 3 m wide and 3 m high (round or oval), centred on the cell face, the same on every piece, horizontal or vertical. Paint a 0.5 m "collar" around it with the same rock so seams can be covered by overlap rocks.
- **Closed shell, walls at least 10 cm thick** (Lumen rule from [[Procedural Cave Generation]]). Faces without a socket are solid.
- **Pivot** at the min corner of the piece's bounding box (or at the centre, consistently; the spawner must match). Rotation 0 is the canonical orientation below. "N" means UE +X.
- **Navigation:** a 1 m diameter, 2.2 m long capsule must pass between every pair of sockets (squeeze: 0.8 m).

One-cell shapes (canonical sockets at rotation 0):

| Shape | Sockets | Used as types | Variants wanted |
|---|---|---|---|
| cap | N | dead_end | 4 |
| straight | N, S | straight, squeeze, current, silt_floor, air_pocket | 5 + 4 per feature |
| bend | N, E | bend, squeeze, current, silt_floor, air_pocket | 5 + 4 per feature |
| tee | N, E, W | junction_t | 4 |
| cross | N, E, S, W | junction_x | 3 |
| v_through | Up, Down | shaft_down, shaft_up | 4 |
| v_bot_h (shaft top) | N, Down | shaft_down, shaft_up, air_pocket | 4 (+ air pocket) |
| v_top_h (shaft bottom) | N, Up | shaft_down, shaft_up | 4 |

Shaft up and shaft down are the same geometry; the type is gameplay (which way the team travels). The two shaft elbows (v_bot_h then v_top_h) are the most common pieces in the cave, because every one-layer step down uses a pair. Make some elbow variants read as a sloping passage so stepped descents look natural.

Rooms (sockets can open on any boundary cell face; build each room with a removable plug on every face slot, 4 per side for a 2x2 wall, and the spawner removes the plugs where a socket exists):

| Room | Footprint (cells) | Size | Notes |
|---|---|---|---|
| Entrance pool | 2x2x1 | 16 x 16 x 8 m | Hero piece, open to the sky, rope stake |
| chamber_small | 2x2x1 | 16 x 16 x 8 m | Some are dry (air chamber variant) |
| chamber_large | 3x3x2 | 24 x 24 x 16 m | Some are dry |
| landmark | 3x3x2 | 24 x 24 x 16 m | 30 hero rooms at launch, one per variant id |
| Bottom chamber | 4x4x2 | 32 x 32 x 16 m | The ruin and the giant ([[Run Variety System]] section 3) |

Minimum kit to grey-box the generator: 8 one-cell shapes, 1 squeeze straight, 1 air pocket straight, 3 rooms. That is 13 meshes. Plain boxes with holes are fine to start.

---

## Multiplayer verification

1. The host picks `Seed`, difficulty, modifiers (and archetype if overridden) and replicates them in the GameState with `GeneratorVersion` and the host's `Checksum`.
2. Each client generates locally, computes its checksum, and compares. Match: build the level. Mismatch: show "Cave version mismatch, update the game" and do not spawn the player.
3. A late joiner receives the same replicated values, generates, verifies, then follows the rope ([[Rope System]]).
4. Changing anything that alters output (tables, costs, RNG call order) means bumping `GEN_VERSION`. Old seeds then build different caves, which is fine for normal runs; the weekly seed must be generated with the current version.
5. CI test: the C++ port must reproduce the golden checksums from `test.js` exactly.

Golden checksums (generator v1, no modifiers, archetype rolled from the seed):

| Seed | Difficulty | Archetype | Pieces | Checksum |
|---|---|---|---|---|
| 12345 | easy | river | 54 | 0x0163fcb5 |
| 12345 | standard | river | 118 | 0x0e05b75f |
| 12345 | hard | river | 172 | 0x12e9b1bb |

---

## Measured stats (node test.js, 1000 seeds per difficulty)

Every seed generated twice and compared; plus 4050 runs covering every archetype and layout modifier on all difficulties. All checks passed: deterministic output, checksum recomputes, no overlapping cells, every socket matched by an edge, every piece connected to the entrance, main line never goes up and visits all 5 zones, branch and loop counts in range, loops reconnect, dead ends end in a dead-end piece, no back-to-back squeezes, air gap limits held, landmarks 1 to 3 with at most one per zone, swim time inside the band. Runtime about 2.6 ms per cave in Node.

```
== easy (archetypes: river 199, chain 274, shaft 179, maze 190, split 158)
swim time (min)             15.9    12.9      18
rope, main path (m)          383     320     480
bottom depth (m)             201     200     216
branches (total)            2.90       2       5
  loops (reconnect)         1.19       1       2
  dead ends                 1.71       1       3
  dead ends w/ treasure     0.60       0       3
air pockets (all)           2.37       1       6
air pockets (main path)     2.18       1       4
air gap, max per run(min)   4.57    3.25       5
air gap, mean (min)         3.33    1.86     4.9
squeezes                    0.37       0       3
landmarks                   1.00       1       1
pieces                        61      43      99
generation attempts         1.27       1       5

== standard
swim time (min)             38.3      30    44.9
rope, main path (m)          707     552     840
bottom depth (m)             221     208     248
branches (total)            5.29       4       8
  loops (reconnect)         2.68       2       4
  dead ends                 2.61       1       5
  dead ends w/ treasure     1.05       0       4
air pockets (all)           5.64       2      11
air pockets (main path)     4.81       2       8
air gap, max per run(min)   5.18       4     5.5
air gap, mean (min)         3.76    2.46    5.05
squeezes                    2.90       0       9
landmarks                   1.50       1       2
pieces                       121      78     179
generation attempts         1.02       1       2

== hard
swim time (min)             57.6    46.8    74.4
rope, main path (m)          956     752    1128
bottom depth (m)             252     232     280
branches (total)            8.96       7      12
  loops (reconnect)         4.19       3       6
  dead ends                 4.77       2       8
  dead ends w/ treasure     2.14       0       6
air pockets (all)           7.56       3      15
air pockets (main path)     6.23       3      10
air gap, max per run(min)   6.25    5.13     6.5
air gap, mean (min)         4.49    3.14    6.03
squeezes                    6.96       1      19
landmarks                   2.50       2       3
pieces                       178     123     257
generation attempts         1.00       1       2
```

Columns are mean, min, max. Branch maximums above the difficulty table come from The Maze (+2). The listed range of archetypes is the same for every difficulty because the archetype roll uses its own stream.

---

## Things the numbers show (for Conrad to decide)

- **Easy runs are mostly shafts.** Reaching 200 m in about 15 minutes means about two thirds of the main-line pieces are shaft pieces. If easy should feel calmer, either let easy end at the top of Zone 4 (The Sulfur Deep) or give easy shorter zone depths. Both are one-line changes.
- **Hard runs can have up to 19 squeezes.** That is the 9% rate on long paths. Lower `sqPct` if playtests say it drags.
- **Air pockets are about one every 3.5 to 4.5 minutes on average.** With 2-tank loadouts (20 minutes, [[Proposed Answers]] #33) that is generous. That fits the funny-moment goal (the muffled scream in an air pocket) more than survival pressure.

## Porting checklist

1. `FCaveRng` plus the test vectors as an Automation test.
2. Port `generator.js` function by function into a plain C++ class (`FCaveGenerator`, no UObject needed) with the same RNG call order.
3. Automation test: golden checksums above, then the same 1000-seed constraint checks as `test.js`.
4. `ACaveGenerator` actor: runs the generator, spawns grey boxes per piece (colour by type), draws edges with debug lines, prints seed and checksum, regenerates on a key press. This matches "First prototype step" in [[Procedural Cave Generation]].
5. Replace boxes with kit meshes using the shape, rotation and variant fields; remove room plugs where sockets exist; run PCG decoration seeded with `Mix32(seed ^ pieceId)`, no gameplay collision.
