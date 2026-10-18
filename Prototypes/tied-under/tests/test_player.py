"""Player, hands, fx and audio test for Tied Under (agent C).

Faster than run_test.py: it starts a dive with window.__debug, steps the game directly and uses the
debug hooks in TU.player.debug to put the diver in each situation, then saves a screenshot of each
in tests/screens/player/ and checks the state changes. It fails on any console error.

Run:  python3 tests/test_player.py            (all steps)
      python3 tests/test_player.py hands      (only steps whose name contains "hands")
"""
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import run_test as RT  # noqa: E402  (reuses the server and the page helpers)
from playwright.sync_api import sync_playwright  # noqa: E402

SHOTS = os.path.join(HERE, "screens", "player")
def free_port():
    import socket
    s = socket.socket(); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]; s.close(); return port


RT.PORT = free_port()  # its own port, so it can run while other tests run
FILTER = sys.argv[1] if len(sys.argv) > 1 else ""
results = []


def shot(page, name):
    page.evaluate("__debug.screenshotMode(true)")
    page.evaluate("__debug.render()")
    page.screenshot(path=os.path.join(SHOTS, name))
    page.evaluate("__debug.screenshotMode(false)")


def ps(page):
    return page.evaluate("__debug.TU.player.debug.state()")


def check(cond, what):
    results.append((bool(cond), what))
    print(("  ok   " if cond else "  FAIL ") + what)


# Test-only workaround (not shipped): three r128 crashes when an InstancedMesh without instanceColor shares a
# material with one that has it (agent A's cave dressing did this while in progress). Give such meshes white colors.
PATCH_INSTANCES = """(() => { const T = THREE, withC = new Set(); let n = 0;
  __debug.TU.scene.traverse(o => { if (o.isInstancedMesh && o.instanceColor) withC.add(o.material); });
  __debug.TU.scene.traverse(o => { if (o.isInstancedMesh && !o.instanceColor && withC.has(o.material)) { o.instanceColor = new T.InstancedBufferAttribute(new Float32Array(o.instanceMatrix.count * 3).fill(1), 3); n++; } });
  return n; })()"""


# The test steps the game itself (__debug.sim) and draws only for screenshots (__debug.render), so it stops
# the page's own animation loop: otherwise the browser keeps drawing the whole cave in the background.
STOP_LOOP = "window.requestAnimationFrame = function () { return 0; }"


def fresh(page, where="mid", opts="{}"):
    """Start a clean dive and stand somewhere."""
    # one dive only (every new dive rebuilds the whole cave, which runs the test browser out of memory)
    err = page.evaluate("""(() => { try {
      if (!window.__started) { __debug.start({seed: 7}); window.__started = true; } else { __debug.TU.player.debug.resetPlayer(); }
      __debug.TU.player.debug.giveTape(3, 1); __debug.teleport(%r, %s); __debug.sim(0.6); return null;
    } catch (e) { return String(e && e.stack || e); } })()""" % (where, opts))
    if err:
        print("  fresh() error:", err[:900])
        raise RuntimeError("fresh failed: " + err.split("\n")[0])
    n = page.evaluate(PATCH_INSTANCES)
    if n:
        print("  (test workaround: gave %d instanced meshes white instance colors, see REQUESTS-C.md)" % n)


def main():
    os.makedirs(SHOTS, exist_ok=True)
    httpd = RT.serve()
    errors = []
    # Creatures are left out to save memory (the test machine is shared); the core.js stubs stand in,
    # and creature attacks are sent as creature:attack events.
    url = "http://127.0.0.1:%d/?drop=creatures-lib,creatures-models,creatures,creatures-finds" % RT.PORT
    t0 = time.time()
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"])
        page = RT.new_page(browser, errors, "[player]", viewport={"width": 880, "height": 528})
        page.goto(url)
        page.wait_for_function("window.__debug !== undefined", timeout=120000)
        page.wait_for_timeout(500)
        page.evaluate(STOP_LOOP)
        D = "__debug.TU.player.debug"

        def step(name):
            return (not FILTER) or FILTER in name

        def s_hands_idle(page):
            print("hands idle / stroke")
            fresh(page, "mid")
            check(page.evaluate("__debug.TU.fx.lensActive()"), "lens pass (post-processing) is running")
            check(page.evaluate("__debug.TU.fx.handScene.children.length") > 10, "hand scene has meshes")
            shot(page, "p01_hands_idle.png")
            page.evaluate("__debug.sim(1.1, ['KeyW']); __debug.sim(0.25, ['KeyW'])")
            check(ps(page)["mode"] == "swim", "mode swim in open water")
            shot(page, "p02_hands_stroke.png")

        def s_hands_inflate(page):
            print("inflator to the mouth")
            fresh(page, "mid")
            page.evaluate("__debug.TU.player.input.keys.KeyB = true; __debug.sim(0.8); ")
            shot(page, "p03_hands_inflate.png")
            page.evaluate("__debug.TU.player.input.keys.KeyB = false; __debug.sim(0.6)")

        def s_hands_wrist(page):
            print("wrist computer")
            fresh(page, "mid")
            page.evaluate(D + ".setWristRaised(true); __debug.sim(0.8)")
            shot(page, "p04_hands_wrist.png")
            page.evaluate(D + ".setWristRaised(false); __debug.sim(0.3)")

        def s_bleed_tape(page):
            print("cut, bleeding, tape")
            fresh(page, "mid")
            page.evaluate(D + ".forceCut(0.8); __debug.sim(1.6)")
            st = ps(page)
            check(st["bleed"] > 0.5 and st["health"] < 100, "a cut bleeds and costs health (%s)" % st["bleed"])
            check(page.evaluate("__debug.TU.player.state.bloodMask") > 0.3, "blood on the mask")
            shot(page, "p05_bleeding.png")
            page.evaluate(D + ".press('Digit1'); __debug.sim(0.7)")
            check(ps(page)["tape"] >= 0, "taping animation running")
            shot(page, "p06_taping.png")
            page.evaluate("__debug.sim(1.2)")
            st = ps(page)
            check(st["bleed"] == 0 and "cut(duct)" in st["injuries"], "duct tape stops the bleeding %s" % st["injuries"])
            check(st["inv"]["tape"] == 2, "one duct tape used")
            page.evaluate(D + ".forceCut(0.5); __debug.sim(0.3);" + D + ".press('Digit2'); __debug.sim(2)")
            st = ps(page)
            check("cut(flex)" in st["injuries"] and st["inv"]["flex"] == 0, "Flex Tape works %s" % st["injuries"])
            shot(page, "p07_taped_arm.png")

        def s_grab_current(page):
            print("grab rock and current tug of war")
            fresh(page, "mid")
            wd = page.evaluate(D + ".grabWall()")
            page.evaluate("__debug.sim(0.4)")
            st = ps(page)
            check(st["grab"], "holding E near rock grabs it (wall %s m)" % wd)
            shot(page, "p08_grab_rock.png")
            page.evaluate(D + ".forceCurrent(2.3, 8); __debug.sim(0.4)")
            st = ps(page)
            check(st["caught"] and st["tug"] is not None, "strong current starts the tug of war %s" % st["tug"])
            shot(page, "p09_tug_of_war.png")
            # tap A D A D quickly
            for i in range(22):
                page.evaluate(D + ".press(%r); __debug.sim(0.12)" % ("KeyA" if i % 2 == 0 else "KeyD"))
            st = ps(page)
            check(st["tug"] is None and st["grab"], "pulled free of the current (tug %s grab %s)" % (st["tug"], st["grab"]))
            page.evaluate(D + ".releaseWall();" + D + ".clearCurrent(); __debug.sim(0.3)")
            # now fail: hold on without tapping
            fresh(page, "mid")
            page.evaluate("window.__esc = []; __debug.TU.on('player:currentEscape', e => window.__esc.push(!!(e && e.ok)))")
            err = page.evaluate("(() => { try { " + D + ".grabWall(); __debug.sim(0.2);" + D + ".forceCurrent(2.4, 6); __debug.sim(2.5); return null; } catch (e) { return String(e.stack); } })()")
            if err:
                print("  error:", err[:900])
            esc = page.evaluate("window.__esc")
            check(False in esc, "not tapping: the grip fails and the current takes you (%s)" % esc)
            page.evaluate(D + ".releaseWall(); __debug.sim(1.5)")
            st = ps(page)
            check(st["maskWater"] > 0.05 or st["panic"] > 30, "the current scares you and floods the mask (mask %s panic %s)" % (st["maskWater"], st["panic"]))
            page.evaluate(D + ".clearCurrent()")

        def s_mask(page):
            print("mask flood and clearing")
            fresh(page, "mid")
            page.evaluate(D + ".forceMaskFlood(0.55); __debug.TU.player.state.tYaw += 0.6; __debug.sim(0.35)")
            check(page.evaluate("__debug.TU.player.state.maskFlooded"), "mask flooded")
            shot(page, "p10_mask_flooded.png")
            air0 = page.evaluate("__debug.TU.player.state.airTotal")
            page.evaluate("__debug.TU.player.input.keys.KeyM = true; __debug.sim(0.6)")
            shot(page, "p11_mask_clearing.png")
            page.evaluate("__debug.sim(1.2); __debug.TU.player.input.keys.KeyM = false; __debug.sim(0.2)")
            st = ps(page)
            air1 = page.evaluate("__debug.TU.player.state.airTotal")
            check(st["maskWater"] < 0.1, "holding M clears the mask (%s)" % st["maskWater"])
            check(air0 - air1 > 3, "clearing the mask costs air (%.1f bar)" % (air0 - air1))

        def s_squeeze(page):
            print("squeeze")
            fresh(page, "squeeze")
            page.evaluate("__debug.sim(1.5, ['KeyW'])")
            st = ps(page)
            check(st["mode"] == "squeeze", "squeeze mode in the squeeze (%s)" % st["mode"])
            check(st["stuck"] > 0.1, "you get stuck pushing (%s)" % st["stuck"])
            for i in range(6):
                page.evaluate("__debug.TU.player.input.keys.KeyW = true;" + D + ".press(%r); __debug.sim(0.1)" % ("KeyA" if i % 2 == 0 else "KeyD"))
            page.evaluate("__debug.TU.player.input.keys.KeyW = false")
            check(ps(page)["stuck"] < st["stuck"], "wiggling A / D frees you")
            page.evaluate("__debug.sim(0.4, ['KeyW'])")
            shot(page, "p12_squeeze.png")

        def s_crawl(page):
            print("crawl")
            fresh(page, "mid", "{low: true}")
            page.evaluate(D + ".setMode('crawl'); __debug.sim(2.3, ['KeyW']); __debug.sim(0.35, ['KeyW'])")
            check(ps(page)["mode"] == "crawl", "crawl mode")
            shot(page, "p13_crawl_pull.png")
            page.evaluate(D + ".setMode(null)")

        def s_walk(page):
            print("dry walking")
            fresh(page, "mid")
            # look for a real dry spot in the cave (agent A's dry chambers); else run dry physics where we are
            spot = page.evaluate("""(() => { const TU = __debug.TU, cs = TU.cave.features.dryChambers || [];
              for (const c of cs) for (let dx = -6; dx <= 6; dx += 1.5) for (let dz = -6; dz <= 6; dz += 1.5) for (let dy = 0.4; dy <= 3; dy += 0.4) {
                const p = new THREE.Vector3(c.pos.x + dx, c.floorY + dy, c.pos.z + dz);
                if (TU.cave.isDry(p) && TU.cave.contains(p, 0.3)) { TU.player.teleport(p); return [p.x, p.y, p.z]; } }
              return null; })()""")
            if not spot:
                page.evaluate(D + ".setMode('walk')")
            page.evaluate("__debug.sim(1.5)")
            st = ps(page)
            check(st["dry"] and st["mode"] in ("walk", "crawl"), "dry land physics (%s; real dry spot in the cave: %s)" % (st["mode"], bool(spot)))
            check(st["grounded"], "standing on the floor")
            page.evaluate("__debug.sim(1.2, ['KeyW'])")
            shot(page, "p14_dry_walk.png")
            page.evaluate("__debug.sim(0.05, ['Space'])")
            check(not ps(page)["grounded"], "Space jumps")
            page.evaluate("__debug.sim(1.5)")
            check(ps(page)["grounded"], "landed again")
            page.evaluate(D + ".setMode(null); __debug.sim(0.2)")

        def s_ragdoll(page):
            print("ragdoll fall")
            fresh(page, "mid")
            h0 = page.evaluate("__debug.TU.player.state.health")
            page.evaluate(D + ".forceFall(9); __debug.sim(0.35)")
            st = ps(page)
            check(st["mode"] == "ragdoll" and st["rag"], "a big fall ragdolls you (%s)" % st["rag"])
            check(st["health"] < h0 - 20 and any(j.startswith("break") for j in st["injuries"]), "fall damage and a broken bone %s" % st["injuries"])
            check(st["kickMul"] < 1, "injury slows your kicks (%s)" % st["kickMul"])
            shot(page, "p15_ragdoll_tumble.png")
            page.evaluate("__debug.sim(1.5)")
            shot(page, "p16_ragdoll_slumped.png")
            page.evaluate("__debug.sim(3)")
            st = ps(page)
            check(st["mode"] != "ragdoll", "you get back up (%s)" % st["mode"])

        def s_narcosis(page):
            print("narcosis")
            fresh(page, "deep")
            page.evaluate("__debug.lookAtCore(); __debug.sim(1.5)")
            st = ps(page)
            check(st["narcosis"] > 0.6, "deep water narcosis (%s)" % st["narcosis"])
            check(st["staminaMax"] < 100, "depth lowers max stamina (%s)" % st["staminaMax"])
            shot(page, "p17_narcosis.png")

        def s_hints(page):
            print("glass air hints")
            fresh(page, "mid")
            ok = page.evaluate("""(() => {
              const TU = __debug.TU, F = TU.cave.features;
              const list = (F.airHints && F.airHints.length) ? F.airHints.map(h => ({ pos: h.pos, to: h.target || h.to || h.pos }))
                : (F.airPockets || []).map(p => ({ pos: p.hintPos, to: p.pos }));
              for (const h of list) {
                const hp = new THREE.Vector3(h.pos.x, h.pos.y, h.pos.z), back = hp.clone().sub(new THREE.Vector3(h.to.x, h.to.y, h.to.z));
                if (back.lengthSq() < 1e-4) back.set(0, -1, 0); back.normalize();
                for (const d of [12, 10, 14, 9, 16]) {
                  const cam = hp.clone().addScaledVector(back, d);
                  if (!TU.cave.contains(cam, 0.4) || TU.cave.isDry(cam)) continue;
                  const dir = hp.clone().sub(cam).normalize();
                  if (TU.cave.raycast(cam, dir, d) < d - 0.6) continue;
                  TU.player.teleport(cam); __debug.lookAt(hp); return d;
                }
              }
              return false; })()""")
            page.evaluate("__debug.sim(2.5)")
            page.evaluate("__debug.render()")
            n = page.evaluate("__debug.TU.fx.hintCount()")
            print("  hint info:", page.evaluate("JSON.stringify(__debug.TU.fx.hintInfo())"), page.evaluate("JSON.stringify([__debug.TU.player.state.surfaced, __debug.TU.player.state.dry, __debug.TU.player.state.mode])"))
            check(ok and n > 0, "glassy hints visible at medium range (%s shapes, %s m away)" % (n, ok))
            shot(page, "p18_glass_air_hints.png")

        def s_lantern(page):
            print("lantern when the light dies")
            fresh(page, "deep")
            page.evaluate(D + ".giveLantern(3);" + D + ".setBattery(0); __debug.sim(1)")
            st = ps(page)
            check(st["lantern"] and st["lanternLevel"] > 0, "the lantern comes out when the flashlight dies (%s)" % st["lanternLevel"])
            shot(page, "p19_lantern.png")

        def s_headlamp(page):
            print("mask headlamp")
            fresh(page, "mid")
            page.evaluate(D + ".setHeadlamp(true); __debug.sim(0.8)")
            check(ps(page)["headlamp"], "headlamp variant")
            shot(page, "p20_headlamp.png")
            page.evaluate(D + ".setHeadlamp(null)")

        def s_tanks(page):
            print("drop and pick up a tank")
            fresh(page, "mid")
            st0 = ps(page)
            page.evaluate(D + ".press('KeyG'); __debug.sim(2.5)")
            st = ps(page)
            check(st["carried"] == st0["carried"] - 1 and any(t["dropped"] for t in st["tanks"]), "G drops the spare tank (%s -> %s)" % (st0["carried"], st["carried"]))
            check(st["staminaMax"] > st0["staminaMax"], "lighter: more stamina (%s -> %s)" % (st0["staminaMax"], st["staminaMax"]))
            page.evaluate("""(() => { const P = __debug.TU.player.state, t = P.tanks.find(t => t.dropped);
              const back = new THREE.Vector3(-Math.sin(P.yaw), 0, -Math.cos(P.yaw)).multiplyScalar(-0.9);
              __debug.TU.player.teleport(new THREE.Vector3(t.pos.x + back.x, t.pos.y + 0.75, t.pos.z + back.z));
              __debug.lookAt(t.pos); })()""")
            page.evaluate("__debug.sim(0.3)")
            shot(page, "p21_dropped_tank.png")
            page.evaluate(D + ".press('KeyG'); __debug.sim(0.3)")
            st = ps(page)
            check(st["carried"] == st0["carried"], "G near it picks it back up")

        def s_quake(page):
            print("quake and shock")
            fresh(page, "mid")
            page.evaluate(D + ".forceQuake(1.6, 3); __debug.sim(0.9)")
            st = ps(page)
            check(st["panic"] > 5, "quake raises panic (%s)" % st["panic"])
            shot(page, "p22_quake_debris.png")
            page.evaluate(D + ".forceShock(1); __debug.sim(0.2)")
            shot(page, "p23_eel_shock.png")
            page.evaluate("__debug.TU.emit('creature:attack', {kind: 'bite', severity: 0.7, panic: 45, gore: true}); __debug.sim(0.5)")
            check(any(j.startswith("cut") for j in ps(page)["injuries"]), "a bite (creature:attack) cuts you")

        def s_measure(page):
            print("measuring tape and catching")
            fresh(page, "mid")
            page.evaluate("__debug.sim(1.0, ['KeyT'])")
            page.evaluate(D + ".press('KeyE'); __debug.sim(0.2)")
            check(True, "T and E do not throw (creatures are stubbed in this test)")

        def s_audio(page):
            print("audio recipes")
            names = page.evaluate("__debug.TU.audio.unlock(); __debug.TU.audio.sounds()")
            page.evaluate("(() => { const A = __debug.TU.audio; A.sounds().forEach(n => A.play(n, {strength: 0.6, severity: 0.5, dur: 1.2, panic: 0.7, surfaced: false})); A.play('inhale', {dur: 1, surfaced: true}); A.play('exhale', {dur: 1, surfaced: true}); })()")
            page.evaluate("__debug.sim(0.5)")
            check(len(names) >= 25, "%d synthesized sounds play without errors" % len(names))

        steps = [(n[2:], f) for n, f in list(locals().items()) if n.startswith('s_') and callable(f)]
        holder = {"page": page}

        def relaunch():
            try:
                holder["page"].close()
            except Exception:
                pass
            pg = RT.new_page(browser, errors, "[player]", viewport={"width": 880, "height": 528})
            pg.goto(url)
            pg.wait_for_function("window.__debug !== undefined", timeout=120000)
            pg.evaluate(STOP_LOOP)
            holder["page"] = pg

        crashes = []
        for name, fn in steps:
            if not step(name):
                continue
            for attempt in range(2):
                try:
                    fn(holder["page"])
                    break
                except Exception as e:
                    msg = str(e).split("\n")[0]
                    if "crashed" in msg or "closed" in msg:
                        # the shared test machine ran out of memory and killed the page: start over
                        crashes.append(name)
                        print("  (browser page was killed during %s: %s; relaunching)" % (name, msg[:80]))
                        errors[:] = [x for x in errors if "crash" not in x.lower()]
                        relaunch()
                        continue
                    raise
            else:
                check(False, "step %s could not finish (page killed twice)" % name)
        page = holder["page"]
        page.close()
        browser.close()
    httpd.shutdown()
    fails = [w for ok, w in results if not ok]
    print("\n%d checks, %d failed, %d console errors, %.0fs" % (len(results), len(fails), len(errors), time.time() - t0))
    for f in fails:
        print("  FAILED:", f)
    for e in errors:
        print("  ERROR:", e)
    sys.exit(1 if (fails or errors) else 0)


if __name__ == "__main__":
    main()
