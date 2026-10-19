"""Full play-through test for Tied Under (the integrated game).

Walks the whole loop the way a player would, with real clicks where it matters:
  title -> story -> "Yes, obviously" (skips the tutorial, pays the $150) -> camp
  -> the practice hole (tutorial flag, Marv tops up air, a death is a rescue) -> back to camp
  -> a purchase at the Gear Tent (tank, mask, lantern) -> loadout (heavy tanks, tight seal mask)
  -> a speargun and glow sticks from the Gear Tent, the speargun picked on the Loadout station
  -> an easy dive (checks that the loadout and upgrades really changed the diver; a new diver's first
     dive has no predators near the entrance), the light budget, shoot and kill a predator with the
     speargun, throw a glow stick (key 3), the light budget again
  -> debug teleport to the bottom -> results -> KEEP DIVING (same run, endless, no second win)
  -> one descent: the new segment builds and opens, creatures and predators move in, the Beyond zone
     shows on the HUD, the hologram rebuilds with both rings, the light budget holds
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
  // A/D alternating also struggles free of a predator's hold (the same taps, a different situation).
  const ok = { KeyE: ['interact', 'grab'], KeyA: ['swim', 'tug', 'struggle'], KeyD: ['swim', 'tug', 'struggle'], Digit1: ['ductTape', 'station'] };
  const by = {}, bad = [];
  b.forEach(x => x.keys.forEach(k => { (by[k] = by[k] || []).push(x.action); }));
  Object.keys(by).forEach(k => { const a = by[k]; if (a.length > 1) { const allow = ok[k] || []; if (!a.every(n => allow.includes(n))) bad.push(k + ':' + a.join('+')); } });
  return { bad, n: b.length, keys: Object.keys(by).sort() };
}"""

# Light budget (CONTRACT.md section 12, cfg.lights.budget = 14 counting the ambient light): flashlight spot + bounce,
# lantern, 2 waypoint lights, 2 creature lights, 1 weapon light, 3 glow stick lights, daylight, the cave core light.
# All of them exist from boot (no shader recompiles mid-dive), so the count is the same before and after a throw.
LIGHT_BUDGET = 14
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
        for want in ("Flex Tape", "Duct tape", "measure", "lantern", "mask", "waypoint", "wrist", "slate", "Pause", "camp station", "tank", "squeeze",
                     "glow stick", "Fire or attack", "aim", "Reload", "Draw or put away", "knife", "kick free"):
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
        # a speargun with one spear pack, and glow sticks
        page.evaluate("__debug.TU.uiKit.pay(1000, 0)")
        click(page, "#ui-st-shop")
        click(page, "[data-wbuy='speargun']")
        click(page, "[data-wammo='speargun']")
        click(page, "[data-con='glowSticks']")
        w = page.evaluate("__debug.TU.save.data.weapons")
        check(w["owned"].get("speargun") and w["ammo"]["spears"] >= 1, "speargun and a spear bought %r" % w)

        # ---- loadout
        click(page, "#ui-st-loadout")
        click(page, ".ui-tank[data-tank='heavy']")
        click(page, "[data-mask='tight']")
        click(page, "[data-wpn='speargun']")
        check(page.evaluate("__debug.TU.weapons.selected()") == "speargun", "speargun picked on the Loadout station")
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
        check(lt["n"] <= LIGHT_BUDGET and lt["sh"] <= 1, "at most %d lights (incl. the glow stick and weapon pools), shadows only from the flashlight" % LIGHT_BUDGET)
        check(page.evaluate("__debug.TU.cfg.lights.budget") == LIGHT_BUDGET, "cfg.lights.budget matches the test")
        pz = page.evaluate("__debug.TU.creatures.list().filter(c => c.sp.predator && __debug.TU.cave.zoneAt(c.pos).index <= 1).length")
        check(pz == 0, "a new diver's first easy dive: no predators in the Mouth and the Throat (%d)" % pz)
        gear = page.evaluate("[__debug.TU.weapons.current(), __debug.TU.player.inventory.glowSticks, __debug.TU.save.data.loadout.glowSticks, __debug.TU.uiKit.data().stock.glowSticks]")
        check(gear[0] == "speargun" and gear[1] == 4, "the speargun and the 4 bought glow sticks came along (the tent puts them in the loadout) %r" % gear)

        # ---- the speargun against a real predator (a big barracuda, held still so the shot is repeatable)
        kill = page.evaluate("""() => { const T = __debug.TU, C = T.creatures, P = T.player.state;
          __debug.teleport('mid', {}); __debug.sim(0.3);
          let best = 0, by = P.yaw;
          for (let i = 0; i < 16; i++) { const y = i / 16 * Math.PI * 2, d = new THREE.Vector3(-Math.sin(y), 0, -Math.cos(y)); const r = T.cave.raycast(P.pos, d, 30); if (r > best) { best = r; by = y; } }
          T.player.look(by, 0); __debug.sim(0.3);
          C.list().forEach(c => { if (c.sp.predator && c.pos.distanceTo(P.pos) < 60) c.gone = true; });
          window.__kills = []; T.on('creature:killed', e => window.__kills.push(e.speciesId + ':' + e.by));
          const b = C.debugSpawnPredator('pale_barracuda', Math.min(4, best - 1.2), { still: true, n: 1, sizeU: 1 });
          if (!b) return { err: 'no spawn' };
          const c = C.get(b.id); __debug.lookAt(c.pos); __debug.sim(0.1);
          T.weapons.draw(); __debug.sim(1.2);
          T.weapons.debug.setAim(true); __debug.sim(0.6); __debug.lookAt(c.pos); __debug.sim(0.05);
          const fired = T.weapons.fire(); __debug.sim(0.8); T.weapons.debug.setAim(false);
          const i = C.predatorInfo(b.id);
          return { fired, best: +best.toFixed(1), hp: i ? i.hp : null, maxHp: b.hp, dead: i ? i.dead : null, kills: window.__kills.slice(), spears: T.weapons.ammoOf ? T.weapons.ammoOf('speargun') : null };
        }""")
        print("  speargun vs barracuda:", kill)
        check(kill.get("fired") and kill.get("dead") and any(k.startswith("pale_barracuda") for k in kill.get("kills", [])), "the speargun shoots and kills a predator")
        snap(page, "03b_speargun_kill")

        # ---- a glow stick (key 3, real key press) and the light budget with it lit
        page.evaluate("(() => { __debug.TU.weapons.holster(true); window.__glow = []; __debug.TU.on('glowstick:throw', e => window.__glow.push(e.left)); })()")
        page.keyboard.press("Digit3")
        gs = page.evaluate("__debug.sim(2); [window.__glow, __debug.TU.glowsticks.count(), __debug.TU.player.inventory.glowSticks, __debug.TU.glowsticks.lights().filter(L => L.owner).length]")
        print("  glow stick:", gs)
        check(len(gs[0]) == 1 and gs[1] == 1 and gs[2] == 3 and gs[3] == 1, "key 3 throws a glow stick, it is used up and gets a pooled light")
        lt = page.evaluate(LIGHTS)
        check(lt["n"] <= LIGHT_BUDGET, "light budget with a lit glow stick and the weapon light: %d <= %d" % (lt["n"], LIGHT_BUDGET))
        snap(page, "03c_glow_stick")
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
        # ---- one descent into a new segment
        t1 = time.time()
        while page.evaluate("__debug.TU.cave.endless.building()") and time.time() - t1 < 300:
            page.evaluate("__debug.sim(0.5)")
            page.wait_for_timeout(100)
        check(not page.evaluate("__debug.TU.cave.endless.building()") and page.evaluate("__debug.TU.cave.features.bottom.segment") == 1, "the new segment built and opened (%.0f s)" % (time.time() - t1))
        seg = page.evaluate("""() => { const T = __debug.TU, C = T.creatures;
          __debug.teleport('segStart', {}); __debug.sim(1);
          const z = T.cave.zoneAt(T.player.state.pos), list = C.list().filter(c => !c.gone && c.seg === 1);
          T.uiKit.wrist.set(true); __debug.sim(0.3); const holo = T.uiKit.wrist.info(); T.uiKit.wrist.set(false);
          return { zone: z.index, name: z.name, hud: document.getElementById('ui-zonen').textContent, stats: C.segmentStats(), inSeg: list.length,
                   preds: list.filter(c => c.sp.predator).length, holo: holo, air: T.player.state.airRate, depth: T.player.state.depth }; }""")
        print("  new segment:", seg)
        check(seg["zone"] >= 5 and seg["hud"] == seg["name"].upper(), "the HUD shows the Beyond zone (%s)" % seg["hud"])
        check(seg["stats"]["spawned"] > 0 and seg["inSeg"] > 0 and seg["preds"] >= 1, "creatures and predators moved into the new segment")
        check(seg["holo"]["built"] and seg["holo"]["rings"] >= 2, "the hologram rebuilt with both Ancient Rings")
        lt = page.evaluate(LIGHTS)
        check(lt["n"] <= LIGHT_BUDGET, "light budget in the endless segment: %d <= %d" % (lt["n"], LIGHT_BUDGET))
        dm = page.evaluate("[__debug.TU.cfg.air.depthMax, Math.min(1 + __debug.TU.player.state.depth / __debug.TU.cfg.air.depthPer, __debug.TU.cfg.air.depthMax)]")
        check(dm[0] == 2.5 and dm[1] <= 2.5, "the depth air factor is capped at 2.5x (%r at %.0f m)" % (dm, seg["depth"]))
        snap(page, "04b_new_segment")
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
