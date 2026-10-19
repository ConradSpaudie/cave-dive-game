"""Creature test for Tied Under (agent B).

What it does:
  1. Boots the game the same way as run_test.py (local three.js, fonts stubbed).
  2. For every species: TU.creatures.debugShowcase(id) puts it alone under a neutral light,
     big in frame, and saves tests/screens/B_<species>.png. It then advances the animation and
     checks that the picture changes (the animal really moves) and that the phase advanced.
  3. Extra shots: all species lined up, a shiny variant, the Lanternjaw biting, all finds,
     and a few creatures in the real cave lit only by the flashlight or their own glow.
  4. Interaction checks: measure (logbook + realistic size), catch into the lantern (lantern light),
     the Lanternjaw lure biting, the Volt Eel shock event, crayfish pinch, and picking up a find.
  5. Fails on any console error.

Run:  python3 tests/test_creatures.py        (about 5 to 8 minutes in software rendering)
"""
import os
import sys
import time

from PIL import Image, ImageChops, ImageStat
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import run_test as RT  # noqa: E402

RT.PORT = 8773
SHOTS = RT.SHOTS


def shot(page, name):
    page.evaluate("__debug.screenshotMode(true); __debug.render()")
    path = os.path.join(SHOTS, name)
    page.screenshot(path=path)
    return path


def diff(a, b):
    """Mean absolute pixel difference (0..255) between two screenshots, center 70% of the frame."""
    ia, ib = Image.open(a).convert("RGB"), Image.open(b).convert("RGB")
    w, h = ia.size
    box = (int(w * 0.15), int(h * 0.15), int(w * 0.85), int(h * 0.85))
    d = ImageChops.difference(ia.crop(box), ib.crop(box))
    return sum(ImageStat.Stat(d).mean) / 3.0


def busy(path):
    """How much of the center is not background (a crude 'is something in frame' check)."""
    im = Image.open(path).convert("L")
    w, h = im.size
    st = ImageStat.Stat(im.crop((int(w * 0.2), int(h * 0.2), int(w * 0.8), int(h * 0.8))))
    return st.stddev[0]


def main():
    os.makedirs(SHOTS, exist_ok=True)
    httpd = RT.serve()
    errors = []
    url = "http://127.0.0.1:%d/" % RT.PORT
    report = []
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"])
        sections = sys.argv[1:] or ["species", "extras", "ingame"]

        def open_page(tag):
            # A fresh page per section keeps each software-rendered browser tab small (big tabs can crash).
            pg = RT.new_page(browser, errors, "[creatures %s]" % tag, viewport={"width": 960, "height": 600})
            t0 = time.time()
            pg.goto(url)
            pg.wait_for_function("window.__debug !== undefined", timeout=180000)
            print("boot %.1fs (%s)" % (time.time() - t0, tag))
            # hide UI text overlays (zone banners, messages) so the pictures only show the creatures
            pg.add_style_tag(content="[id^=ui-]{display:none!important}")
            pg.evaluate("""() => {
              window.__ev = [];
              const TU = __debug.TU;
              ['creature:attack','creature:warn','creature:caught','creature:logged','creature:seen','treasure:found','fossil:found','creature:fled'].forEach(n => TU.on(n, e => window.__ev.push({n, kind: e.kind, id: e.id, speciesId: e.speciesId, value: e.value, first: e.first})));
            }""")
            pg.evaluate("__debug.start({seed: 4242}); __debug.teleport('deep'); __debug.sim(1.0)")
            return pg

        page = open_page("species")
        info = page.evaluate("""() => { const C = __debug.TU.creatures; return { ids: C.debugIds(), total: C.total(), active: C.activeCount(), finds: C.finds().length,
            zones: [0,1,2,3,4].map(z => C.debugIds().filter(id => C.species[id].zones.includes(z)).length) }; }""")
        print("species:", len(info["ids"]), "census:", info["total"], "active:", info["active"], "finds:", info["finds"], "species per zone:", info["zones"])
        assert len(info["ids"]) >= 16, "need at least 16 species"
        assert all(n > 0 for n in info["zones"]), "every zone needs species"
        assert info["total"] > 40, "the census should fill the cave"

        # 1. one screenshot per species, plus an animation check
        tmp = os.path.join(SHOTS, "_tmp_anim.png")
        for sid in (info["ids"] if "species" in sections else []):
            r = page.evaluate("(id) => { const C = __debug.TU.creatures; C.debugShowcase(id); return C.debugAdvance(0.4); }", sid)
            path = shot(page, "B_%s.png" % sid)
            r2 = page.evaluate("() => __debug.TU.creatures.debugAdvance(0.45)")
            shot(page, "_tmp_anim.png")
            d = diff(path, tmp)
            b = busy(path)
            report.append((sid, round(r2 - r, 2), round(d, 2), round(b, 1)))
            print("  %-18s phase +%.2f  anim diff %.2f  detail %.1f" % (sid, r2 - r, d, b))
            assert r2 > r, "animation phase must advance for " + sid
            assert b > 6, "the showcase picture of %s looks empty" % sid
            moving = sid not in ("stalag_moss", "glimmer_moss", "ghost_fire_fungus", "sulfur_bloom_mat", "starlight_glowworm")
            if moving:
                assert d > 0.08, "%s should visibly move between frames (diff %.3f)" % (sid, d)
        if os.path.exists(tmp):
            os.remove(tmp)
        page.close()

        # 2. extra showcase shots
        page = open_page("extras") if "extras" in sections else None
        if page:
            page.evaluate("__debug.TU.creatures.debugShowcase('all'); __debug.TU.creatures.debugAdvance(0.3)")
            shot(page, "B_all_species.png")
            page.evaluate("__debug.TU.creatures.debugShowcase('olm', {variant: 'shiny'}); __debug.TU.creatures.debugAdvance(0.3)")
            shot(page, "B_olm_shiny.png")
            page.evaluate("__debug.TU.creatures.debugShowcase('lanternjaw', {jaw: 1}); __debug.TU.creatures.debugAdvance(0.3)")
            shot(page, "B_lanternjaw_bite.png")
            page.evaluate("__debug.TU.creatures.debugShowcase('entrance_crayfish', {jaw: 1}); __debug.TU.creatures.debugAdvance(0.3)")
            shot(page, "B_entrance_crayfish_claws_open.png")
            page.evaluate("__debug.TU.creatures.debugShowcaseFind('all')")
            shot(page, "B_finds_all.png")
            for name in page.evaluate("__debug.TU.creatures.debugFindModels()"):
                page.evaluate("(n) => __debug.TU.creatures.debugShowcaseFind(n)", name)
                shot(page, "B_find_%s.png" % name)
            page.evaluate("__debug.TU.creatures.debugShowcaseFind(false); __debug.TU.creatures.debugShowcase(false)")
            page.close()

        # 3. in the real cave, lit by the flashlight (or by their own glow with the light off)
        if "ingame" not in sections:
            browser.close(); httpd.shutdown(); print("ERRORS:", len(errors)); [print("  ", e) for e in errors]; sys.exit(1 if errors else 0)
        page = open_page("ingame")
        nonlocal_page = [page]
        def ingame(sid, name, dist=1.4, light=True, extra=""):
            nonlocal_page[0].close()
            nonlocal_page[0] = open_page("ingame " + sid)
            page = nonlocal_page[0]
            page.evaluate("""([sid, dist, light]) => { __debug.teleport('deep', {yaw: 0.6}); __debug.sim(0.3);
                const P = __debug.TU.player.state; if (P.flashOn !== light) __debug.TU.player.toggleFlash();
                const a = __debug.TU.creatures.debugSpawnInFront(sid, dist, {still: true}); __debug.sim(0.4);
                __debug.render(); __debug.TU.creatures.debugPlace(a.id, dist); }""", [sid, dist, light])
            if extra:
                page.evaluate(extra)
            return shot(page, name)
        ingame("blind_cavefish", "B_ingame_cavefish_flashlight.png", 0.32)
        ingame("olm", "B_ingame_olm_flashlight.png", 0.55)
        ingame("halo_jelly", "B_ingame_halo_jelly_dark.png", 0.5, light=False)
        ingame("lanternjaw", "B_ingame_lanternjaw_dark.png", 1.7, light=False)
        ingame("sea_firefly", "B_ingame_sea_firefly_dark.png", 0.7, light=False)
        page = nonlocal_page[0]
        page.evaluate("() => { const P = __debug.TU.player.state; if (!P.flashOn) __debug.TU.player.toggleFlash(); }")

        # 4. interactions
        res = page.evaluate("""() => { const C = __debug.TU.creatures; __debug.teleport('deep'); __debug.sim(0.2);
            const a = C.debugSpawnInFront('olm', 1.0, {still: true}); __debug.sim(0.1);
            const m = C.measure(a.id); const e = __debug.TU.logbook.get('olm'); return { m, size: C.species.olm.sizeM, logged: !!e }; }""")
        print("measure:", res["m"])
        assert res["logged"] and res["size"][0] * 0.95 <= res["m"]["sizeM"] <= res["size"][1] * 1.05, "measured size must be realistic and logged"
        res = page.evaluate("""() => { const C = __debug.TU.creatures; __debug.sim(0.1);
            __debug.TU.player.debug.giveLantern(0);
            const a = C.debugSpawnInFront('halo_jelly', 1.0, {still: true}); __debug.sim(0.1);
            const r = C.catch(a.id); return { r, light: C.lanternLight() }; }""")
        print("catch:", res["r"], "lantern brightness:", res["light"]["brightness"])
        assert res["r"]["ok"] and res["light"]["brightness"] >= 3, "a Halo Jelly should go in the lantern and light it"
        res = page.evaluate("""() => { const C = __debug.TU.creatures; window.__ev.length = 0;
            const a = C.debugSpawnInFront('lanternjaw', 1.6, {still: true}); const c = C.get(a.id);
            const r = C.catch(a.id); __debug.sim(0.8); return { r, ev: window.__ev.filter(e => e.n === 'creature:attack').map(e => e.kind) }; }""")
        print("catch the lure:", res)
        assert res["r"]["reason"] == "bit" and "bite" in res["ev"], "grabbing a Lanternjaw lure should bite"
        res = page.evaluate("""() => { const C = __debug.TU.creatures; window.__ev.length = 0; __debug.teleport('deep'); __debug.sim(0.2);
            C.debugSpawnInFront('volt_eel', 1.5, {still: true}); __debug.sim(2.5); return window.__ev.filter(e => e.n.startsWith('creature:a') || e.n.startsWith('creature:w')).map(e => e.n + ':' + e.kind); }""")
        print("volt eel:", res)
        assert "creature:warn:shock" in res and "creature:attack:shock" in res, "the Volt Eel should warn and then shock"
        res = page.evaluate("""() => { const C = __debug.TU.creatures; window.__ev.length = 0; __debug.teleport('deep', {low: true, pitch: -0.9}); __debug.sim(0.2);
            C.debugSpawnInFront('entrance_crayfish', 0.7, {still: true}); __debug.sim(2.2); return window.__ev.filter(e => e.n === 'creature:attack').map(e => e.kind); }""")
        print("crayfish:", res)
        assert "pinch" in res, "a crayfish should pinch when you hover over it"
        res = page.evaluate("""() => { const C = __debug.TU.creatures, f = C.finds()[0]; if (!f) return null; window.__ev.length = 0;
            const p = f.pos.clone(); p.y += 1.2; __debug.TU.player.teleport(p, 0, -1.4); __debug.sim(0.1);
            const n = C.findNearest(3, 0.5); const r = C.pickup(n ? n.id : f.id); return { r, ev: window.__ev.map(e => e.n) }; }""")
        print("pickup:", res)
        assert res and res["r"]["ok"] and "treasure:found" in res["ev"], "picking up a find should emit treasure:found"
        st = page.evaluate("__debug.sim(2); __debug.getStats()")
        print("seen:", st["seen"], "of", st["creatures"])
        fps = page.evaluate("new Promise(r=>{let n=0;const t=performance.now();function f(){n++; if(performance.now()-t<3000) requestAnimationFrame(f); else r(n/3);} requestAnimationFrame(f);})")
        print("fps in swiftshader: %.2f, active creatures: %d" % (fps, page.evaluate("__debug.TU.creatures.activeCount()")))
        page.close()
        browser.close()
    httpd.shutdown()
    print("ERRORS:", len(errors))
    for e in errors:
        print("  ", e)
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
