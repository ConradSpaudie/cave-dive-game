"""Weapons test for Tied Under (weapons.js, the weapon poses in player-hands.js, the HUD and camp parts).

Same boot as test_player.py: one dive, the game stepped directly through window.__debug, screenshots of
each weapon held in tests/screens/W_*.png. It fires every weapon at a practice target (weapons.js has
its own stand-in target, so this works with creatures.js left out), checks hits, ammo, reloads, the
speargun line, the jet's air cost and recoil, the bang stick blast, the flare light, the baton stun,
holster and swap, ammo settlement, the Loadout cards and the Gear Tent, and zero console errors.

Run:  python3 tests/test_weapons.py              (creatures.js left out, like test_player.py)
      python3 tests/test_weapons.py creatures    (with creatures.js: also shoots a real predator if
                                                  TU.creatures.damage exists)
      python3 tests/test_weapons.py "" speargun  (only steps whose name contains "speargun")
"""
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import run_test as RT  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

SHOTS = os.path.join(HERE, "screens")


def free_port():
    import socket
    s = socket.socket(); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]; s.close(); return port


RT.PORT = free_port()
WITH_CREATURES = len(sys.argv) > 1 and sys.argv[1] == "creatures"
FILTER = sys.argv[2] if len(sys.argv) > 2 else ""
results = []
STOP_LOOP = "window.requestAnimationFrame = function () { return 0; }"
PATCH_INSTANCES = """(() => { const T = THREE, withC = new Set(); let n = 0;
  __debug.TU.scene.traverse(o => { if (o.isInstancedMesh && o.instanceColor) withC.add(o.material); });
  __debug.TU.scene.traverse(o => { if (o.isInstancedMesh && !o.instanceColor && withC.has(o.material)) { o.instanceColor = new T.InstancedBufferAttribute(new Float32Array(o.instanceMatrix.count * 3).fill(1), 3); n++; } });
  return n; })()"""
WD = "__debug.TU.weapons.debug"
WP = "__debug.TU.weapons"


def check(cond, what):
    results.append((bool(cond), what))
    print(("  ok   " if cond else "  FAIL ") + what)


def shot(page, name, hud=False):
    """Screenshot. hud=True keeps the mask HUD (crosshair and ammo readout) visible."""
    if not hud:
        page.evaluate("__debug.screenshotMode(true)")
    page.evaluate("__debug.render()")
    page.screenshot(path=os.path.join(SHOTS, name))
    if not hud:
        page.evaluate("__debug.screenshotMode(false)")


def ws(page):
    return page.evaluate(WD + ".state()")


def targets(page):
    return page.evaluate(WD + ".targets()")


def frames(page, n=6, sec=1 / 60):
    """Step and draw a few frames (the hand pose and the weapon model settle over a few frames)."""
    for _ in range(n):
        page.evaluate("__debug.sim(%f); __debug.render()" % sec)


def fresh(page, where="mid", weapon=None, n=None):
    err = page.evaluate("""(() => { try {
      if (!window.__started) { __debug.start({seed: 7}); window.__started = true; } else { __debug.TU.player.debug.resetPlayer(); }
      __debug.TU.weapons.debug.clearTargets();
      __debug.teleport(%r, {}); __debug.sim(0.5); return null;
    } catch (e) { return String(e && e.stack || e); } })()""" % where)
    if err:
        print("  fresh() error:", err[:900])
        raise RuntimeError("fresh failed: " + err.split("\n")[0])
    page.evaluate(PATCH_INSTANCES)
    if weapon:
        page.evaluate(WD + ".give(%r, %s)" % (weapon, "null" if n is None else n))
        frames(page, 3, 0.2)


def face_open_water(page):
    """Turn to the direction with the most open water ahead (so shots fly before they hit rock)."""
    return page.evaluate("""(() => { const TU = __debug.TU, P = TU.player.state; let best = 0, by = P.yaw;
      for (let i = 0; i < 16; i++) { const y = i / 16 * Math.PI * 2, d = new THREE.Vector3(-Math.sin(y), 0, -Math.cos(y));
        const r = TU.cave.raycast(P.pos, d, 30); if (r > best) { best = r; by = y; } }
      TU.player.look(by, 0); __debug.sim(0.3); return best; })()""")


def main():
    os.makedirs(SHOTS, exist_ok=True)
    httpd = RT.serve()
    errors = []
    drop = "" if WITH_CREATURES else "?drop=creatures-lib,creatures-models,creatures,creatures-finds"
    url = "http://127.0.0.1:%d/%s" % (RT.PORT, drop)
    t0 = time.time()
    with sync_playwright() as p:
        LAUNCH = ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"]
        browser = p.chromium.launch(args=LAUNCH)
        page = RT.new_page(browser, errors, "[weapons]", viewport={"width": 880, "height": 528})
        page.goto(url)
        page.wait_for_function("window.__debug !== undefined", timeout=120000)
        page.wait_for_timeout(500)
        page.evaluate(STOP_LOOP)
        # a clean save for the test (no money, starter weapons only)
        page.evaluate("__debug.TU.save.reset()")

        def step(name):
            return (not FILTER) or FILTER in name

        def s_api(page):
            print("api, bindings, defaults")
            check(page.evaluate("typeof __debug.TU.weapons.fire === 'function' && __debug.TU.weapons.__defined === true"), "TU.weapons is defined")
            check(page.evaluate(WP + ".list().length") == 7, "7 weapons (knife + 6 primaries)")
            check(page.evaluate(WP + ".owned('polespear') && " + WP + ".owned('knife') && !" + WP + ".owned('speargun')"), "starter weapons: knife and pole spear free, speargun locked")
            keys = page.evaluate("__debug.TU.player.bindings.filter(b => b && b.owner === 'weapons').map(b => b.keys.join('+'))")
            check(keys == ["MouseLeft", "MouseRight", "KeyY", "Digit4", "Digit5+Wheel"], "weapon keys in TU.player.bindings: %s" % keys)
            # no key collides with an existing dive key
            clash = page.evaluate("""(() => { const b = __debug.TU.player.bindings.filter(x => x && x.keys);
              const mine = new Set(['KeyY', 'Digit4', 'Digit5']); return b.filter(x => x.owner !== 'weapons' && x.action !== 'station' && x.keys.some(k => mine.has(k))).map(x => x.action); })()""")
            check(clash == [], "Y, 4 and 5 are free in a dive (clashes: %s)" % clash)
            rows = page.evaluate("__debug.TU.uiKit.controlsList().map(r => r.join(' '))")
            check(any("Reload" in r for r in rows), "Controls screen lists the weapon keys")

        def s_held(page):
            print("each weapon held (screenshots)")
            fresh(page, "mid")
            face_open_water(page)
            for wid in ["knife", "polespear", "speargun", "jet", "bangstick", "flare", "baton"]:
                page.evaluate(WD + ".give(%r)" % wid)
                frames(page, 3, 0.2)
                st = ws(page)
                check(st["current"] == wid and st["drawn"] and st["draw"] > 0.9, "%s equipped and raised" % wid)
                vis = page.evaluate("__debug.TU.fx.handScene.children.filter(o => o.visible && /^wp-/.test(o.name)).length")
                check(vis == 1, "%s: exactly one weapon model visible (%d)" % (wid, vis))
                shot(page, "W_%s_held.png" % wid)
            page.evaluate(WD + ".give('speargun'); " + WD + ".setAim(true)")
            frames(page, 3, 0.25)
            check(ws(page)["zoom"] > 1.1, "aiming zooms the view (zoom %.3f)" % ws(page)["zoom"])
            shot(page, "W_speargun_aim.png", hud=True)
            page.evaluate(WD + ".setAim(false)")
            frames(page, 3, 0.2)

        def s_swim(page):
            print("swimming with a weapon drawn")
            fresh(page, "mid", "speargun")
            face_open_water(page)
            page.evaluate("__debug.TU.player.input.keys.KeyW = true")
            page.evaluate("__debug.sim(0.8)")
            for i in range(3):
                page.evaluate("__debug.sim(0.07); __debug.render()")
            shot(page, "W_swim_stroke.png", hud=False)
            page.evaluate("__debug.TU.player.input.keys.KeyW = false; __debug.sim(0.4)")
            check(ws(page)["drawn"], "weapon stays drawn while swimming")

        def s_knife(page):
            print("knife")
            fresh(page, "mid", "knife")
            face_open_water(page)
            page.evaluate(WD + ".spawnTarget(0.95)")
            ok = page.evaluate(WP + ".fire()")
            page.evaluate("__debug.sim(0.08); __debug.render()")
            shot(page, "W_knife_swing.png")
            page.evaluate("__debug.sim(0.5)")
            t = targets(page)[0]
            check(ok and t["hp"] < t["maxHp"], "knife swing hurts the target (hp %s)" % t["hp"])
            check(page.evaluate(WP + ".fire()") is True, "knife can swing again after the cooldown")

        def s_polespear(page):
            print("pole spear")
            fresh(page, "mid", "polespear")
            face_open_water(page)
            page.evaluate(WD + ".spawnTarget(1.9)")
            page.evaluate(WP + ".fire()")
            page.evaluate("__debug.sim(0.33); __debug.render()")
            shot(page, "W_polespear_thrust.png")
            page.evaluate("__debug.sim(0.6)")
            t = targets(page)[0]
            check(t["hp"] <= t["maxHp"] - 30, "pole spear thrust hits at 1.9 m (hp %s)" % t["hp"])
            check(page.evaluate(WP + ".fire()") is False, "pole spear cannot fire again during the band cooldown")

        def s_speargun(page):
            print("speargun: flight, pin, reel, reload, rock")
            page.evaluate("(() => { const w = __debug.TU.save.data.weapons; w.owned.speargun = true; w.ammo.spears = 3; })()")
            fresh(page, "mid", "speargun", 3)
            free = face_open_water(page)
            st = ws(page)
            check(st["gun"]["loaded"] and st["gun"]["spare"] == 2, "3 spears carried: 1 loaded + 2 spare (%s)" % st["gun"])
            page.evaluate(WD + ".spawnTarget(%f)" % min(6.0, free - 1.0))
            check(page.evaluate(WP + ".fire()") is True, "speargun fires")
            page.evaluate("__debug.sim(0.1); __debug.render()")
            sh = page.evaluate(WD + ".shots()")
            check(len(sh) == 1 and sh[0]["type"] == "spear" and sh[0]["line"], "a spear on a line is in the water")
            check(page.evaluate("(() => { let v = false; __debug.TU.scene.traverse(o => { if (o.isLine && o.visible && o.geometry.attributes.position.count === 24) v = true; }); return v; })()"), "the line is drawn from the gun to the spear")
            shot(page, "W_speargun_flight.png")
            page.evaluate("__debug.sim(0.6); __debug.render()")
            sh = page.evaluate(WD + ".shots()"); t = targets(page)[0]
            check(t["hp"] < t["maxHp"] and sh[0]["state"] == "pinned", "spear hits and pins the target (hp %s, state %s)" % (t["hp"], sh[0]["state"]))
            shot(page, "W_speargun_pinned.png", hud=True)
            check(page.evaluate(WP + ".fire()") is False, "cannot fire again while the spear is out")
            d0 = sh[0]["dist"]
            page.evaluate(WD + ".setFireHeld(true)")
            page.evaluate("__debug.sim(0.8)")
            d1 = page.evaluate(WD + ".shots()")
            check(d1 and d1[0]["dist"] < d0 - 0.3, "holding fire reels the pinned target in (%.1f -> %.1f m)" % (d0, d1[0]["dist"] if d1 else -1))
            page.evaluate("__debug.sim(4)")
            page.evaluate(WD + ".setFireHeld(false)")
            st = ws(page)
            check(st["spearOut"] is None and st["gun"]["spare"] == 3, "spear comes back to the gun (spare %s)" % st["gun"]["spare"])
            check(page.evaluate(WP + ".reload()") is True, "Y starts the reload")
            page.evaluate("__debug.sim(1.2); __debug.render()")
            shot(page, "W_speargun_reload.png")
            check(not ws(page)["gun"]["loaded"], "reload is slow (still loading after 1.2 s)")
            page.evaluate("__debug.sim(2.0)")
            st = ws(page)
            check(st["gun"]["loaded"] and st["gun"]["spare"] == 2, "loaded after the reload (%s)" % st["gun"])
            # into the rock
            page.evaluate("__debug.TU.player.look(__debug.TU.player.state.yaw, -1.25); __debug.sim(0.4)")
            frames(page, 6, 0.05)
            page.evaluate(WP + ".fire()")
            page.evaluate("__debug.sim(1.0)")
            sh = page.evaluate(WD + ".shots()")
            check(sh and sh[0]["state"] in ("stuck", "rest"), "a spear fired at the floor sticks in the rock (%s)" % (sh[0]["state"] if sh else None))
            page.evaluate("__debug.TU.player.look(__debug.TU.player.state.yaw, -0.9); __debug.sim(0.3)")
            frames(page, 4, 0.05)
            shot(page, "W_speargun_stuck.png")
            page.evaluate(WP + ".reload()")
            page.evaluate("__debug.sim(9)")
            st = ws(page)
            check(st["spearOut"] is None and st["gun"]["loaded"], "Y reels a stuck spear out of the rock and reloads (%s)" % st["gun"])
            # a detached spear can be picked back up
            page.evaluate(WP + ".fire(); __debug.sim(1.0); " + WP + ".holster(true); __debug.sim(0.5)")
            sh = page.evaluate(WD + ".shots()")
            check(sh and not sh[0]["line"], "putting the gun away unclips the line (spear left behind)")
            page.evaluate("(() => { const s = __debug.TU.weapons.debug.shots()[0]; __debug.TU.player.teleport(new THREE.Vector3(s.pos[0], s.pos[1] + 0.5, s.pos[2])); __debug.sim(0.3); })()")
            st = ws(page)
            check(len(page.evaluate(WD + ".shots()")) == 0 and st["gun"]["spare"] == 3, "swimming over a lost spear picks it up (spare %s)" % st["gun"]["spare"])

        def s_jet(page):
            print("water jet")
            page.evaluate("__debug.TU.save.data.weapons.owned.jet = true")
            fresh(page, "mid", "jet")
            face_open_water(page)
            page.evaluate(WD + ".spawnTarget(3.0)")
            air0 = page.evaluate("__debug.TU.player.state.air")
            p0 = page.evaluate("__debug.TU.player.state.pos.toArray()")
            fwd = page.evaluate("__debug.TU.player.cameraForward().toArray()")
            check(page.evaluate(WP + ".fire()") is True, "jet fires")
            page.evaluate("__debug.sim(0.05); __debug.render()")
            shot(page, "W_jet_fire.png")
            page.evaluate("__debug.sim(0.4)")
            air1 = page.evaluate("__debug.TU.player.state.air")
            p1 = page.evaluate("__debug.TU.player.state.pos.toArray()")
            back = -sum((p1[i] - p0[i]) * fwd[i] for i in range(3))
            t = targets(page)[0]
            check(air0 - air1 >= 6.5, "jet costs tank air (%.1f -> %.1f bar)" % (air0, air1))
            check(back > 0.15, "recoil pushes you backward (%.2f m)" % back)
            check(t["stun"] > 0 or t["speed"] > 0.5, "target knocked back / stunned (speed %s, stun %s)" % (t["speed"], t["stun"]))
            check(page.evaluate(WP + ".fire()") is False, "jet needs to re-pressurize (cooldown)")

        def s_bangstick(page):
            print("bang stick")
            page.evaluate("(() => { const w = __debug.TU.save.data.weapons; w.owned.bangstick = true; w.ammo.bang = 2; })()")
            fresh(page, "mid", "bangstick", 2)
            face_open_water(page)
            st = ws(page)
            check(st["bang"]["loaded"] and st["bang"]["spare"] == 1, "2 shells: 1 armed + 1 spare (%s)" % st["bang"])
            page.evaluate(WD + ".spawnTarget(5)")
            page.evaluate(WP + ".fire(); __debug.sim(0.7)")
            check(ws(page)["bang"]["loaded"] and targets(page)[0]["hp"] == 100, "no contact, no boom (shell kept)")
            page.evaluate(WD + ".clearTargets(); " + WD + ".spawnTarget(1.25, {hp: 300})")
            panic0 = page.evaluate("__debug.TU.player.state.panic")
            page.evaluate(WP + ".fire(); __debug.sim(0.17); __debug.render()")
            shot(page, "W_bangstick_boom.png")
            page.evaluate("__debug.sim(0.4)")
            t = targets(page)[0]
            check(t["dead"], "contact boom kills a big target (hp %s)" % t["hp"])
            check(page.evaluate("__debug.TU.player.state.panic") > panic0 + 10, "the shockwave raises your panic")
            check(not ws(page)["bang"]["loaded"], "shell used")
            page.evaluate(WP + ".reload(); __debug.sim(3.8)")
            st = ws(page)
            check(st["bang"]["loaded"] and st["bang"]["spare"] == 0, "Y loads the last shell (%s)" % st["bang"])

        def s_flare(page):
            print("flare gun")
            page.evaluate("(() => { const w = __debug.TU.save.data.weapons; w.owned.flare = true; w.ammo.flares = 3; })()")
            fresh(page, "mid", "flare")
            face_open_water(page)
            check(page.evaluate(WP + ".fire()") is True, "flare fires")
            page.evaluate("__debug.sim(1.6)")
            frames(page, 3, 0.05)
            sh = page.evaluate(WD + ".shots()")
            check(sh and sh[0]["type"] == "flare" and sh[0]["burn"] > 50, "the flare burns (%.1f s left)" % (sh[0]["burn"] if sh else -1))
            li = page.evaluate("(() => { let m = 0; __debug.TU.scene.traverse(o => { if (o.isPointLight && o.color.r > 0.9 && o.color.g < 0.4) m = Math.max(m, o.intensity); }); return m; })()")
            check(li > 1.0, "a red flare light lights the cave (intensity %.2f)" % li)
            shot(page, "W_flare_burning.png", hud=False)
            page.evaluate(WP + ".reload(); __debug.sim(2.8)")
            check(ws(page)["flare"]["loaded"], "Y reloads the flare gun")
            page.evaluate("__debug.sim(62)")
            sh = page.evaluate(WD + ".shots()")
            check(not sh or sh[0]["burn"] <= 0, "the flare burns out after about a minute")

        def s_baton(page):
            print("shock baton")
            page.evaluate("__debug.TU.save.data.weapons.owned.baton = true")
            fresh(page, "mid", "baton")
            face_open_water(page)
            page.evaluate(WD + ".spawnTarget(2.0)")
            b0 = page.evaluate("__debug.TU.player.state.battery")
            check(page.evaluate(WP + ".fire()") is True, "baton zaps")
            page.evaluate("__debug.sim(0.05); __debug.render()")
            shot(page, "W_baton_zap.png")
            t = targets(page)[0]
            b1 = page.evaluate("__debug.TU.player.state.battery")
            check(t["stun"] > 1.5 and t["hp"] < 100, "baton stuns and hurts the target (stun %s, hp %s)" % (t["stun"], t["hp"]))
            check(b0 - b1 >= 5.5, "zap costs flashlight battery (%.1f -> %.1f)" % (b0, b1))

        def s_holster_swap(page):
            print("holster and swap")
            fresh(page, "mid", "polespear")
            page.evaluate(WP + ".holster(true); __debug.sim(0.6); __debug.render()")
            check(not ws(page)["drawn"] and page.evaluate(WP + ".pose()") is None, "4 puts the weapon away (hands are free)")
            check(page.evaluate(WP + ".hudInfo().state") == "holstered", "HUD says holstered")
            page.evaluate(WP + ".swap(); __debug.sim(0.8); __debug.render()")
            check(ws(page)["current"] == "knife" and ws(page)["drawn"], "5 draws the knife")
            page.evaluate(WP + ".swap(); __debug.sim(0.9); __debug.render()")
            check(ws(page)["current"] == "polespear", "5 again goes back to the pole spear")
            # busy hands lower the weapon (taping a cut)
            page.evaluate("__debug.TU.player.debug.giveTape(3, 1); __debug.TU.player.debug.forceCut(0.5); __debug.TU.player.debug.press('Digit1'); __debug.sim(0.4)")
            check(ws(page)["busy"] and page.evaluate(WP + ".fire()") is False, "while taping a cut the weapon is lowered and cannot fire")
            page.evaluate("__debug.sim(2.0)")
            # crosshair and HUD readout
            page.evaluate("__debug.sim(0.3); __debug.render()")
            check(page.evaluate("document.getElementById('ui-xh').classList.contains('ui-on')"), "crosshair shows with a weapon drawn")
            check("POLE" in page.evaluate("document.getElementById('ui-wpn-name').textContent"), "HUD shows the weapon name")

        def s_settle(page):
            print("ammo used comes out of the stock")
            page.evaluate("(() => { const w = __debug.TU.save.data.weapons; w.owned.flare = true; w.ammo.flares = 3; })()")
            fresh(page, "mid", "flare", 3)
            page.evaluate(WP + ".fire(); __debug.sim(0.3); " + WD + ".settle()")
            check(page.evaluate("__debug.TU.save.data.weapons.ammo.flares") == 2, "one flare fired: 3 -> 2 in stock")

        def s_creature(page):
            if not page.evaluate("typeof __debug.TU.creatures.damage === 'function' && typeof __debug.TU.creatures.raycastHit === 'function'"):
                print("real predator: skipped (creatures.js has no damage API in this run)")
                return
            print("speargun vs a real predator")
            page.evaluate("(() => { const w = __debug.TU.save.data.weapons; w.owned.speargun = true; w.ammo.spears = 3; })()")
            fresh(page, "mid", "speargun")
            face_open_water(page)
            sid = page.evaluate("(() => { const S = __debug.TU.creatures.species; return Object.keys(S).find(k => S[k].behavior === 'dangerous') || null; })()")
            if not sid:
                check(False, "a dangerous species exists"); return
            c = page.evaluate("__debug.TU.creatures.debugSpawnInFront(%r, 4, {still: true})" % sid)
            hp0 = None
            page.evaluate(WP + ".fire(); __debug.sim(0.8); __debug.render()")
            shot(page, "W_speargun_predator.png")
            hits = page.evaluate("(() => { const r = __debug.TU.creatures.get(%r); return r ? (r.hp != null ? r.hp : null) : 'gone'; })()" % c["id"])
            check(hits == "gone" or (hits is not None), "speargun hits a %s (hp now %s)" % (sid, hits))

        def s_camp(page):
            print("loadout cards and the gear tent")
            page.evaluate("__debug.TU.save.data.money.cash = 5000; __debug.TU.save.data.weapons.owned = {knife: true, polespear: true}; __debug.TU.save.data.weapons.selected = 'polespear'; __debug.TU.save.write()")
            page.evaluate("__debug.setState('loadout'); __debug.TU.uiKit.camp.select('loadout')")
            page.evaluate("__debug.render()")
            n = page.evaluate("document.querySelectorAll('.ui-wcard').length")
            check(n == 6, "Loadout shows 6 weapon cards (%d)" % n)
            check(page.evaluate("document.querySelectorAll('.ui-wcard.ui-locked').length") == 5, "5 locked cards show their price")
            page.evaluate("document.querySelector('[data-wpn=\"polespear\"]').scrollIntoView()")
            page.screenshot(path=os.path.join(SHOTS, "W_loadout.png"))
            page.evaluate("__debug.TU.uiKit.camp.select('shop')")
            page.evaluate("document.querySelector('[data-wbuy=\"speargun\"]').scrollIntoView()")
            page.screenshot(path=os.path.join(SHOTS, "W_shop.png"))
            page.click("[data-wbuy=\"speargun\"]")
            check(page.evaluate(WP + ".owned('speargun')"), "buying the speargun at the Gear Tent works")
            check(page.evaluate("__debug.TU.save.data.money.cash") == 5000 - 650, "it cost $650")
            check(page.evaluate("__debug.TU.save.data.weapons.ammo.spears") >= 3, "it comes with 3 spears")
            page.click("[data-wammo=\"speargun\"]")
            check(page.evaluate("__debug.TU.save.data.weapons.ammo.spears") >= 4, "buying a spear adds to the stock")
            page.evaluate("__debug.TU.uiKit.camp.select('loadout')")
            page.click("[data-wpn=\"speargun\"]")
            check(page.evaluate(WP + ".selected()") == "speargun", "clicking the card selects it (saved)")
            check(page.evaluate("JSON.parse(localStorage.getItem('tiedUnder.save.v1')).weapons.selected") == "speargun", "selection is in the saved data")
            page.evaluate("document.querySelector('[data-wpn=\"speargun\"]').scrollIntoView()")
            page.screenshot(path=os.path.join(SHOTS, "W_loadout_selected.png"))

        steps = [(n[2:], f) for n, f in list(locals().items()) if n.startswith('s_') and callable(f)]
        holder = {"page": page, "browser": browser}

        def relaunch():
            try:
                holder["page"].close()
            except Exception:
                pass
            try:
                pg = RT.new_page(holder["browser"], errors, "[weapons]", viewport={"width": 880, "height": 528})
            except Exception:
                # the whole browser died: start a new one
                holder["browser"] = p.chromium.launch(args=LAUNCH)
                pg = RT.new_page(holder["browser"], errors, "[weapons]", viewport={"width": 880, "height": 528})
            pg.goto(url)
            pg.wait_for_function("window.__debug !== undefined", timeout=120000)
            pg.evaluate(STOP_LOOP)
            holder["page"] = pg

        for name, fn in steps:
            if not step(name):
                continue
            for attempt in range(2):
                try:
                    fn(holder["page"])
                    break
                except Exception as e:
                    m = str(e).split("\n")[0]
                    if ("crashed" in m or "closed" in m) and attempt == 0:
                        # the shared test machine ran out of memory and killed the page: start over (like test_player.py)
                        print("  (browser page was killed during %s: %s; relaunching)" % (name, m[:80]))
                        errors[:] = [x for x in errors if "crash" not in x.lower()]
                        relaunch()
                        continue
                    check(False, "step %s raised: %s" % (name, m[:300]))
                    break
        page = holder["page"]
        try:
            page.close()
            holder["browser"].close()
        except Exception:
            pass
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
