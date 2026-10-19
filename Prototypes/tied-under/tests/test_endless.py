"""Endless depth and glow stick test for Tied Under.

What it checks:
  1. An easy dive, a debug teleport to the Ancient Ring, the results screen, then KEEP DIVING
     (the real button): the ring wakes up, the floor stays shut while a new segment is built a few
     milliseconds per frame (no long step), then the floor breaks open.
  2. The new segment: zoneAt says 5+ (The Hollow), the hole and the shaft are open water, an air
     dome in the ring chamber, the hologram map (mapData) includes the new cave, new zone banners.
  3. Swim (teleport) to the new segment's ring: the leg ends with the same choice, the summary
     has the Beyond zone. KEEP DIVING once more: segment 0 is freed, the shaft into segment 1
     collapses, memory and geometry counts stay bounded.
  4. Glow sticks: key 3 throws one (inventory goes down), it sinks and lands on the rock, it gets
     one of the 3 pooled lights, older sticks fall back to glow only, panic calms near one, it fades
     and goes, and with none left a message says so. Glow sticks show on mapData.
  5. Zero console errors. Screenshots: tests/screens/END_*.png and GLOW_*.png.
Run:  python3 tests/test_endless.py
"""
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import run_test as R  # noqa: E402

from playwright.sync_api import sync_playwright  # noqa: E402

R.PORT = 8781
SHOTS = R.SHOTS


def fast(page, on):
    page.evaluate("""(on) => { const F = __debug.TU.fx;
      if (on && !F.__r) { F.__r = F.render; F.render = () => {}; }
      if (!on && F.__r) { F.render = F.__r; delete F.__r; } }""", on)


def snap(page, name, clean=True):
    """Draw one real frame (the animation loop keeps the heavy render off) and save it."""
    if clean:
        page.evaluate("__debug.screenshotMode(true)")
    page.evaluate("""() => { const F = __debug.TU.fx, stub = F.render; if (F.__r) F.render = F.__r; try { __debug.render(); } finally { F.render = stub; } }""")
    page.screenshot(path=os.path.join(SHOTS, name + ".png"))
    print("  shot", name, "[%.0fs]" % (time.time() - T0), flush=True)
    if clean:
        page.evaluate("__debug.screenshotMode(false)")


T0 = time.time()


def check(cond, what):
    print(("  ok   " if cond else "  FAIL ") + what + "  [%.0fs]" % (time.time() - T0), flush=True)
    if not cond:
        raise AssertionError(what)


def wait_build(page, timeout=240):
    t0 = time.time()
    while time.time() - t0 < timeout:
        if not page.evaluate("__debug.TU.cave.endless.building()"):
            return time.time() - t0
        page.wait_for_timeout(250)
    raise AssertionError("segment build did not finish in %ds" % timeout)


MEM = """() => { const T = __debug.TU, s = T.cave.stats(), m = T.renderer.info.memory;
  return { cells: s.liveCells, blocks: s.blocks, chunks: s.chunks, colliders: s.colliders, geometries: m.geometries, textures: m.textures,
           segs: s.segments, sceneObjs: (() => { let n = 0; T.scene.traverse(() => n++); return n; })() }; }"""

# frame timer: the longest gap between animation frames while the segment builds
FRAME_TIMER = """() => { const w = window; w.__ft = { max: 0, n: 0, last: performance.now(), on: true };
  const tick = (t) => { const f = w.__ft; if (!f.on) return; const d = t - f.last; f.last = t; f.n++; if (f.n > 2 && d > f.max) f.max = d; requestAnimationFrame(tick); };
  requestAnimationFrame(tick); }"""


def main():
    os.makedirs(SHOTS, exist_ok=True)
    httpd = R.serve()
    errors = []
    url = "http://127.0.0.1:%d/" % R.PORT
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"])
        page = R.new_page(browser, errors, "[endless]", viewport={"width": 960, "height": 540})
        page.goto(url)
        page.wait_for_function("window.__debug !== undefined", timeout=180000)
        fast(page, True)
        msgs = []
        page.expose_function("__msgLog", lambda t: msgs.append(t))
        page.evaluate("() => { __debug.TU.on('ui:msg', e => window.__msgLog(e.text)); }")
        page.evaluate("() => { __debug.TU.on('area:enter', e => window.__msgLog('AREA ' + e.title)); }")

        # ---- an easy dive with glow sticks in the loadout
        page.evaluate("__debug.TU.save.data.loadout.glowSticks = 5")
        st = page.evaluate("__debug.start({ seed: 777001, difficulty: 'easy' }); __debug.TU.cave.finishBuild(); __debug.getStats()")
        check(st["state"] == "dive", "easy dive started")
        check(page.evaluate("__debug.TU.player.inventory.glowSticks") == 5, "5 glow sticks loaded")
        b = page.evaluate("[__debug.TU.player.bindings.filter(x => x && x.action === 'glowStick').length, __debug.TU.player.bindings.filter(x => x && x.keys && x.keys.includes('Digit3')).length]")
        check(b == [1, 1], "key 3 registered once in the controls list, nothing else on it")
        mem0 = page.evaluate(MEM)
        print("  memory, first cave:", {k: mem0[k] for k in ("cells", "chunks", "geometries", "colliders")})

        # ---- the bottom -> results -> KEEP DIVING (real button)
        st = page.evaluate("__debug.teleport('end'); __debug.lookAtCore(); __debug.sim(10, ['KeyW'])")
        check(st["state"] == "results", "touching the ring ends the first leg")
        page.wait_for_selector("#ui-btn-keep", state="visible", timeout=60000)
        page.evaluate(FRAME_TIMER)
        page.evaluate("document.querySelector('#ui-btn-keep').click()")
        st = page.evaluate("__debug.sim(0.5)")
        check(st["state"] == "dive" and st["endless"] and st["endSeg"] == 1 and st["building"], "keep diving: endless, segment 1 building")
        check(page.evaluate("__debug.TU.cave.features.bottom.segment") == 0, "while it builds the goal is not the old ring")
        st = page.evaluate("__debug.lookAtCore(); __debug.sim(2, ['KeyW'])")
        check(st["state"] == "dive", "no second win at the old ring")
        # the floor is still shut: straight down from the hole is rock
        shut = page.evaluate("""() => { const T = __debug.TU, W = T.cave._W, sg = W.segs[1], h = sg.hole.pos;
          return T.cave.raycast(new THREE.Vector3(h[0], sg.from.floorY + 1.2, h[2]), new THREE.Vector3(0, -1, 0), 20); }""")
        check(shut < 3, "the floor over the shaft is still closed while building (%.1f m to rock)" % shut)
        page.evaluate("__debug.teleport('end'); __debug.lookAtCore(); __debug.look(__debug.TU.player.state.yaw, 0.15)")
        snap(page, "END_01_ring_wakes")
        built = wait_build(page)
        page.evaluate("window.__ft.on = false")
        lb = page.evaluate("__debug.TU.cave.endless.lastBuild()")
        ft = page.evaluate("window.__ft")
        print("  build: %.1f s wall, job %s, longest frame gap %.0f ms over %d frames" % (built, lb, ft["max"], ft["n"]))
        check(lb["frames"] >= 8, "the build is spread over many frames (%d)" % lb["frames"])
        check(lb["maxStepMs"] < 100, "no long freeze: the longest build step is %.1f ms" % lb["maxStepMs"])
        st = page.evaluate("__debug.getStats()")
        check(not st["building"] and page.evaluate("__debug.TU.cave.features.bottom.segment") == 1, "the floor opened; the new ring is the goal")
        open_d = page.evaluate("""() => { const T = __debug.TU, W = T.cave._W, sg = W.segs[1], h = sg.hole.pos;
          return T.cave.raycast(new THREE.Vector3(h[0], sg.from.floorY + 1.2, h[2]), new THREE.Vector3(0, -1, 0), 30); }""")
        check(open_d > 10, "the hole is open water down the shaft (%.1f m)" % open_d)
        check(any("floor breaks open" in m for m in msgs), "the floor-breaks message was shown")

        # ---- zones in the new segment
        z = page.evaluate("""() => { const T = __debug.TU, sp = T.cave.spot('segStart'); return [T.cave.zoneAt(sp.pos), T.cave.zoneAt(T.cave.spot('hole').pos), sp.pos.y]; }""")
        check(z[0]["index"] >= 5 and z[0]["beyond"], "zoneAt in the new segment is a Beyond zone (%d %s)" % (z[0]["index"], z[0]["name"]))
        check(z[1]["index"] <= 4, "the old ring chamber is still a classic zone (%d)" % z[1]["index"])
        names = page.evaluate("[5, 6, 7, 10, 12].map(i => __debug.TU.cave.zoneName(i))")
        print("  zone names:", names)
        check(names[0] == "The Hollow" and names[1] == "The Root" and names[3] == "The Hollow II", "Beyond zone names cycle")
        dome = page.evaluate("__debug.TU.cave.features.airPockets.filter(a => a.dome).length")
        check(dome == 1, "the ring chamber has an air dome now")
        page.evaluate("__debug.teleport('hole'); __debug.sim(0.2)")
        snap(page, "END_02_floor_open")
        page.evaluate("__debug.teleport('dome'); __debug.sim(0.3)")
        snap(page, "END_03_air_dome")
        st = page.evaluate("__debug.teleport('shaft'); __debug.TU.player.toggleFlash && 0; __debug.sim(0.3)")
        snap(page, "END_04_shaft_down")
        st = page.evaluate("__debug.teleport('segStart'); __debug.sim(1.0)")
        check(st["zoneAt"] >= 5 and st["maxZone"] >= 5, "the diver is in the Beyond (zone %d)" % st["zoneAt"])
        snap(page, "END_05_new_segment")
        md = page.evaluate("""() => { const m = __debug.TU.cave.mapData(), y0 = __debug.TU.cave._W.segs[1].topM;
          let deep = 0; m.paths.forEach(p => p.points.forEach(q => { if (-q[1] > y0) deep++; }));
          return { deep, segment: m.segment, rings: m.rings.length, zones: m.zones.map(z => z.name), chambers: m.chambers.filter(c => c.seg === 1).length }; }""")
        print("  mapData:", md)
        check(md["deep"] > 20 and md["segment"] == 1 and md["rings"] == 2 and md["chambers"] >= 2, "the hologram map has the new segment and both rings")
        pocket = page.evaluate("__debug.TU.cave.spot('segPocket') ? 1 : 0")
        print("  first air pocket in the new segment:", bool(pocket))

        # ---- glow sticks in the dark Beyond
        page.evaluate("__debug.teleport('segStart'); __debug.look(__debug.TU.player.state.yaw, -0.35); __debug.sim(0.2)")
        page.evaluate("const P = __debug.TU.player.state; if (P.flashOn) __debug.TU.player.toggleFlash();")
        n0 = page.evaluate("__debug.TU.player.inventory.glowSticks")
        page.keyboard.press("Digit3")
        st = page.evaluate("__debug.sim(0.3)")
        gl = page.evaluate("__debug.TU.glowsticks.list()")
        check(len(gl) == 1 and page.evaluate("__debug.TU.player.inventory.glowSticks") == n0 - 1, "key 3 throws a glow stick and uses one (%d left)" % (n0 - 1))
        snap(page, "GLOW_01_thrown")
        y0 = gl[0]["pos"]["y"]
        for _ in range(12):
            page.evaluate("__debug.sim(1.5)")
            if page.evaluate("__debug.TU.glowsticks.list()[0].rest"):
                break
        g1 = page.evaluate("__debug.TU.glowsticks.list()[0]")
        print("  stick:", g1)
        check(g1["rest"] and g1["pos"]["y"] < y0, "it sank and came to rest on the rock")
        inside = page.evaluate("(() => { const g = __debug.TU.glowsticks.list()[0]; return __debug.TU.cave.contains(g.pos, 0.0); })()")
        check(inside, "it rests in the water, not inside the rock")
        lt = page.evaluate("__debug.TU.glowsticks.lights()")
        check(len(lt) == 3 and sum(1 for L in lt if L["owner"] and L["intensity"] > 0.3) == 1, "it has one of the 3 pooled lights %r" % lt)
        page.evaluate("""(() => { const g = __debug.TU.glowsticks.list()[0], P = __debug.TU.player.state;
          __debug.TU.player.teleport(new THREE.Vector3(g.pos.x + 1.2, g.pos.y + 1.0, g.pos.z + 1.2)); __debug.lookAt(g.pos); })()""")
        page.evaluate("__debug.sim(0.2)")
        snap(page, "GLOW_02_landed_dark")
        # panic calms near it (light off)
        calm = page.evaluate("""(() => { const P = __debug.TU.player.state; P.panic = 60; __debug.sim(2); const near = P.panic;
          __debug.TU.player.teleport(__debug.TU.cave.spot('segStart').pos); P.panic = 60; const k0 = __debug.TU.glowsticks.calmAt(P.pos); __debug.sim(2); return [near, P.panic, k0]; })()""")
        print("  panic after 2 s: near a stick %.1f, away %.1f (calm there %.2f)" % (calm[0], calm[1], calm[2]))
        check(calm[0] < calm[1] or calm[2] > 0, "panic calms near a lit glow stick")
        # more sticks: only the 3 newest get lights
        page.evaluate("__debug.teleport('segStart'); for (let i = 0; i < 3; i++) { __debug.look(__debug.TU.player.state.yaw + i * 0.6, -0.2); __debug.TU.glowsticks.throwStick(); __debug.sim(0.4); }")
        lt = page.evaluate("[__debug.TU.glowsticks.lights(), __debug.TU.glowsticks.list().map(g => g.lit)]")
        check(sum(1 for L in lt[0] if L["owner"]) == 3 and lt[1] == [False, True, True, True], "4 sticks: the 3 newest have lights, the oldest only glows %r" % lt[1])
        cols = page.evaluate("__debug.TU.glowsticks.list().map(g => g.color)")
        check(len(set(cols[:3])) == 3, "colors cycle green, cyan, orange")
        nm = page.evaluate("__debug.TU.cave.mapData().glowSticks.length")
        check(nm == 4, "glow sticks are on the hologram map (%d)" % nm)
        page.evaluate("__debug.sim(2)")
        snap(page, "GLOW_03_four_sticks")
        # fade and burn out
        page.evaluate("__debug.TU.glowsticks.age(222)")
        bri = page.evaluate("__debug.TU.glowsticks.list().map(g => g.brightness)")
        check(all(0 < x < 0.6 for x in bri), "after about 3.7 minutes they are fading %r" % bri)
        page.evaluate("__debug.TU.glowsticks.age(20)")
        check(page.evaluate("__debug.TU.glowsticks.count()") == 0, "after 4 minutes they are gone")
        check(all(L["intensity"] == 0 for L in page.evaluate("__debug.TU.glowsticks.lights()")), "their lights are off")
        # none left -> a message
        page.evaluate("__debug.TU.player.inventory.glowSticks = 0")
        msgs.clear()
        page.keyboard.press("Digit3")
        page.evaluate("__debug.sim(0.1)")
        check(page.evaluate("__debug.TU.glowsticks.count()") == 0 and any("No glow sticks" in m for m in msgs), "with none left key 3 says so")

        # ---- swim on to the new ring: the second leg ends with the same choice
        mem1 = page.evaluate(MEM)
        print("  memory, two segments:", {k: mem1[k] for k in ("cells", "chunks", "geometries", "colliders")})
        st = page.evaluate("__debug.teleport('end'); __debug.lookAtCore(); __debug.sim(10, ['KeyW'])")
        check(st["state"] == "results", "touching the new ring ends the leg")
        sm = page.evaluate("__debug.TU.state.data.summary")
        print("  summary:", {k: sm.get(k) for k in ("reason", "won", "leg", "segment", "maxZone", "maxZoneName", "maxDepthM", "beyond")})
        check(sm["won"] and sm["reason"] == "bottom" and sm["segment"] == 1 and sm["maxZone"] >= 5 and sm["beyond"], "summary: a Beyond ring reached")
        snap(page, "END_06_second_ring_results", clean=False)

        # ---- keep diving again: segment 0 goes, the shaft behind collapses
        page.wait_for_selector("#ui-btn-keep", state="visible", timeout=60000)
        page.evaluate("document.querySelector('#ui-btn-keep').click()")
        st = page.evaluate("__debug.sim(0.3)")
        check(st["endSeg"] == 2 and st["building"], "segment 2 is building")
        wait_build(page)
        mem2 = page.evaluate(MEM)
        print("  memory, segments 1 and 2:", {k: mem2[k] for k in ("cells", "chunks", "geometries", "colliders")})
        segs = mem2["segs"]
        check(segs[0]["freed"] and not segs[1]["freed"] and segs[2]["opened"], "segment 0 freed, 1 kept, 2 open")
        c12 = page.evaluate("__debug.TU.cave._W.segs[1].cellCount + __debug.TU.cave._W.segs[2].cellCount")
        check(mem2["cells"] == c12 and mem2["blocks"] == c12, "only the last two segments' cells are in memory (%d)" % mem2["cells"])
        check(mem2["geometries"] < mem1["geometries"] * 1.35 + 40, "geometry count stays bounded (%d -> %d)" % (mem1["geometries"], mem2["geometries"]))
        col = page.evaluate("__debug.TU.cave._W.segs[1].connector[0].collapsed")
        check(col, "the shaft into segment 1 collapsed behind you")
        z2 = page.evaluate("__debug.TU.cave.zoneAt(__debug.TU.cave.spot('segStart').pos)")
        check(z2["index"] >= 6, "deeper again: %s (zone %d)" % (z2["name"], z2["index"]))
        page.evaluate("__debug.teleport('segStart'); __debug.sim(1)")
        snap(page, "END_07_segment2")
        st = page.evaluate("__debug.teleport('mid'); __debug.getStats()")
        md2 = page.evaluate("__debug.TU.cave.mapData()")
        top_y = max(q[1] for pth in md2["paths"] for q in pth["points"])
        check(top_y < -100, "the freed first cave is off the map (highest point %.0f m)" % top_y)
        # call the dive from the pause menu: a good ending
        page.evaluate("__debug.teleport('segStart'); __debug.sim(0.5)")
        page.keyboard.press("Escape")
        page.wait_for_selector("#ui-btn-quit", state="visible", timeout=60000)
        page.evaluate("document.querySelector('#ui-btn-quit').click()")
        sm = page.evaluate("__debug.TU.state.data.summary")
        check(page.evaluate("__debug.TU.state.current") == "results" and sm["reason"] == "endless" and sm["sealedAbove"], "calling it in the Beyond is a good ending (the way up has collapsed)")
        # a new dive afterwards rebuilds a fresh first cave
        st = page.evaluate("__debug.start({ seed: 777001, difficulty: 'easy' }); __debug.getStats()")
        mem3 = page.evaluate(MEM)
        check(len(mem3["segs"]) == 1 and st["endSeg"] == 0, "a new dive starts with one fresh cave")

        browser.close()
    httpd.shutdown()
    real = errors
    if errors:
        print("console/page errors:")
        for e in errors:
            print("   ", e)
    check(not real, "zero console errors")
    print("test_endless: all good")


if __name__ == "__main__":
    main()
