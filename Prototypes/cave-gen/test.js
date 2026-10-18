// node test.js  [seedsPerDifficulty=1000]
// Verifies determinism, geometry, connectivity and design constraints, then prints tuning stats.
'use strict';
const G = require('./generator.js');
const C = G.constants;
const N = parseInt(process.argv[2] || '1000', 10);

let failures = 0;
const failLog = [];
function fail(seed, diff, msg) {
  failures++;
  if (failLog.length < 40) failLog.push(`[${diff} seed ${seed}] ${msg}`);
}

function cellsOf(p) {
  const out = [];
  for (let dd = 0; dd < p.h; dd++) for (let yy = 0; yy < p.l; yy++) for (let xx = 0; xx < p.w; xx++) out.push([p.x + xx, p.y + yy, p.d + dd]);
  return out;
}
const K = (x, y, d) => x + ',' + y + ',' + d;

function check(r, seed, diff, mods) {
  const tag = (m) => fail(seed, diff + (mods.length ? '+' + mods.join('+') : '') + '/' + r.archetype, m);
  if (!r.ok) { tag('generation failed ' + JSON.stringify(r.failures)); return; }
  const P = r.pieces;
  const rules = G.rulesFor(diff, r.archetype, mods);

  // Checksum recomputation.
  if (G.fnv1aWords(G.checksumWords(r)) !== r.checksum) tag('checksum mismatch on recompute');

  // No overlaps, inside bounds.
  const owner = new Map();
  for (const p of P) for (const c of cellsOf(p)) {
    const k = K(c[0], c[1], c[2]);
    if (owner.has(k)) tag(`overlap at ${k} pieces ${owner.get(k)} and ${p.id}`);
    owner.set(k, p.id);
    if (c[2] < 0 || c[2] > C.MAX_D || Math.abs(c[0]) > C.BOUND_XY || Math.abs(c[1]) > C.BOUND_XY) tag('out of bounds ' + k);
  }

  // Edges join adjacent cells owned by the two pieces; sockets match edges exactly.
  const faceSet = P.map(() => []);
  const adj = P.map(() => []);
  for (const e of r.edges) {
    const [a, b, x, y, d, dir] = e;
    if (owner.get(K(x, y, d)) !== a) tag('edge cell not owned by a ' + e);
    const nx = x + C.DX[dir], ny = y + C.DY[dir], nd = d + C.DD[dir];
    if (owner.get(K(nx, ny, nd)) !== b) tag('edge neighbour not owned by b ' + e);
    faceSet[a].push([x, y, d, dir].join(','));
    faceSet[b].push([nx, ny, nd, C.OPP[dir]].join(','));
    adj[a].push(b); adj[b].push(a);
  }
  for (const p of P) {
    const s1 = p.sockets.map((s) => s.join(',')).sort().join('|');
    const s2 = faceSet[p.id].slice().sort().join('|');
    if (s1 !== s2) tag(`socket/edge mismatch on piece ${p.id}`);
    if (p.shape !== 'room') {
      let m = 0;
      for (const s of p.sockets) m |= 1 << s[3];
      if (m !== p.mask) tag('mask mismatch ' + p.id);
      const sh = G.shapeOfMask(p.mask);
      if (sh !== p.shape) tag(`shape ${p.shape} invalid for mask ${p.mask} piece ${p.id}`);
      if (sh && G.rotMask(C.CANON[sh], p.rot) !== p.mask) tag('rotation does not map canonical sockets ' + p.id);
    } else if (p.sockets.length < 1) tag('room without sockets ' + p.id);
    if (p.variant < 0 || p.variant >= C.KIT_VARIANTS[p.type]) tag('variant out of range ' + p.id);
    const zone = G.zoneOfDepthM((2 * p.d + p.h) * C.CELL_M / 2);
    if (zone !== p.zone) tag('zone wrong ' + p.id);
  }

  // Connectivity from the entrance.
  const start = P.findIndex((p) => p.start);
  const seen = new Uint8Array(P.length);
  const q = [start]; seen[start] = 1;
  while (q.length) { const u = q.pop(); for (const v of adj[u]) if (!seen[v]) { seen[v] = 1; q.push(v); } }
  if (seen.some((v) => !v)) tag('disconnected pieces');

  // Main path: entrance to bottom, consecutive pieces connected, never moves up, visits all 5 zones.
  const mp = r.mainPath;
  if (mp[0] !== start) tag('main path does not start at entrance');
  if (!P[mp[mp.length - 1]].bottom) tag('main path does not end at bottom');
  const zonesSeen = new Set();
  const edgeDir = new Map();
  for (const e of r.edges) edgeDir.set(e[0] + '>' + e[1], e[5]);
  for (let i = 0; i < mp.length; i++) {
    zonesSeen.add(P[mp[i]].zone);
    if (P[mp[i]].role !== 'main') tag('main path piece has wrong role');
    if (i + 1 < mp.length) {
      const dir = edgeDir.get(mp[i] + '>' + mp[i + 1]);
      if (dir === undefined) tag(`main path gap between ${mp[i]} and ${mp[i + 1]}`);
      else if (dir === 4) tag('main path moves upward');
    }
  }
  for (let z = 0; z < 5; z++) if (!zonesSeen.has(z)) tag('main path misses zone ' + z);
  const bottom = P[mp[mp.length - 1]];
  if (bottom.d * C.CELL_M < 200) tag('bottom shallower than 200 m');

  // Branches and loops.
  const loops = r.branches.filter((b) => b.kind === 'loop');
  const dead = r.branches.filter((b) => b.kind === 'dead_end');
  if (r.branches.length < rules.branches[0] || r.branches.length > rules.branches[1]) tag(`branch count ${r.branches.length} outside ${rules.branches}`);
  if (loops.length < rules.loops[0] || loops.length > rules.loops[1]) tag(`loop count ${loops.length} outside ${rules.loops}`);
  if (dead.length < 1) tag('no dead ends');
  for (const b of r.branches) {
    const first = b.pieces[0], last = b.pieces[b.pieces.length - 1];
    if (!adj[first].includes(b.from)) tag('branch not attached to its anchor ' + b.id);
    if (b.kind === 'loop') {
      if (!adj[last].includes(b.to)) tag('loop does not reconnect ' + b.id);
      if (P[b.to].role !== 'main') tag('loop target not on main path ' + b.id);
      if (b.pieces.length < 4) tag('loop too short');
    } else {
      if (P[last].type !== 'dead_end') tag('dead-end branch does not end in a dead end ' + b.id);
      if (!!P[last].treasure !== b.treasure) tag('treasure flag mismatch');
    }
  }
  for (const p of P) if (p.treasure && p.type !== 'dead_end') tag('treasure outside dead end');
  if (mods.includes('collapse_ahead') && !r.branches.some((b) => b.bypass)) tag('collapse_ahead without bypass loop');

  // Squeezes never back to back; feature shapes valid.
  for (const e of r.edges) if (P[e[0]].type === 'squeeze' && P[e[1]].type === 'squeeze') tag('squeezes back to back');
  for (const p of P) {
    if (['squeeze', 'current', 'silt_floor'].includes(p.type) && !['straight', 'bend'].includes(p.shape)) tag(`${p.type} on shape ${p.shape}`);
    if (p.type === 'air_pocket' && !['straight', 'bend', 'v_bot_h'].includes(p.shape)) tag('air pocket on shape ' + p.shape);
  }

  // Air spacing along the main path.
  let t = 0, maxGap = 0, gapTotal = 0;
  const isAir = (p) => p.start || p.dry || p.type === 'air_pocket';
  for (let i = 1; i < mp.length; i++) {
    const c = G.gapCostOf(P[mp[i - 1]]);
    t += c; gapTotal += c;
    if (t > maxGap) maxGap = t;
    if (isAir(P[mp[i]])) t = 0;
  }
  if (maxGap > rules.maxGap) tag(`air gap ${maxGap}s > ${rules.maxGap}s`);
  const airSources = mp.filter((id) => isAir(P[id])).length - 1;
  const needed = Math.ceil(gapTotal / rules.maxGap) - 1;
  if (airSources < needed) tag(`only ${airSources} air sources, need ${needed}`);

  // Landmarks.
  const lms = P.filter((p) => p.type === 'landmark');
  if (lms.length < 1 || lms.length > 3) tag('landmark count ' + lms.length);
  if (lms.length < rules.landmarks[0] || lms.length > rules.landmarks[1]) tag('landmark count outside difficulty range');
  const lz = new Set(lms.map((p) => p.zone));
  if (lz.size !== lms.length) tag('two landmarks in one zone');
  if (new Set(lms.map((p) => p.landmarkId)).size !== lms.length) tag('duplicate landmark id');

  // Swim time recomputed independently.
  let mainSec = 0;
  for (const id of mp) mainSec += G.costOf(P[id]);
  let explore = 0;
  for (const b of r.branches) {
    let s = 0;
    for (const id of b.pieces) s += G.costOf(P[id]);
    explore += b.kind === 'loop' ? Math.floor(s * C.LOOP_PCT / 100) : Math.floor(2 * s * C.EXPLORE_PCT / 100);
  }
  const minutes = Math.round((mainSec + explore) / 6) / 10;
  if (minutes !== r.estimatedSwimMinutes) tag(`swim time recompute ${minutes} vs ${r.estimatedSwimMinutes}`);
  if (minutes < rules.band[0] || minutes > rules.band[1]) tag(`swim time ${minutes} outside ${rules.band}`);
  return { maxGap };
}

function summarise(arr) {
  let s = 0, mn = Infinity, mx = -Infinity;
  for (const v of arr) { s += v; if (v < mn) mn = v; if (v > mx) mx = v; }
  return { mean: s / arr.length, min: mn, max: mx };
}
const fmt = (o, d = 1) => `${o.mean.toFixed(d).padStart(7)} ${String(+o.min.toFixed(d)).padStart(7)} ${String(+o.max.toFixed(d)).padStart(7)}`;

// ---- PRNG vectors
const rng = new G.Rng(12345, 0);
const vec = [];
for (let i = 0; i < 10; i++) vec.push(rng.next());
console.log('PRNG xoshiro128** Rng(12345, stream 0) first 10:', vec.join(', '));
const rng1 = new G.Rng(12345, 1);
const vec1 = [];
for (let i = 0; i < 10; i++) vec1.push(rng1.next());
console.log('PRNG xoshiro128** Rng(12345, stream 1) first 10:', vec1.join(', '));
const rb = new G.Rng(12345, 0);
const below = [];
for (let i = 0; i < 10; i++) below.push(rb.below(6));
console.log('Rng(12345, 0).below(6) x10:', below.join(', '));
console.log('mix32(0)=' + G.mix32(0) + ' mix32(12345)=' + G.mix32(12345));
console.log('FNV-1a of words [1,2,3]:', G.fnv1aWords([1, 2, 3]).toString(16));

// ---- main sweep
const t0 = Date.now();
const report = {};
for (const diff of ['easy', 'standard', 'hard']) {
  const S = { swim: [], rope: [], branches: [], loops: [], dead: [], air: [], airMain: [], gap: [], meanGap: [], sq: [], lm: [], pieces: [], depth: [], attempts: [], treasure: [], arch: {} };
  for (let seed = 1; seed <= N; seed++) {
    const a = G.generate(seed, { difficulty: diff });
    const b = G.generate(seed, { difficulty: diff });
    if (JSON.stringify(a) !== JSON.stringify(b) || a.checksum !== b.checksum) fail(seed, diff, 'non-deterministic output');
    const res = check(a, seed, diff, []);
    if (!a.ok) continue;
    const st = a.stats;
    S.swim.push(a.estimatedSwimMinutes); S.rope.push(a.ropeLengthM); S.branches.push(st.branches); S.loops.push(st.loops);
    S.dead.push(st.deadEnds); S.air.push(st.airPockets); S.airMain.push(st.airPocketsMain); S.gap.push(st.maxAirGapSeconds / 60);
    S.meanGap.push(st.airGapsSeconds.reduce((x, y) => x + y, 0) / st.airGapsSeconds.length / 60);
    S.sq.push(st.squeezes); S.lm.push(st.landmarks); S.pieces.push(st.pieces); S.depth.push(st.bottomDepthM); S.attempts.push(a.attempts);
    S.treasure.push(st.treasureDeadEnds);
    S.arch[a.archetype] = (S.arch[a.archetype] || 0) + 1;
  }
  report[diff] = S;
}
// Archetype and modifier sweep (standard + hard, 150 seeds each).
let extra = 0;
const modSets = [['flood_surge'], ['shifting_silt'], ['collapse_ahead'], ['collapse_ahead', 'flood_surge']];
for (const diff of ['easy', 'standard', 'hard']) {
  for (const arch of C.ARCHETYPES) for (let seed = 1; seed <= 150; seed++) {
    const r = G.generate(seed * 7919, { difficulty: diff, archetype: arch });
    check(r, seed * 7919, diff, []); extra++;
  }
  for (const mods of modSets) for (let seed = 1; seed <= 150; seed++) {
    const r = G.generate(seed * 104729, { difficulty: diff, modifiers: mods });
    const r2 = G.generate(seed * 104729, { difficulty: diff, modifiers: mods.slice().reverse() });
    if (r.checksum !== r2.checksum) fail(seed, diff, 'modifier order changes output');
    check(r, seed * 104729, diff, mods); extra++;
  }
}
const ms = Date.now() - t0;

console.log(`\nSeeds per difficulty: ${N} (each generated twice), plus ${extra} archetype/modifier runs. Time ${ms} ms.`);
console.log('metric                       mean     min     max');
for (const diff of ['easy', 'standard', 'hard']) {
  const S = report[diff];
  console.log(`\n== ${diff} (archetypes: ${Object.entries(S.arch).map(([k, v]) => k + ' ' + v).join(', ')})`);
  console.log('swim time (min)          ' + fmt(summarise(S.swim)));
  console.log('rope, main path (m)      ' + fmt(summarise(S.rope), 0));
  console.log('bottom depth (m)         ' + fmt(summarise(S.depth), 0));
  console.log('branches (total)         ' + fmt(summarise(S.branches), 2));
  console.log('  loops (reconnect)      ' + fmt(summarise(S.loops), 2));
  console.log('  dead ends              ' + fmt(summarise(S.dead), 2));
  console.log('  dead ends w/ treasure  ' + fmt(summarise(S.treasure), 2));
  console.log('air pockets (all)        ' + fmt(summarise(S.air), 2));
  console.log('air pockets (main path)  ' + fmt(summarise(S.airMain), 2));
  console.log('air gap, max per run(min)' + fmt(summarise(S.gap), 2));
  console.log('air gap, mean (min)      ' + fmt(summarise(S.meanGap), 2));
  console.log('squeezes                 ' + fmt(summarise(S.sq), 2));
  console.log('landmarks                ' + fmt(summarise(S.lm), 2));
  console.log('pieces                   ' + fmt(summarise(S.pieces), 0));
  console.log('generation attempts      ' + fmt(summarise(S.attempts), 2));
}
for (const diff of ['easy', 'standard', 'hard']) {
  const r = G.generate(12345, { difficulty: diff });
  console.log(`golden: seed 12345 ${diff}: archetype ${r.archetype}, pieces ${r.pieces.length}, checksum 0x${r.checksumHex}`);
}
if (failures) {
  console.log(`\nFAIL: ${failures} problems`);
  for (const l of failLog) console.log('  ' + l);
  process.exit(1);
}
console.log('\nPASS: all constraints hold, output deterministic.');
