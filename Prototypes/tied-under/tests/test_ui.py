"""UI walkthrough test for Tied Under (agent D's screens).

Boots the game the same way as run_test.py (local server, local three.js, swiftshader), then walks
through: title, Marv's story, the practice-dive tutorial, pause + HUD editor, Sump Camp stations
(dive, loadout, locker paint + 3D preview, shop purchase, sell, logbook, contracts, leaderboards),
a dive with HUD, waypoint naming, species toast, wrist hologram (fake mapData if cave.js has none),
the dive slate, damage indicators, results with END RUN / KEEP DIVING, the three death screens,
title settings, and phone-width (390 px) layouts with no horizontal overflow.

Screenshots go to tests/screens/D_*.png. Exit code 0 only with zero console errors.
Run:  python3 tests/test_ui.py
"""
import os
import re
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import run_test as R  # noqa: E402  (reuse the server and page helpers)

from playwright.sync_api import sync_playwright  # noqa: E402

R.PORT = 8773
SHOTS = R.SHOTS
ROOT = R.ROOT

K = "__debug.TU.uiKit"


def ui_static_checks():
    """Artifact rules on agent D's own files."""
    for name in sorted(os.listdir(os.path.join(ROOT, "js"))):
        if not (name == "ui.js" or name.startswith("ui-")):
            continue
        text = open(os.path.join(ROOT, "js", name), encoding="utf-8").read()
        assert "\u2014" not in text, "em dash in " + name
        for pat, why in ((r"\balert\s*\(", "alert"), (r"\bconfirm\s*\(", "confirm"), (r"(?<![\w.])prompt\s*\(", "prompt"),
                         (r"\bfetch\s*\(", "fetch"), (r"\bWebSocket\b", "WebSocket"), (r"localStorage", "direct localStorage")):
            assert not re.search(pat, text), "%s in %s" % (why, name)
    idx = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
    order = re.findall(r'src="js/(ui[^"]*)\.js"', idx)
    assert order[0] == "ui" and len(order) >= 7, "ui scripts must be in index.html, ui.js first: %r" % order
    assert idx.index('js/ui-tutorial.js') < idx.index('js/main.js'), "ui files load before main.js"
    print("ui static checks ok:", order)


def snap(page, name):
    page.evaluate("__debug.render()")
    page.screenshot(path=os.path.join(SHOTS, "D_" + name + ".png"))


def click(page, sel):
    """Click a visible element through the DOM (does not wait for the slow 3D frame to finish)."""
    page.wait_for_selector(sel, state="visible")
    page.evaluate("(sel) => document.querySelector(sel).click()", sel)


SCENE = os.environ.get("UI_TEST_SCENE") == "1"


def fast(page, on):
    """Skip the heavy main 3D render (swiftshader is ~10 s per frame and can run out of memory).
    By default the cave is never re-rendered in this test (UI only). UI_TEST_SCENE=1 renders it in dive shots."""
    if not on and not SCENE:
        return
    page.evaluate("""(on) => { const F = __debug.TU.fx;
      if (on && !F.__r) { F.__r = F.render; F.render = () => {}; }
      if (!on && F.__r) { F.render = F.__r; delete F.__r; } }""", on)


def state(page):
    return page.evaluate("__debug.TU.state.current")


def no_hscroll(page, where):
    res = page.evaluate("""() => {
      const doc = document.documentElement.scrollWidth <= window.innerWidth + 1;
      const bad = [...document.querySelectorAll('.ui-screen.ui-on, .ui-cp-panel, #ui-wrist.ui-on, #ui-hud.ui-on')]
        .filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.id || e.className);
      return { doc, bad };
    }""")
    assert res["doc"] and not res["bad"], "horizontal overflow at %s: %r" % (where, res)


def hud_part_update(page):
    page.evaluate("%s.parts.find(p => p.name === 'hud').update(0.25)" % K)


def main():
    ui_static_checks()
    os.makedirs(SHOTS, exist_ok=True)
    httpd = R.serve()
    errors = []
    url = "http://127.0.0.1:%d/" % R.PORT
    t_start = time.time()
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"])
        page = R.new_page(browser, errors, "[desktop]", viewport={"width": 1280, "height": 760})
        page.goto(url)
        page.wait_for_function("window.__debug !== undefined", timeout=120000)
        assert state(page) == "title"
        page.wait_for_timeout(800)
        fast(page, True)
        snap(page, "01_title")

        # ---- Story: Marv's intro, then "You done this before?"
        click(page, "#ui-btn-start")
        page.wait_for_timeout(1200)
        snap(page, "02_story")
        for _ in range(20):
            if page.query_selector("#ui-st-no"):
                break
            click(page, "#ui-st-next")
        assert page.query_selector("#ui-st-no"), "story should end on the question"
        snap(page, "03_story_question")

        # ---- Tutorial: first steps react to real input
        click(page, "#ui-st-no")
        assert state(page) == "dive", "No, teach me should start the practice dive"
        assert page.evaluate("%s.tut.active" % K)
        fast(page, False)
        page.evaluate("__debug.sim(0.4)")
        snap(page, "04_tutorial_look")
        page.evaluate("__debug.look(1.1, 0.35); __debug.sim(0.4)")
        i1 = page.evaluate("%s.tut.i" % K)
        page.evaluate("__debug.teleport('entrance'); __debug.sim(7, ['KeyW'])")
        i2 = page.evaluate("%s.tut.i" % K)
        print("swim stats:", page.evaluate("[__debug.TU.player.state.dist, %s.tut.st && %s.tut.st.kicks]" % (K, K)))
        page.evaluate("__debug.sim(0.4, ['KeyB']); __debug.sim(0.4, ['KeyV']); __debug.sim(0.2)")
        i3 = page.evaluate("%s.tut.i" % K)
        print("tutorial steps:", i1, i2, i3)
        assert i1 >= 1 and i2 >= 2 and i3 >= 3, "look, swim and buoyancy steps should complete"
        snap(page, "05_tutorial_flashlight")

        # ---- Pause, settings, HUD editor
        page.keyboard.press("Escape")
        fast(page, True)
        assert state(page) == "paused"
        snap(page, "06_pause")
        click(page, "#ui-pz-set .ui-tab[data-id='hud']")
        page.check("#ui-he-pressure")
        page.select_option("select[data-ro='cold']", "tl")
        page.check("#ui-he-cold")
        click(page, ".ui-he-chip[data-ro='compass']")
        click(page, ".ui-he-slot[data-slot='bc']")
        lay = page.evaluate("%s.hudLayout()" % K)
        assert lay["pressure"]["on"] and lay["cold"]["slot"] == "tl" and lay["compass"]["slot"] == "bc", lay
        snap(page, "07_hud_editor")
        click(page, "#ui-pz-set .ui-tab[data-id='controls']")
        snap(page, "08_controls")

        # ---- Skip the tutorial: $150 and the Kevin sticker, then Sump Camp
        click(page, "#ui-btn-skiptut")
        assert state(page) == "loadout", "skipping should open the camp"
        money = page.evaluate("__debug.TU.save.data.money.cash")
        assert money == 150 and page.evaluate("__debug.TU.save.data.ui.kevin"), "tutorial reward"
        page.wait_for_timeout(300)
        snap(page, "09_camp_dive")

        # ---- Loadout
        click(page, "#ui-st-loadout")
        click(page, ".ui-tank[data-tank='heavy']")
        assert page.evaluate("__debug.TU.save.data.loadout.tank") == "heavy"
        click(page, "[data-inc='tape']")
        snap(page, "10_loadout")
        click(page, ".ui-tank[data-tank='standard']")

        # ---- Locker: zone color, freehand paint, sticker, 3D preview
        click(page, "#ui-st-locker")
        page.wait_for_selector("#ui-lk-tpl")
        click(page, ".ui-sw button[title='#d8433c']")  # torso base color red
        click(page, "#ui-lk-tabs .ui-tab[data-id='paint']")
        box = page.query_selector("#ui-lk-tpl").bounding_box()
        page.mouse.move(box["x"] + box["width"] * 0.18, box["y"] + box["height"] * 0.12)
        page.mouse.down()
        for k in range(12):
            page.mouse.move(box["x"] + box["width"] * (0.18 + k * 0.012), box["y"] + box["height"] * (0.12 + (k % 2) * 0.08))
        page.mouse.up()
        click(page, "#ui-lk-tabs .ui-tab[data-id='stickers']")
        click(page, ".ui-stk[aria-label='Kevin']")
        page.mouse.click(box["x"] + box["width"] * 0.25, box["y"] + box["height"] * 0.25)
        click(page, ".ui-stk[aria-label='Cat paw']")
        page.mouse.click(box["x"] + box["width"] * 0.6, box["y"] + box["height"] * 0.25)
        page.evaluate("__debug.render(); __debug.render()")
        painted = page.evaluate("(__debug.TU.save.data.ui.locker.suit.paint || '').slice(0, 15)")
        assert painted.startswith("data:image/png"), "paint layer should be saved"
        assert page.evaluate("%s.locker.preview()" % K), "3D mannequin should build"
        snap(page, "11_locker_paint")
        click(page, "#ui-lk-tabs .ui-tab[data-id='fins']")
        snap(page, "12_locker_fins")
        click(page, "#ui-lk-tabs .ui-tab[data-id='mask']")
        page.locator("#ui-lk-toolbody .ui-chip", has_text="Square").first.dispatch_event("click")

        # ---- Shop: buy a tank upgrade
        page.evaluate("__debug.TU.save.data.money.cash = 5000; __debug.TU.save.write()")
        click(page, "#ui-st-shop")
        click(page, "[data-buy='tank']")
        up = page.evaluate("[__debug.TU.save.data.upgrades.tank, __debug.TU.save.data.money.cash]")
        assert up == [2, 4700], "tank L2 costs $300: %r" % up
        click(page, "[data-buy='lantern']")
        assert page.evaluate("__debug.TU.save.data.upgrades.lantern") == 1
        snap(page, "13_shop")

        # ---- Sell table
        page.evaluate("""__debug.TU.save.data.ui.haul.push({ id: 'x1', name: 'Cave bear tooth', kind: 'fossil', tier: 2, value: 90 },
                         { id: 'x2', name: 'Gold ammonite', kind: 'fossil', tier: 5, value: 1200, shiny: true })""")
        click(page, "#ui-st-sell")
        snap(page, "14_sell")
        before = page.evaluate("__debug.TU.save.data.money.cash")
        click(page, "[data-sell='0']")
        assert page.evaluate("__debug.TU.save.data.money.cash") == before + 90
        click(page, "[data-keep='0']")
        assert page.evaluate("__debug.TU.save.data.ui.trophies.length") == 1

        # ---- Logbook
        page.evaluate("""const T = __debug.TU; T.logbook.add({ speciesId: 'stalag_moss', sizeM: 0.4 }); T.logbook.add({ speciesId: 'cenote_molly', sizeM: 0.071 });
                         T.logbook.add({ speciesId: 'roost_bats', sizeM: 0.31 }); T.logbook.add({ speciesId: 'goblins_gold', sizeM: 0.06 });""")
        click(page, "#ui-st-logbook")
        snap(page, "15_logbook")
        click(page, "#ui-book-tabs .ui-tab[data-id='flora']")
        snap(page, "15b_logbook_flora")

        # ---- Contracts
        click(page, "#ui-st-contracts")
        click(page, "[data-ct='0']")
        assert page.evaluate("!!__debug.TU.save.data.ui.contracts.active")
        snap(page, "16_contracts")
        click(page, "#ui-st-boards")
        snap(page, "17_boards_empty")
        no_hscroll(page, "desktop camp")

        # ---- Dive from camp: HUD
        click(page, "#ui-st-dive")
        click(page, ".ui-diff[data-diff='easy']")
        click(page, "#ui-btn-dive")
        assert state(page) == "dive"
        fast(page, False)
        assert not page.evaluate("%s.tut.active" % K)
        src = page.evaluate("typeof __debug.TU.cave.mapData")
        if src != "function":
            # Fake mapData in the "paths" shape until cave.js provides one.
            page.evaluate("""() => { const T = __debug.TU, pts = [];
              for (let s = 0; s < 400; s += 4) { const sp = T.cave.spot(s); if (!sp) break; pts.push([sp.pos.x, sp.pos.y, sp.pos.z]); }
              T.cave.mapData = () => ({ paths: [{ points: pts, radius: 2.4 }] }); }""")
            print("hologram: using a fake TU.cave.mapData")
        else:
            print("hologram: using cave.js mapData")
        page.evaluate("__debug.teleport('mid'); __debug.sim(2, ['KeyW']); __debug.sim(0.3)")
        snap(page, "18_hud")

        # ---- Waypoint naming
        page.keyboard.press("q")
        page.wait_for_selector("#ui-wpname.ui-on")
        page.keyboard.type("Sump Gate")
        snap(page, "19_waypoint_name")
        page.keyboard.press("Enter")
        names = page.evaluate("%s.wpNames" % K)
        assert "Sump Gate" in names.values(), names
        page.evaluate("__debug.sim(0.2)")

        # ---- New species toast and a find
        page.evaluate("""const T = __debug.TU; T.logbook.add({ speciesId: 'olm', sizeM: 0.312, depthM: 40 }); T.logbook.add({ speciesId: 'cenote_molly', sizeM: 0.088 });
                         T.emit('treasure:found', { id: 't1', kind: 'fossil', name: 'Trilobite plate', value: 80, tier: 2 }); __debug.sim(0.3)""")
        snap(page, "20_species_toast")

        # ---- Wrist computer and hologram
        page.evaluate("__debug.teleport('silt'); __debug.sim(1.5, ['KeyW'])")
        page.keyboard.press("Tab")
        assert page.evaluate("%s.wrist.raised()" % K), "Tab should raise the wrist"
        page.keyboard.down("ArrowLeft")
        page.evaluate("__debug.render(); __debug.render()")
        page.keyboard.up("ArrowLeft")
        page.evaluate("%s.wrist.view(null, 0.85, null); __debug.sim(0.3); __debug.render(); __debug.render()" % K)
        explored = page.evaluate("%s.wrist.explored()" % K)
        print("hologram explored: %.0f%%" % (explored * 100))
        assert explored > 0, "visited parts of the map should be revealed"
        snap(page, "21_wrist_hologram")
        page.keyboard.press("Tab")
        assert not page.evaluate("%s.wrist.raised()" % K)

        # ---- Dive slate (J)
        page.keyboard.press("j")
        snap(page, "22_slate")
        page.keyboard.press("j")

        # ---- Damage indicators
        page.evaluate("const P = __debug.TU.player.state; P.maskFlooded = true; P.maskFlood = 0.5; P.injuries = [{ type: 'cut', severity: 0.8, taped: false, at: 0 }, { type: 'sprain', severity: 0.4, taped: false, at: 0 }]; P.panic = 75")
        hud_part_update(page)
        page.evaluate("__debug.render()")
        page.screenshot(path=os.path.join(SHOTS, "D_23_damage.png"))
        page.evaluate("const P = __debug.TU.player.state; P.maskFlooded = false; P.maskFlood = 0; P.injuries = []; P.panic = 0")

        page.close()

        # ---- Second page (fresh memory): results at the bottom, END RUN vs KEEP DIVING
        page = R.new_page(browser, errors, "[desktop2]", viewport={"width": 1280, "height": 760})
        page.goto(url)
        page.wait_for_function("window.__debug !== undefined", timeout=120000)
        fast(page, True)
        page.evaluate("""const T = __debug.TU; T.save.data.ui.storySeen = true; T.save.data.ui.contracts.active = { type: 'wp4', title: 'Mark the way: 4 waypoints', cash: 150, fins: 1 };
                         __debug.start({ difficulty: 'standard' }); __debug.sim(0.5);
                         T.logbook.add({ speciesId: 'blind_cavefish', sizeM: 0.084 }); T.logbook.add({ speciesId: 'volt_eel', sizeM: 1.9 });
                         T.emit('treasure:found', { id: 't9', kind: 'fossil', name: 'Ground sloth claw', value: 180, tier: 3 }); __debug.sim(0.2)""")
        page.evaluate("__debug.TU.game.endRun({ won: true, reason: 'bottom' })")
        assert state(page) == "results"
        assert page.query_selector("#ui-btn-keep") and page.query_selector("#ui-btn-endrun")
        snap(page, "24_results")
        click(page, "#ui-btn-endrun")
        cash = page.evaluate("__debug.TU.save.data.money.cash")
        print("cash after the bottom:", cash)
        click(page, "#ui-btn-camp-results")
        assert state(page) == "loadout"
        snap(page, "25_camp_sell_after")
        click(page, "#ui-st-boards")
        snap(page, "26_boards")

        # ---- Keep diving carries on in the same cave (endless mode, TU.game.keepDiving)
        click(page, "#ui-st-dive")
        click(page, "#ui-btn-dive")
        seed1 = page.evaluate("__debug.TU.run.seed")
        page.evaluate("__debug.TU.game.endRun({ won: true, reason: 'bottom' })")
        click(page, "#ui-btn-keep")
        assert state(page) == "dive" and page.evaluate("__debug.TU.run.seed") == seed1 and page.evaluate("__debug.TU.run.endless")

        # ---- Death screens
        page.evaluate("__debug.TU.game.endRun({ won: false, reason: 'bled' })")
        assert state(page) == "dead"
        snap(page, "27_dead_bled")
        click(page, "#ui-btn-again-dead")
        page.evaluate("__debug.TU.game.endRun({ won: false, reason: 'crushed' })")
        snap(page, "28_dead_crushed")
        click(page, "#ui-btn-again-dead")
        st = page.evaluate("__debug.setAir(0.5, true); __debug.sim(6)")
        assert st["state"] == "dead"
        snap(page, "29_dead_drowned")

        # ---- Title with a save, and title settings
        click(page, "#ui-btn-title-dead")
        assert state(page) == "title"
        snap(page, "30_title_returning")
        click(page, "#ui-btn-settings")
        snap(page, "31_settings")
        click(page, "#ui-btn-set-close")
        no_hscroll(page, "desktop title")
        page.close()

        # ---- Phone width (390 px)
        mob = R.new_page(browser, errors, "[phone]", viewport={"width": 390, "height": 800}, has_touch=True, is_mobile=True, device_scale_factor=1)
        mob.goto(url)
        mob.wait_for_function("window.__debug !== undefined", timeout=120000)
        mob.wait_for_timeout(600)
        fast(mob, True)
        no_hscroll(mob, "phone title")
        snap(mob, "P1_title")
        click(mob, "#ui-btn-start")
        mob.wait_for_timeout(600)
        no_hscroll(mob, "phone story")
        snap(mob, "P2_story")
        mob.evaluate("__debug.TU.uiKit.overlay(null)")
        click(mob, "#ui-btn-loadout")
        no_hscroll(mob, "phone camp loadout")
        snap(mob, "P3_camp_loadout")
        for st_id in ("dive", "locker", "shop", "logbook", "contracts", "boards", "sell"):
            click(mob, "#ui-st-" + st_id)
            mob.wait_for_timeout(150)
            no_hscroll(mob, "phone camp " + st_id)
            if st_id in ("locker", "dive"):
                snap(mob, "P4_camp_" + st_id)
        mob.evaluate("__debug.start({ difficulty: 'easy' }); __debug.sim(0.5)")
        fast(mob, False)
        no_hscroll(mob, "phone hud")
        snap(mob, "P5_hud")
        mob.evaluate("__debug.TU.ui.setWrist(true); __debug.sim(0.3); __debug.render()")
        no_hscroll(mob, "phone wrist")
        snap(mob, "P6_wrist")
        fast(mob, True)
        mob.evaluate("__debug.TU.ui.setWrist(false); __debug.TU.game.endRun({ won: true, reason: 'bottom' })")
        no_hscroll(mob, "phone results")
        snap(mob, "P7_results")
        mob.close()
        browser.close()
    httpd.shutdown()
    print("time: %.0fs" % (time.time() - t_start))
    print("ERRORS:", len(errors))
    for e in errors:
        print("  ", e)
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
