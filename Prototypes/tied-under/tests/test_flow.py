"""Full play-through test for Tied Under (the integrated game).

Walks the whole loop the way a player would, with real clicks where it matters:
  title -> story -> "Yes, obviously" (skips the tutorial, pays the $150) -> camp
  -> the practice hole (tutorial flag, Marv tops up air, a death is a rescue) -> back to camp
  -> a purchase at the Gear Tent (tank, mask, lantern) -> loadout (heavy tanks, tight seal mask)
  -> an easy dive (checks that the loadout and upgrades really changed the diver)
  -> debug teleport to the bottom -> results -> KEEP DIVING (same cave, endless, no second win)
  -> call the dive (an endless finish) -> back to camp
  -> deaths: drowned, bled out, crushed by a rock
  -> reload the page: money, upgrades, logbook and runs are still there.
Also checks: key bindings do not clash, the Controls screen lists the final keys, the number of
lights in the cave scene, glowworms on dry ceilings, the graphics quality setting, the camp hides
the 3D render, and zero console errors and page errors.

Most of the time the heavy 3D render is switched off (software rendering is very slow in the
sandbox); a few screenshots turn it back on. Screenshots: tests/screens/F_*.png.
Run:  python3 tests/test_flow.py
"""
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import run_test as R  # noqa: E402  (reuse the server and page helpers)

from playwright.sync_api import sync_playwright  # noqa: E402

R.PORT = 8775
SHOTS = R.SHOTS


def fast(page, on):
    """Skip (on) or restore (off) the heavy cave render."""
    page.evaluate("""(on) => { const F = __debug.TU.fx;
      if (on && !F.__r) { F.__r = F.render; F.render = () => {}; }
      if (!on && F.__r) { F.render = F.__r; delete F.__r; } }""", on)


def snap(page, name):
    fast(page, False)
    page.evaluate("__debug.render()")
    page.screenshot(path=os.path.join(SHOTS, "F_" + name + ".png"))
    fast(page, True)


def click(page, sel):
    """Click a visible element through the DOM (does not wait for a slow 3D frame)."""
    page.wait_for_selector(sel, state="visible", timeout=60000)
    page.evaluate("(sel) => document.querySelector(sel).click()", sel)


def state(page):
    return page.evaluate("__debug.TU.state.current")


def check(cond, what):
    print(("  ok   " if cond else "  FAIL ") + what)
    if not cond:
        raise AssertionError(what)


KEY_CHECK = """() => {
  // Every key may do only one thing per state. Allowed pairs: E tap (use) and E hold (grab),
  // A/D kick and A/D alternating (tug of war or wiggle), digits 1-2 tape (dive) vs camp stations (camp).
  const b = __debug.TU.player.bindings.filter(x => typeof x === 'object');
  const ok = { KeyE: ['interact', 'grab'], KeyA: ['swim', 'tug'], KeyD: ['swim', 'tug'], Digit1: ['ductTape', 'station'] };
  const by = {}, bad = [];
  b.forEach(x => x.keys.forEach(k => { (by[k] = by[k] || []).push(x.action); }));
  Object.keys(by).forEach(k => { const a = by[k]; if (a.length > 1) { const allow = ok[k] || []; if (!a.every(n => allow.includes(n))) bad.push(k + ':' + a.join('+')); } });
  return { bad, n: b.length, keys: Object.keys(by).sort() };
}"""

LIGHTS = """() => { let n = 0, sh = 0; __debug.TU.scene.traverse(o => { if (o.isLight) { n++; if (o.castShadow) sh++; } }); return { n, sh }; }"""


def main():
    os.makedirs(SHOTS, exist_ok=True)
    httpd = R.serve()
    errors = []
    url = "http://127.0.0.1:%d/" % R.PORT
    t0 = time.time()
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"])
        context = browser.new_context(viewport={"width": 1280, "height": 760})
        page = context.new_page()
        page.set_default_timeout(240000)
        import re
        page.route(re.compile(r"https://fonts\.(googleapis|gstatic)\.com/.*"), lambda r: r.fulfill(status=200, content_type="text/css", body=""))
        page.on("console", lambda m: errors.append("console.%s: %s" % (m.type, m.text)) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append("pageerror: %s" % e))
        page.on("requestfailed", lambda r: errors.append("request failed: %s" % r.url))

        page.goto(url)
        page.wait_for_function("window.__debug !== undefined", timeout=180000)
        print("boot %.1fs" % (time.time() - t0))
        check(state(page) == "title", "boots to the title")
        check(page.evaluate("__debug.disabled().length") == 0, "no module was switched off at boot")
        check(page.evaluate("getComputedStyle(document.getElementById('boot-err')).display") == "none", "no boot error shown")
        page.wait_for_timeout(600)
        snap(page, "01_title")
        fast(page, True)

        # ---- keys and the Controls screen
        kc = page.evaluate(KEY_CHECK)
        print("  bindings:", kc["n"], "keys:", " ".join(kc["keys"]))
        check(not kc["bad"], "no key does two things in one state %r" % kc["bad"])
        click(page, "#ui-btn-controls")
        txt = page.evaluate("document.getElementById('ui-set-body').innerText")
        for want in ("Flex Tape", "Duct tape", "measure", "lantern", "mask", "waypoint", "wrist", "slate", "Pause", "camp station", "tank", "squeeze"):
            check(want.lower() in txt.lower(), "controls screen lists: " + want)
        click(page, "#ui-btn-set-close")

        # ---- graphics quality option
        click(page, "#ui-btn-settings")
        check(page.query_selector("[data-gfx='low']") is not None, "settings show the graphics quality option")
        click(page, "[data-gfx='medium']")
        q = page.evaluate("__debug.TU.fx.quality()")
        check(q["name"] == "medium" and page.evaluate("__debug.TU.save.data.settings.graphics") == "medium", "graphics set to Medium and saved %r" % q)
        click(page, "[data-gfx='high']")
        click(page, "#ui-btn-set-close")

        # ---- story -> skip the tutorial -> camp
        click(page, "#ui-btn-start")
        check(page.evaluate("__debug.TU.ui.coversScreen()"), "the story covers the 3D view (render skipped)")
        click(page, "#ui-st-skip")
        click(page, "#ui-st-yes")
        check(state(page) == "loadout", "story ends in Sump Camp")
        check(page.evaluate("__debug.TU.save.data.money.cash") == 150, "veterans get the $150 anyway")
        check(page.evaluate("__debug.TU.ui.coversScreen()"), "the camp covers the 3D view (render skipped)")

        # ---- the practice hole (tutorial flag)
        click(page, "#ui-st-dive")
        click(page, "#ui-btn-practice")
        st = page.evaluate("__debug.sim(0.5)")
        check(st["state"] == "dive" and st["tutorial"], "practice hole runs in 'dive' with run.tutorial set")
        page.keyboard.down("KeyW")
        page.evaluate("__debug.sim(0.4)")
        check(page.evaluate("__debug.TU.player.input.keys.KeyW") is True, "keyboard input works in the tutorial")
        page.keyboard.up("KeyW")
        st = page.evaluate("__debug.setAir(0, true); __debug.sim(7)")
        check(st["state"] == "dive" and st["airTotal"] > 50, "no drowning in the practice hole (Marv tops up air)")
        page.evaluate("__debug.TU.emit('player:drown', {})")
        check(state(page) == "dive", "a death in the tutorial is a rescue, not the end")
        page.keyboard.press("Escape")
        check(state(page) == "paused", "Esc pauses")
        click(page, "#ui-btn-quit")
        check(state(page) == "loadout", "Back to camp from the tutorial")
        check(page.evaluate("__debug.TU.save.data.progress.runs") == 0, "the tutorial is not recorded as a dive")

        # ---- a purchase at the Gear Tent
        page.evaluate("__debug.TU.uiKit.pay(2000, 0)")
        click(page, "#ui-st-shop")
        cash0 = page.evaluate("__debug.TU.save.data.money.cash")
        click(page, "[data-buy='tank']")
        click(page, "[data-buy='mask']")
        click(page, "[data-buy='lantern']")
        click(page, "[data-buy='stamina']")
        up = page.evaluate("__debug.TU.save.data.upgrades")
        cash1 = page.evaluate("__debug.TU.save.data.money.cash")
        print("  upgrades:", up, "cash", cash0, "->", cash1)
        check(up["tank"] == 2 and up["mask"] == 2 and up["lantern"] == 1 and up["stamina"] == 2, "upgrades bought")
        check(cash1 == cash0 - 300 - 400 - 400 - 250, "money paid for them")
        snap(page, "02_camp_shop")

        # ---- loadout
        click(page, "#ui-st-loadout")
        click(page, ".ui-tank[data-tank='heavy']")
        click(page, "[data-mask='tight']")
        lo = page.evaluate("__debug.TU.save.data.loadout")
        check(lo["tank"] == "heavy" and lo["mask"] == "tight" and lo["lantern"] is True, "loadout saved %r" % {k: lo[k] for k in ("tank", "mask", "lantern")})

        # ---- an easy dive
        click(page, "#ui-st-dive")
        click(page, ".ui-diff[data-diff='easy']")
        click(page, "#ui-btn-dive")
        st = page.evaluate("__debug.sim(0.3)")
        check(st["state"] == "dive" and page.evaluate("__debug.TU.run.difficulty") == "easy", "easy dive started")
        check(not page.evaluate("__debug.TU.ui.coversScreen()"), "the dive is rendered")
        d = page.evaluate("""() => { const T = __debug.TU, P = T.player.state, inv = T.player.inventory;
          return { tanks: P.tanks.length, bar: P.tanks[0].max, stMax: P.staminaMax, lantern: inv.lantern && inv.lantern.slots, fov: T.camera.fov, base: T.cfg.swim.fov, tape: inv.tape }; }""")
        print("  diver:", d)
        check(d["tanks"] == 3, "heavy loadout gives 3 tanks")
        check(abs(d["bar"] - 220) < 0.01, "tank upgrade level 2 gives 220 bar per tank")
        check(abs(d["stMax"] - 110 * 0.8) < 2.5, "stamina upgrade (110) times the heavy weight (0.8)")
        check(d["lantern"] == 2, "bought lantern comes along with 2 slots")
        check(abs(d["fov"] - (d["base"] - 4)) < 0.6, "tight seal mask narrows the view by 4 degrees")
        lt = page.evaluate(LIGHTS)
        print("  lights in the cave scene:", lt)
        check(lt["n"] <= 11 and lt["sh"] <= 1, "few dynamic lights, shadows only from the flashlight")
        gw = page.evaluate("""() => { const T = __debug.TU, list = T.creatures.list().filter(c => c.speciesId === 'starlight_glowworm');
          return { n: list.length, dry: list.filter(c => T.cave.isDry(c.pos.clone().add(new THREE.Vector3(0, -0.15, 0)))).length, chambers: (T.cave.features.dryChambers || []).length }; }""")
        print("  glowworms:", gw)
        check(gw["n"] == gw["dry"], "every glowworm hangs from a dry ceiling")
        st = page.evaluate("__debug.teleport('entrance'); __debug.sim(3, ['KeyW'])")
        check(st["s"] > 3, "the diver swims down the cave (%.1f m)" % st["s"])
        snap(page, "03_easy_dive")
        # E picks up a find, Q names a waypoint, J opens the slate (UI keys reach the UI)
        page.keyboard.press("q")
        page.wait_for_selector("#ui-wpname.ui-on", timeout=20000)
        page.keyboard.type("Sump")
        page.keyboard.press("Enter")
        names = page.evaluate("__debug.TU.player.waypoints().map(w => w.name)")
        check("Sump" in names, "renaming a waypoint updates the in-cave label %r" % names)
        check(not page.evaluate("__debug.TU.player.input.keys.KeyS"), "typing a name does not move the diver")
        page.keyboard.press("j")
        check(page.evaluate("__debug.TU.uiKit.logbook.slateOpen()"), "J opens the slate")
        page.keyboard.press("j")

        # ---- debug teleport to the bottom -> results
        runs0 = page.evaluate("__debug.TU.save.data.progress.runs")
        cashA = page.evaluate("__debug.TU.save.data.money.cash")
        st = page.evaluate("__debug.teleport('end'); __debug.lookAtCore(); __debug.sim(12, ['KeyW'])")
        check(st["state"] == "results", "touching the thing at the bottom ends the run")
        sm = page.evaluate("__debug.TU.state.data.summary")
        check(sm["won"] and sm["reason"] == "bottom" and sm["difficulty"] == "easy", "summary says bottom, easy")
        check(page.evaluate("__debug.TU.save.data.progress.runs") == runs0 + 1, "the dive is recorded")
        check(page.evaluate("__debug.TU.save.data.money.cash") > cashA, "the bottom pays")
        snap(page, "04_results")

        # ---- KEEP DIVING
        click(page, "#ui-btn-keep")
        st = page.evaluate("__debug.sim(2)")
        check(st["state"] == "dive" and st["endless"], "keep diving: same run, endless")
        check(page.evaluate("__debug.TU.run.seed") == sm["seed"], "keep diving stays in the same cave")
        st = page.evaluate("__debug.lookAtCore(); __debug.sim(3, ['KeyW'])")
        check(st["state"] == "dive", "no second win at the bottom in endless mode")
        page.keyboard.press("Escape")
        check(state(page) == "paused", "Esc pauses the endless leg")
        click(page, "#ui-btn-quit")
        check(state(page) == "results", "calling the dive after the bottom is a good ending")
        check(page.evaluate("__debug.TU.state.data.summary.reason") == "endless", "reason is 'endless'")
        check("PAST THE BOTTOM" in page.evaluate("document.getElementById('ui-results-slate').innerText").upper(), "endless results slate")
        check(page.evaluate("__debug.TU.save.data.progress.runs") == runs0 + 1, "the endless leg is not a second dive")
        snap(page, "05_endless_results")
        click(page, "#ui-btn-camp-results")
        check(state(page) == "loadout", "back to camp")

        # ---- deaths
        click(page, "#ui-st-dive")
        click(page, "#ui-btn-dive")
        st = page.evaluate("__debug.setAir(0.5, true); __debug.sim(6)")
        check(st["state"] == "dead" and page.evaluate("__debug.TU.state.data.summary.reason") == "drowned", "out of air: drowned")
        snap(page, "06_dead_drowned")
        click(page, "#ui-btn-again-dead")
        page.evaluate("__debug.TU.cfg.injury.bleedOut = 6")
        st = page.evaluate("__debug.sim(0.3); __debug.TU.player.debug.forceCut(1); __debug.TU.player.state.health = 6; __debug.sim(2)")
        check(st["state"] == "dive" and page.evaluate("__debug.TU.player.state.bleedOut") > 0, "bleeding at the lowest health counts toward bleeding out")
        page.evaluate("__debug.TU.player.debug.giveTape(1, 0); __debug.TU.player.applyTape('duct'); __debug.sim(2.2)")
        bo = page.evaluate("[__debug.TU.player.state.bleed, __debug.TU.player.inventory.tape]")
        check(bo[0] == 0 and bo[1] == 0 and state(page) == "dive", "tape stops it in time (and is used up) %r" % bo)
        st = page.evaluate("__debug.TU.player.debug.forceCut(1); __debug.TU.player.state.health = 5; __debug.sim(9)")
        check(st["state"] == "dead" and page.evaluate("__debug.TU.state.data.summary.reason") == "bled", "untreated bleeding: bled out")
        page.evaluate("__debug.TU.cfg.injury.bleedOut = __debug.TU.cfgDefaults.injury.bleedOut")
        click(page, "#ui-btn-again-dead")
        st = page.evaluate("__debug.sim(0.3); __debug.TU.emit('cave:rockHit', { r: 0.8, speed: 6, pos: __debug.TU.player.state.pos.clone() }); __debug.sim(0.1)")
        check(st["state"] == "dead" and page.evaluate("__debug.TU.state.data.summary.reason") == "crushed", "a big falling rock: crushed")
        snap(page, "07_dead_crushed")
        click(page, "#ui-btn-camp-dead")
        check(state(page) == "loadout", "camp after a death")

        # ---- persistence across a reload
        before = page.evaluate("""() => { const d = __debug.TU.save.data; return { cash: d.money.cash, up: d.upgrades.tank, runs: d.progress.runs, book: Object.keys(d.logbook.entries).length, mask: d.loadout.mask, gfx: d.settings.graphics }; }""")
        page.reload()
        page.wait_for_function("window.__debug !== undefined", timeout=180000)
        fast(page, True)
        after = page.evaluate("""() => { const d = __debug.TU.save.data; return { cash: d.money.cash, up: d.upgrades.tank, runs: d.progress.runs, book: Object.keys(d.logbook.entries).length, mask: d.loadout.mask, gfx: d.settings.graphics }; }""")
        print("  save before:", before, "after:", after)
        check(before == after, "money, upgrades, runs, logbook and settings persist")
        check(after["runs"] == runs0 + 4, "four real dives recorded (bottom, drowned, bled, crushed)")
        click(page, "#ui-btn-loadout")
        check(state(page) == "loadout", "Continue goes back to camp")

        page.close()
        context.close()

        # ---- boot error handling (fresh pages; these log errors on purpose, so only page errors count)
        def broken_page(file, extra):
            ctx = browser.new_context(viewport={"width": 960, "height": 600})
            pg = ctx.new_page()
            pg.set_default_timeout(240000)
            logs = []
            pg.route(re.compile(r"https://fonts\.(googleapis|gstatic)\.com/.*"), lambda r: r.fulfill(status=200, content_type="text/css", body=""))
            pg.route("**/js/" + file, lambda r: r.fulfill(status=200, content_type="application/javascript",
                                                      body=open(os.path.join(R.ROOT, "js", file), encoding="utf-8").read() + "\n" + extra))
            pg.on("pageerror", lambda e: errors.append("[broken %s] pageerror: %s" % (file, e)))
            pg.on("console", lambda m: logs.append(m.text) if m.type == "error" else None)
            pg.goto(url)
            return ctx, pg, logs
        ctx, pg, logs = broken_page("core.js", "THREE.WebGLRenderer = function () { throw new Error('Error creating WebGL context.'); };")
        pg.wait_for_function("document.getElementById('boot-err').style.display === 'flex'", timeout=120000)
        msg = pg.evaluate("document.getElementById('boot-err').textContent")
        check("WebGL is not available" in msg, "a real WebGL failure says WebGL is not available (%r)" % msg)
        ctx.close()
        ctx, pg, logs = broken_page("creatures.js", "TU.systems.creatures.init = function () { throw new Error('test boom'); };")
        pg.wait_for_function("window.__debug !== undefined", timeout=180000)
        msg = pg.evaluate("document.getElementById('boot-err').textContent")
        check("Something went wrong while loading: test boom (module: creatures)" in msg and "WebGL" not in msg, "a module bug shows the real error and the module (%r)" % msg)
        fast(pg, True)
        st = pg.evaluate("__debug.start({ difficulty: 'easy' }); __debug.sim(1, ['KeyW'])")
        check(st["state"] == "dive" and st["creatures"] == 0 and "creatures" in st["disabled"], "the game keeps running without the broken creatures module")
        ctx.close()
        ctx, pg, logs = broken_page("ui.js", "TU.systems.ui.init = function () { throw new Error('ui boom'); };")
        pg.wait_for_function("document.getElementById('boot-err').style.display === 'flex'", timeout=180000)
        msg = pg.evaluate("document.getElementById('boot-err').textContent")
        check("Something went wrong while loading: ui boom (module: ui)" in msg, "an essential module failing stops the boot with its error (%r)" % msg)
        ctx.close()
        browser.close()
    httpd.shutdown()
    print("time: %.0fs" % (time.time() - t0))
    print("ERRORS:", len(errors))
    for e in errors:
        print("  ", e)
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    try:
        main()
    except AssertionError as e:
        print("FAILED:", e)
        sys.exit(1)
