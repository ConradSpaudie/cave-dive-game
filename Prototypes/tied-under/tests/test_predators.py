"""Predator test for Tied Under (creatures-predators.js, creatures-pred-models.js, combat in creatures.js).

What it does:
  1. show:    every predator alone and large in frame under neutral light (tests/screens/PRED_<id>.png),
              plus its warning pose (_tell), its strike pose (_bite) and its dead pose (_dead).
  2. attack:  in the real cave, each predator's attack sequence (tell, lunge, bite) as screenshots
              (PRED_<short>_seq1_tell.png ...), driven by the real brains; checks that every strike
              comes after a warning (a 'creature:tell' event at least 0.4 s earlier).
  3. death:   kills predators with damage() and screenshots the death (twitch, limp, blood, gore).
  4. api:     raycastHit, damage (flora immune, small fish one hit, shark 5 to 6 hits, head shots),
              impulse, stunArea, inRadius, creature:hurt / creature:killed, blood attraction,
              weapon:noise (prey flees), grab and release (struggle), ink, specimen measuring,
              spawning rules (no predator within 15 m of the entrance, fewer on easy).
  5. Fails on any console error.

Run:  python3 tests/test_predators.py [show] [attack] [death] [api]     (about 6 to 10 minutes in software rendering)
"""
import os
import sys
import time

from PIL import Image, ImageStat
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import run_test as RT  # noqa: E402

RT.PORT = 8777
SHOTS = RT.SHOTS
PRED = ["cenote_bull_shark", "pale_barracuda", "gulper_eel", "cave_lurker", "spider_squid", "the_maw"]
SHORT = {"cenote_bull_shark": "shark", "pale_barracuda": "barracuda", "gulper_eel": "gulper", "cave_lurker": "lurker", "spider_squid": "squid", "the_maw": "maw"}
TELL_ACT = {"cenote_bull_shark": 0.55, "pale_barracuda": 0.4, "gulper_eel": 1.0, "cave_lurker": 0.8, "spider_squid": 1.0, "the_maw": 0.6}


def shot(page, name):
    page.evaluate("__debug.screenshotMode(true); __debug.render()")
    path = os.path.join(SHOTS, name)
    page.screenshot(path=path)
    return path


def busy(path):
    im = Image.open(path).convert("L")
    w, h = im.size
    return ImageStat.Stat(im.crop((int(w * 0.15), int(h * 0.15), int(w * 0.85), int(h * 0.85)))).stddev[0]


def bright(path, box=(0.3, 0.3, 0.7, 0.7)):
    im = Image.open(path).convert("L")
    w, h = im.size
    return ImageStat.Stat(im.crop((int(w * box[0]), int(h * box[1]), int(w * box[2]), int(h * box[3])))).mean[0]


EVENTS = """() => {
  window.__ev = [];
  const TU = __debug.TU;
  ['creature:attack','creature:tell','creature:hurt','creature:killed','creature:grab','creature:release','creature:ink','creature:fled','creature:logged'].forEach(n =>
    TU.on(n, e => window.__ev.push({ n, kind: e.kind, id: e.id, sp: e.species || e.speciesId, hp: e.hp, by: e.by, reason: e.reason, t: TU.run ? TU.run.t : 0 })));
}"""


def main():
    os.makedirs(SHOTS, exist_ok=True)
    httpd = RT.serve()
    errors = []
    url = "http://127.0.0.1:%d/" % RT.PORT
    sections = sys.argv[1:] or ["show", "attack", "death", "api"]
    only = [a.split("=", 1)[1].split(",") for a in sections if a.startswith("only=")]
    only = only[0] if only else None   # only=shark,maw limits show / attack / death to those predators
    global PRED
    if only:
        PRED = [k for k in PRED if SHORT[k] in only]
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"])

        def open_page(tag, seed=4242, diff="standard"):
            # in-game sections use a smaller view: software rendering of close-ups needs a lot of memory
            vp = {"width": 960, "height": 600} if tag == "show" else {"width": 640, "height": 400}
            pg = RT.new_page(browser, errors, "[pred %s]" % tag, viewport=vp)
            t0 = time.time()
            pg.goto(url)
            pg.wait_for_function("window.__debug !== undefined", timeout=180000)
            print("boot %.1fs (%s)" % (time.time() - t0, tag))
            pg.add_style_tag(content="[id^=ui-]{display:none!important}")
            pg.evaluate(EVENTS)
            pg.evaluate("([s, d]) => { __debug.start({seed: s, difficulty: d}); __debug.sim(0.5); }", [seed, diff])
            return pg

        # ------------------------------------------------------------ show
        if "show" in sections:
            page = open_page("show")
            for sid in PRED:
                page.evaluate("(id) => { const C = __debug.TU.creatures; C.debugShowcase(id); C.debugAdvance(0.5); }", sid)
                path = shot(page, "PRED_%s.png" % sid)
                b = busy(path)
                page.evaluate("([id, j]) => { const C = __debug.TU.creatures; C.debugShowcase(id, {tell: 1, jaw: j}); C.debugAdvance(0.3); }", [sid, TELL_ACT[sid]])
                shot(page, "PRED_%s_tell.png" % sid)
                page.evaluate("(id) => { const C = __debug.TU.creatures; C.debugShowcase(id, {tell: 1, jaw: 1}); C.debugAdvance(0.3); }", sid)
                shot(page, "PRED_%s_bite.png" % sid)
                page.evaluate("(id) => { const C = __debug.TU.creatures; C.debugShowcase(id, {dead: true}); C.debugAdvance(0.3); }", sid)
                shot(page, "PRED_%s_dead.png" % sid)
                print("  %-18s detail %.1f" % (sid, b))
                assert b > 6, "the showcase of %s looks empty" % sid
            page.evaluate("__debug.TU.creatures.debugShowcase(false)")
            page.close()

        # ------------------------------------------------------------ attack
        if "attack" in sections:
            run_attacks(open_page, errors)

        # ------------------------------------------------------------ death
        if "death" in sections:
            run_deaths(open_page)

        # ------------------------------------------------------------ api
        if "api" in sections:
            run_api(open_page)

        browser.close()
    httpd.shutdown()
    print("ERRORS:", len(errors))
    for e in errors:
        print("  ", e)
    sys.exit(1 if errors else 0)


# Where to stand for each predator (a spot name in its depth zone) and how far away to put it.
STAGE = {"cenote_bull_shark": ("mid", 7), "pale_barracuda": ("mid", 7), "gulper_eel": ("drop", 3.0), "cave_lurker": ("drop", 7), "spider_squid": ("deep", 6), "the_maw": ("deep", 16)}


def stage(page, sid, dist=None, opts=None):
    """Teleport to a good spot, flashlight on, clear the other creatures near by, spawn sid in front."""
    spot, d = STAGE[sid]
    return page.evaluate("""([sid, spot, dist, opts]) => {
      const TU = __debug.TU, C = TU.creatures;
      __debug.teleport(spot, {yaw: 0.4}); __debug.sim(0.2);
      // find a direction with open water ahead so the animal has room
      let best = 0, by = 0; const P = TU.player.state;
      for (let k = 0; k < 16; k++) { const yaw = k / 16 * Math.PI * 2; const d = new THREE.Vector3(-Math.sin(yaw), -0.08, -Math.cos(yaw)).normalize();
        const r = TU.cave.raycast(TU.camera.position, d, 40); if (r > best) { best = r; by = yaw; } }
      __debug.look(by, -0.08); __debug.sim(0.1);
      if (!P.flashOn) TU.player.toggleFlash();
      C.list().forEach(c => { if (c.pos.distanceTo(P.pos) < 25 && c.sp.kind === 'fauna') c.active = false; });
      C.list().filter(c => c.sp.predator && c.pos.distanceTo(P.pos) < 60).forEach(c => { c.gone = true; });
      __debug.sim(0.05);
      const a = C.debugSpawnPredator(sid, Math.min(dist, best * 0.8), opts || {});
      __debug.sim(0.05);
      return { a, room: best };
    }""", [sid, spot, dist or d, opts or {}])


def look_at(page, cid, up=0.0):
    page.evaluate("""([id, up]) => { const c = __debug.TU.creatures.get(id); if (!c) return; const p = c.pos.clone(); p.y += up; __debug.lookAt(p); }""", [cid, up])


def wait_state(page, cid, states, max_s=20, step=0.1, keys=None):
    """Step the game until the creature is in one of `states`. Returns the info or None."""
    return page.evaluate("""([id, states, maxS, step, keys]) => {
      const C = __debug.TU.creatures;
      for (let t = 0; t < maxS; t += step) { __debug.sim(step, keys || []); const i = C.predatorInfo(id); if (!i || i.dead) return i; if (states.includes(i.st)) return i; }
      return null; }""", [cid, states, max_s, step, keys])


def run_attacks(open_page, errors):
    """Real brains: each predator notices you, warns, strikes. Screenshots of the tell, the lunge and the bite."""
    from playwright.sync_api import Error as PWError
    for sid in PRED:
        for attempt in range(2):
            try:
                attack_one(open_page, sid)
                break
            except PWError as e:
                # the shared test machine sometimes kills a software-rendered tab for memory: retry once
                if "crashed" not in str(e) or attempt:
                    raise
                print("    (tab killed for memory, retrying %s)" % sid)
                errors[:] = [x for x in errors if "attack " + sid not in x]


def attack_one(open_page, sid):
    if True:
        page = open_page("attack " + sid)
        short = SHORT[sid]
        page.evaluate("() => { window.__ev.length = 0; }")
        r = stage(page, sid)
        cid = r["a"]["id"]
        print("  %s staged id %d room %.1f m" % (sid, cid, r["room"]))
        # nudge the brains so the tests do not wait forever: start already hunting
        page.evaluate("""([id, sid]) => { const C = __debug.TU.creatures, c = C.get(id); c.cool = 0;
            if (sid === 'cenote_bull_shark') { c.st = 'circle'; c.stT = 5; c.circR = 4.6; c.orbA = Math.atan2(c.pos.z - __debug.TU.player.state.pos.z, c.pos.x - __debug.TU.player.state.pos.x); c.orbDir = 1; }
            if (sid === 'the_maw') { c.st = 'approach'; c.stT = 0; }
            if (sid === 'cave_lurker') { c.st = 'stalk'; c.stT = 0; }
        }""", [cid, sid])
        tell_states = {"cenote_bull_shark": ["tell"], "pale_barracuda": ["tell"], "gulper_eel": ["tell"], "cave_lurker": ["tell"], "spider_squid": ["tell"], "the_maw": ["tell"]}[sid]
        strike_states = {"cenote_bull_shark": ["run", "pass"], "pale_barracuda": ["dart", "retreat"], "gulper_eel": ["lunge", "grab", "retract"], "cave_lurker": ["charge", "pounce", "hold", "fall"], "spider_squid": ["dart", "hold", "retreat"], "the_maw": ["charge", "pass"]}[sid]
        # the lurker needs your light on it; the gulper needs you close to its hole
        if sid == "cave_lurker":
            look_at(page, cid)
        if sid == "gulper_eel":
            page.evaluate("""(id) => { const c = __debug.TU.creatures.get(id), P = __debug.TU.player.state; const p = c.home.clone().addScaledVector(c.normal, 1.6); p.y += 0.25; __debug.TU.player.teleport(p); __debug.sim(0.05); __debug.lookAt(c.home); }""", cid)
        # pack hunters: track whichever member goes into its tell
        info = None
        if sid in ("pale_barracuda", "spider_squid"):
            info = page.evaluate("""([id]) => { const C = __debug.TU.creatures; const ids = C.list().filter(c => c.pack && C.get(id).pack === c.pack).map(c => c.id);
              for (let t = 0; t < 25; t += 0.1) { __debug.sim(0.1); for (const k of ids) { const i = C.predatorInfo(k); if (i && i.st === 'tell') return i; } } return null; }""", [cid])
            if info:
                cid = info["id"]
        else:
            info = wait_state(page, cid, tell_states, 25)
        assert info and info["st"] in tell_states, "%s never warned before attacking (%r)" % (sid, info)
        page.evaluate("__debug.sim(%f)" % (0.35 if sid != "the_maw" else 1.8))
        look_at(page, cid, 0.0)
        shot(page, "PRED_%s_seq1_tell.png" % short)
        info = wait_state(page, cid, strike_states, 6, 0.05)
        assert info, "%s warned but never struck" % sid
        page.evaluate("__debug.sim(0.08)")
        look_at(page, cid)
        shot(page, "PRED_%s_seq2_lunge.png" % short)
        # let the strike land (we do not dodge)
        page.evaluate("""(id) => { const C = __debug.TU.creatures; for (let t = 0; t < 3; t += 0.05) { __debug.sim(0.05); if (window.__ev.some(e => e.n === 'creature:attack' && e.kind !== 'ink')) break; } }""", cid)
        look_at(page, cid)
        shot(page, "PRED_%s_seq3_bite.png" % short)
        ev = page.evaluate("() => window.__ev")
        tells = [e for e in ev if e["n"] == "creature:tell"]
        atks = [e for e in ev if e["n"] == "creature:attack" and e["kind"] != "ink"]
        print("    tells %s  attacks %s  grab %s" % ([e["kind"] for e in tells], [e["kind"] for e in atks], [e["n"] for e in ev if e["n"] in ("creature:grab", "creature:release")]))
        assert atks, "%s should have struck" % sid
        first_strike = atks[0]["t"]
        warned = [e for e in tells if e["t"] <= first_strike - 0.4 and e["kind"] != "circle"]
        assert warned, "%s struck without a warning at least 0.4 s earlier" % sid
        if sid in ("gulper_eel", "spider_squid", "cave_lurker"):
            g = page.evaluate("__debug.TU.creatures.grabbedBy()")
            print("    grabbedBy:", g and {k: g[k] for k in ("species", "kind", "strength")})
            if g:
                look_at(page, g["id"])
                page.evaluate("__debug.sim(0.6)")
                shot(page, "PRED_%s_seq4_grab.png" % short)
        page.evaluate("() => { const C = __debug.TU.creatures; if (C.grabbedBy()) C.releaseGrab(); __debug.TU.player.rescue && __debug.TU.player.rescue(); }")
        posed_sequence(page, sid)
        page.close()


# Posed in-game attack frames: (distance m, angle of the body away from facing you in radians, jaw/arms, extra height m)
POSES = {"cenote_bull_shark": [(6.5, 1.2, 0.55, 0), (3.6, 0.75, 0.85, 0), (2.4, 0.45, 1.0, 0)],
         "pale_barracuda": [(3.0, 1.3, 0.4, 0), (1.9, 0.6, 0.8, 0), (1.15, 0.35, 1.0, 0)],
         "gulper_eel": [(0.16, 0.5, 1.0, 0), (0.6, 0.45, 1.0, 0), (0.85, 0.35, 0.3, 0)],
         "cave_lurker": [(6.0, 1.0, 0.8, 0), (4.2, 0.7, 0.6, 0), (2.9, 0.45, 1.0, 0)],
         "spider_squid": [(3.4, 1.0, 1.0, 0), (2.2, 0.6, 1.0, 0), (1.4, 0.35, 0.3, 0)],
         "the_maw": [(24, 1.0, 0.6, 0), (15, 0.6, 0.9, 0), (9, 0.4, 1.0, 0)]}


def posed_sequence(page, sid):
    """Statues in the real cave under the flashlight: the warning, the lunge and the bite, at a 3/4 angle."""
    short = SHORT[sid]
    r = stage(page, sid, 4 if sid != "the_maw" else 12, {"still": True})
    cid = r["a"]["id"]
    for k, (d, ang, act, dy) in enumerate(POSES[sid]):
        page.evaluate("""([id, d, ang, act, dy, k, sid]) => {
          const TU = __debug.TU, C = TU.creatures, c = C.get(id), cam = TU.camera, V = (x, y, z) => new THREE.Vector3(x, y, z);
          const fw = V(0, 0, -1).applyQuaternion(cam.quaternion); fw.y = 0; fw.normalize(); const rt = V(-fw.z, 0, fw.x);
          if (sid === 'gulper_eel') {
            // the head comes out of the hole toward you
            const toCam = cam.position.clone().sub(c.home).normalize();
            c.aim.copy(c.normal).lerp(toCam, 0.75).normalize(); C.debugPose(id, { ext: d, tell: 1, act: act });
            __debug.lookAt(c.home.clone().addScaledVector(c.aim, c.ext * 0.6));
          } else {
            const room = TU.cave.raycast(cam.position, fw, 60); const dd = Math.min(d, room * 0.8);
            const p = cam.position.clone().addScaledVector(fw, dd).addScaledVector(rt, dd * 0.12); p.y += dy - (c.surfaceUp ? 0 : 0.15);
            if (c.surfaceUp) { const dn = TU.cave.raycast(p.clone().add(V(0, 0.5, 0)), V(0, -1, 0), 8); if (dn < 8) p.y = p.y + 0.5 - dn + c.scale * c.sp.lift; c.up.set(0, 1, 0); }
            c.pos.copy(p);
            const toCam = cam.position.clone().sub(p); toCam.y = c.surfaceUp ? 0 : toCam.y * 0.5; toCam.normalize();
            c.dir.copy(toCam.applyAxisAngle(V(0, 1, 0), -ang)).normalize();
            C.debugPose(id, { tell: 1, act: act, glow: sid === 'the_maw' && k === 0 ? 0.05 : undefined });
            __debug.lookAt(c.pos.clone().add(V(0, c.surfaceUp ? c.scale * 0.05 : 0, 0)));
          }
          if (k === 2 && TU.fx.spawnBlood) TU.fx.spawnBlood(40, { pos: cam.position.clone().addScaledVector(fw, 0.6).add(V(0, -0.2, 0)), burst: true });
          __debug.sim(0.15);
        }""", [cid, d, ang, act, dy, k, sid])
        shot(page, "PRED_%s_pose%d_%s.png" % (short, k + 1, ["tell", "lunge", "bite"][k]))
    page.evaluate("(id) => { const c = __debug.TU.creatures.get(id); if (c) c.gone = true; }", cid)


def run_deaths(open_page):
    """Kill each predator with damage() in front of the camera; screenshots of the twitch and the body."""
    page = open_page("death")
    for sid in PRED:
        short = SHORT[sid]
        r = stage(page, sid, STAGE[sid][1] * (0.6 if sid != "the_maw" else 0.75), {"still": True})
        cid = r["a"]["id"]
        look_at(page, cid)
        res = page.evaluate("""(id) => { const C = __debug.TU.creatures, c = C.get(id); c.still = false; c.st = 'pass';
            let n = 0, out = null; const cam = __debug.TU.camera;
            while (n < 120) { n++; const pt = c.pos.clone(); const dir = pt.clone().sub(cam.position).normalize();
              out = C.damage(id, 10, { kind: 'pierce', dir, point: pt, weapon: 'test' }); if (out.killed) break; }
            return { n, out }; }""", cid)
        print("  %-18s killed after %d hits of 10: %s" % (sid, res["n"], res["out"]))
        page.evaluate("__debug.sim(0.5)")
        look_at(page, cid)
        shot(page, "PRED_%s_death1_twitch.png" % short)
        page.evaluate("__debug.sim(5)")
        look_at(page, cid)
        shot(page, "PRED_%s_death2_body.png" % short)
        info = page.evaluate("(id) => __debug.TU.creatures.predatorInfo(id)", cid)
        assert info and info["dead"], "%s should be dead" % sid
        m = page.evaluate("(id) => __debug.TU.creatures.measure(id)", cid)
        assert m and m["specimen"], "a killed %s should be measurable as a specimen" % sid
        page.evaluate("(id) => { const c = __debug.TU.creatures.get(id); if (c) c.gone = true; }", cid)
    page.close()


def run_api(open_page):
    page = open_page("api")
    out = page.evaluate("""() => {
      const TU = __debug.TU, C = TU.creatures, P = TU.player.state, cam = TU.camera, V = (x, y, z) => new THREE.Vector3(x, y, z);
      const R = {};
      __debug.teleport('mid', {yaw: 0.4}); __debug.sim(0.2);
      C.list().forEach(c => { if (c.pos.distanceTo(P.pos) < 30) c.active = false; });
      const fw = V(0, 0, -1).applyQuaternion(cam.quaternion);
      // raycastHit on a still shark straight ahead, a miss to the side, flora skipped
      const s = C.debugSpawnPredator('cenote_bull_shark', 4, { still: true });
      __debug.sim(0.05);
      const sh = C.get(s.id); const toS = sh.pos.clone().sub(cam.position).normalize();
      R.hit = C.raycastHit(cam.position.clone(), toS, 30);
      const side = toS.clone().cross(V(0, 1, 0)).normalize(); R.miss = C.raycastHit(cam.position.clone(), side, 3);
      // damage: hits to kill the shark, head shot bonus, events
      window.__ev.length = 0;
      const d1 = C.damage(s.id, 10, { kind: 'pierce', dir: toS, point: sh.pos.clone().addScaledVector(sh.dir, -0.4) });
      const d2 = C.damage(s.id, 10, { kind: 'pierce', dir: toS, point: sh.pos.clone().addScaledVector(sh.dir, sh.scale * 0.42) });
      R.body = 10; R.dmgBody = s.hp - d1.hp; R.dmgHead = d1.hp - d2.hp; R.maxHp = s.maxHp;
      let n = 2, last = d2; while (!last.killed && n < 30) { last = C.damage(s.id, 10, { kind: 'pierce', dir: toS }); n++; }
      R.sharkHits = n; R.sharkKilled = last.killed;
      R.hurtEv = window.__ev.filter(e => e.n === 'creature:hurt').length; R.killEv = window.__ev.filter(e => e.n === 'creature:killed').map(e => e.by);
      R.deadAgain = C.damage(s.id, 10, {});
      // small fish die in one hit; flora is immune
      const f = C.debugSpawnInFront('cenote_molly', 2, { still: true }); R.fish = C.damage(f.id, 10, { kind: 'pierce' }); C.list().filter(c => c.speciesId === 'cenote_molly').forEach(c => { c.gone = true; });
      const m = C.debugSpawnInFront('stalag_moss', 2, { still: true }); R.flora = C.damage(m.id, 50, { kind: 'pierce' });
      C.get(s.id).gone = true; const mp = C.get(m.id).pos.clone(); R.floraRay = C.raycastHit(cam.position.clone(), mp.clone().sub(cam.position).normalize(), mp.distanceTo(cam.position) + 0.2);
      // impulse moves a small fish, barely moves a shark
      const f2 = C.debugSpawnInFront('blind_cavefish', 2, { still: true }); const p0 = C.get(f2.id).pos.clone();
      C.impulse(f2.id, V(2, 0, 0)); __debug.sim(0.5); R.fishPushed = +C.get(f2.id).pos.distanceTo(p0).toFixed(2);
      const s2 = C.debugSpawnPredator('cenote_bull_shark', 5, { still: true }); const p1 = C.get(s2.id).pos.clone();
      C.impulse(s2.id, V(2, 0, 0)); __debug.sim(0.5); R.sharkPushed = +C.get(s2.id).pos.distanceTo(p1).toFixed(2);
      // stunArea and inRadius
      R.inR = C.inRadius(C.get(s2.id).pos, 3, { hostile: true }).map(e => e.species);
      R.inAll = C.inRadius(P.pos, 6).length;
      R.stunned = C.stunArea(C.get(s2.id).pos, 3, 4); R.stun = C.predatorInfo(s2.id).stun;
      __debug.sim(0.2); R.stunState = C.predatorInfo(s2.id).st;
      return R;
    }""")
    for k in ("hit", "miss", "dmgBody", "dmgHead", "maxHp", "sharkHits", "sharkKilled", "hurtEv", "killEv", "deadAgain", "fish", "flora", "floraRay", "fishPushed", "sharkPushed", "inR", "inAll", "stunned", "stun"):
        print("  %-12s %r" % (k, out.get(k)))
    assert out["hit"] and out["hit"]["species"] == "cenote_bull_shark" and out["hit"]["dist"] > 2, "raycastHit should find the shark"
    assert out["miss"] is None, "a ray to the side should miss"
    assert abs(out["dmgBody"] - 10) < 0.01 and abs(out["dmgHead"] - 14) < 0.01, "body hit 10, head hit 14"
    # balance pass (CONTRACT.md 11b): predator hp doubled, the shark has about 110 hp, so about 10 to 11 hits of 10
    assert 9 <= out["sharkHits"] <= 13 and out["sharkKilled"], "the shark should die after about 10 to 11 hits of 10"
    assert out["hurtEv"] >= 3 and out["killEv"] == ["pierce"], "hurt and killed events"
    assert out["deadAgain"]["dead"] and not out["deadAgain"]["killed"]
    assert out["fish"]["killed"], "a small fish dies in one hit"
    assert out["flora"]["immune"] and not out["flora"]["killed"], "flora cannot be damaged"
    assert out["floraRay"] is None, "rays pass through flora"
    assert out["fishPushed"] > 0.3 and out["sharkPushed"] < out["fishPushed"] * 0.5, "impulse scales with size"
    assert "cenote_bull_shark" in out["inR"] and out["inAll"] >= 1
    assert out["stunned"] >= 1 and out["stun"] > 1
    page.close()

    # blood in the water, weapon noise, grab and struggle, ink, spawning rules
    page = open_page("api2")
    out = page.evaluate("""() => {
      const TU = __debug.TU, C = TU.creatures, P = TU.player.state, cam = TU.camera, V = (x, y, z) => new THREE.Vector3(x, y, z);
      const R = {};
      // spawning rules: no predator within 15 m of the entrance
      const ent = TU.cave.features.entrance.pos;
      R.nearEntrance = C.list().filter(c => c.sp.predator && c.pos.distanceTo(ent) < 15).length;
      R.preds = C.list().filter(c => c.sp.predator).length;
      __debug.teleport('mid', {yaw: 0.4}); __debug.sim(0.2);
      C.list().forEach(c => { if (c.sp.predator && c.pos.distanceTo(P.pos) < 80) c.gone = true; });
      __debug.sim(0.05);
      // blood: a shark 25 m away (out of sight range) comes when you bleed
      const b = C.debugSpawnPredator('cenote_bull_shark', 6, {}); const sh = C.get(b.id);
      // put it 20 to 44 m away along the cave (a named spot), out of sight range (16 m) but inside smell range (45 m)
      let far = null; for (const n of TU.cave.spotNames()) { const sp = TU.cave.spot(n); if (!sp) continue; const d = sp.pos.distanceTo(P.pos); if (d > 20 && d < 44 && !TU.cave.isDry(sp.pos)) { far = sp.pos.clone(); break; } }
      if (!far) far = P.pos.clone().add(V(0, -30, 0));
      sh.pos.copy(far); sh.home.copy(far); sh.st = 'patrol'; sh.cool = 0; sh.wt.copy(far); sh.wtT = 30;
      R.sharkDist = +sh.pos.distanceTo(P.pos).toFixed(1);
      __debug.sim(3); R.noBlood = C.predatorInfo(b.id).st;
      __debug.TU.player.debug.forceCut(0.7); __debug.sim(0.2); R.bleed = +P.bleed.toFixed(2);
      __debug.sim(3); R.withBlood = C.predatorInfo(b.id).st; R.distAfter = +sh.pos.distanceTo(P.pos).toFixed(1);
      sh.gone = true;
      // weapon noise: prey near the bang flees
      const f = C.debugSpawnInFront('cenote_molly', 3, {}); __debug.sim(0.1);
      TU.emit('weapon:noise', { pos: P.pos.clone(), loudness: 1 }); R.fishFlee = +C.get(f.id).flee.toFixed(1);
      // grab: a squid wraps your mask; tapping A D breaks free
      window.__ev.length = 0;
      const q = C.debugSpawnPredator('spider_squid', 2, {}); const ok = C.debugGrab(q.id, 'hold'); __debug.sim(0.3);
      R.grabbed = C.grabbedBy();
      let taps = 0; for (let k = 0; k < 30 && C.grabbedBy(); k++) { __debug.sim(0.05, [k % 2 ? 'KeyA' : 'KeyD']); taps++; }
      R.taps = taps; R.freed = !C.grabbedBy(); R.grabEv = window.__ev.filter(e => e.n === 'creature:grab' || e.n === 'creature:release').map(e => e.n + (e.reason ? ':' + e.reason : ''));
      // a hit on the grabber also breaks the hold
      const q2 = C.debugSpawnPredator('gulper_eel', 3, {}); R.grab2 = C.debugGrab(q2.id, 'drag'); __debug.sim(0.1);
      C.damage(q2.id, 10, { kind: 'pierce' }); C.damage(q2.id, 10, { kind: 'pierce' }); __debug.sim(0.1); R.freedByHits = !C.grabbedBy();
      // ink blinds
      const qc = C.get(q.id); qc.pos.copy(cam.position).addScaledVector(V(0, 0, -1).applyQuaternion(cam.quaternion), 0.8);
      C.debugInk(q.id); __debug.sim(0.4); R.inkAtCam = +C.inkAt(cam.position).toFixed(2);
      return R;
    }""")
    for k, v in out.items():
        print("  %-14s %r" % (k, v))
    assert out["nearEntrance"] == 0, "no predator may spawn within 15 m of the entrance"
    assert out["noBlood"] == "patrol" and out["withBlood"] in ("circle", "tell", "run", "pass"), "a bleeding diver should attract the shark"
    assert out["fishFlee"] > 1, "weapon noise should scare prey"
    assert out["grabbed"] and out["freed"] and out["taps"] <= 16, "tapping A D should break a grab"
    assert "creature:grab" in out["grabEv"] and any(e.startswith("creature:release") for e in out["grabEv"])
    assert out["grab2"] and out["freedByHits"], "two hits on the grabber should free you"
    assert out["inkAtCam"] > 0.2, "ink should cloud the view"
    shot(page, "PRED_squid_ink_blind.png")
    page.close()

    # difficulty: fewer predators on easy than on hard (same seed)
    page = open_page("easy", seed=777, diff="easy")
    easy = page.evaluate("__debug.TU.creatures.list().filter(c => c.sp.predator).length")
    page.evaluate("__debug.start({seed: 777, difficulty: 'hard'}); __debug.sim(0.3)")
    hard = page.evaluate("__debug.TU.creatures.list().filter(c => c.sp.predator).length")
    print("  predators easy %d, hard %d" % (easy, hard))
    assert easy < hard, "easy should have fewer predators than hard"
    page.close()


if __name__ == "__main__":
    main()
