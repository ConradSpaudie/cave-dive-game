"""Fast targeted test for the generated cave (agent A: js/cave*.js).

What it does (about 2 to 4 minutes, software rendering):
  1. Serves the folder (same wrapping and local three.js as run_test.py, on another port).
  2. For several seeds and difficulties: starts a dive, then checks the TU.cave query API:
     spawn inside water, the main center line inside open space, collide pushes points back in,
     dry chamber floors, water surfaces, every stalactite tip DOWN and stalagmite tip UP,
     every named spot valid, mapData, finds, currents, and an earthquake that collapses a branch.
  3. Takes screenshots at the named spots (flashlight on), one with the light off, and an
     x-ray overview of the whole cave, saved to tests/screens/A_*.png.
  4. Fails on any console error.

Run:  python3 tests/test_cave.py            (all checks and screenshots)
      python3 tests/test_cave.py quick      (checks only, no screenshots)
      python3 tests/test_cave.py shots      (screenshots only)
"""
import base64
import http.server
import json
import os
import re
import socketserver
import sys
import threading
import time
from urllib.parse import urlparse, parse_qs

from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
SHOTS = os.path.join(HERE, "screens")
CDN = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"
PORT = 8779
THREE = os.path.join(HERE, "node_modules", "three", "build", "three.min.js")


def harness_html():
    body = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read().replace(CDN, "/three.min.js")
    return ("<!doctype html><html><head><meta charset=utf-8>"
            "<meta name=viewport content='width=device-width,initial-scale=1'></head><body>" + body + "</body></html>")


def serve():
    three = open(THREE, "rb").read()

    class Q(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *a, **k):
            super().__init__(*a, directory=ROOT, **k)

        def log_message(self, *a):
            pass

        def do_GET(self):
            u = urlparse(self.path)
            if u.path in ("/", "/index.html"):
                data, ctype = harness_html().encode("utf-8"), "text/html; charset=utf-8"
            elif u.path == "/three.min.js":
                data, ctype = three, "application/javascript"
            else:
                return super().do_GET()
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.ThreadingTCPServer(("127.0.0.1", 0), Q)  # any free port (other agents run tests too)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


CHECKS = r"""() => {
  const TU = __debug.TU, C = TU.cave, T = THREE, W = C._W, G = W.G, GEO = TU.caveGeo;
  const out = { stats: C.stats(), fails: [], warn: [] };
  const fail = (m) => out.fails.push(m);
  const f = (p) => GEO.field(G, p.x, p.y, p.z);
  // spawn point in water, not in air, away from the walls
  const sp = C.spawnPoint(), ns = C.nearestPoint(sp.pos);
  out.spawn = { inside: ns.inside, dry: ns.dry, wall: +ns.wallDist.toFixed(2), area: ns.area };
  if (!ns.inside || ns.dry || ns.wallDist < 0.5) fail('spawn not in open water: ' + JSON.stringify(out.spawn));
  // the main center line runs through open space (except across dry chamber floors)
  let tot = 0, bad = 0;
  const pts = G.main.pts, owner = G.main.owner;
  for (let i = 0; i < pts.length - 1; i++) {
    const P = G.pieces[owner[i]];
    for (let k = 0; k < 4; k++) {
      const a = pts[i], b = pts[i + 1], u = k / 4;
      const q = new T.Vector3(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u);
      if (P.dry || G.pieces[TU.caveGeo.pieceAt(G, q.x, q.y, q.z)]?.dry) continue;
      tot++; if (f(q) > -0.3) bad++;
    }
  }
  out.mainLine = { samples: tot, blocked: bad, frac: +(bad / Math.max(1, tot)).toFixed(4), length: Math.round(G.main.L) };
  if (bad / Math.max(1, tot) > 0.01) fail('main line blocked at ' + bad + ' of ' + tot + ' samples');
  // all branch paths too (loops reconnect, dead ends end)
  let bt = 0, bb = 0;
  G.paths.forEach(p => { if (p.kind === 'main') return; for (let i = 0; i < p.pts.length; i++) { const P = G.pieces[p.owner[i]]; if (P.dry) continue; bt++; if (GEO.field(G, p.pts[i][0], p.pts[i][1], p.pts[i][2]) > -0.25) bb++; } });
  out.branches = { paths: G.paths.length - 1, samples: bt, blocked: bb };
  if (bb / Math.max(1, bt) > 0.02) fail('branch lines blocked at ' + bb + ' of ' + bt);
  // nearestPoint on the line says inside; random water spots; collide pushes back in
  const rnd = TU.rng(77, 99).fn();
  let pushed = 0, escaped = 0, kept = 0;
  for (let i = 0; i < 160; i++) {
    const s = C.randomSpot({ surface: 'water', frac: [0.1, 0.8] }, rnd); if (!s) continue;
    const np = C.nearestPoint(s.pos);
    if (!np.inside) fail('randomSpot water not inside at ' + s.pos.toArray().map(v => v.toFixed(1)));
    // a still sphere in open water is not moved
    if (f(s.pos) < -0.6) { const r0 = C.collide(s.pos, 0.3); if (r0.hit && r0.depth > 0.02) kept++; }
    // shove it into the wall and let collide bring it back
    const dir = new T.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize();
    const d = C.raycast(s.pos, dir, 12);
    const p = s.pos.clone().addScaledVector(dir, d + 0.25), vel = dir.clone().multiplyScalar(2);
    for (let k = 0; k < 6; k++) { const r = C.collide(p, 0.32, { vel: vel, hint: {} }); p.copy(r.pos); vel.copy(r.vel); }
    pushed++; if (f(p) > -0.05) escaped++;
  }
  out.collide = { pushed, escaped, movedStill: kept };
  if (escaped > pushed * 0.03) fail('collide left ' + escaped + ' of ' + pushed + ' spheres in the rock');
  if (kept > 3) fail('collide moved ' + kept + ' spheres that were in open water');
  // water surfaces and dry chambers
  const F = C.features;
  F.airPockets.forEach(a => {
    const above = new T.Vector3(a.pos.x, a.surfaceY + 0.3, a.pos.z), below = new T.Vector3(a.pos.x, a.surfaceY - 0.8, a.pos.z);
    if (!C.isDry(above)) fail('air pocket ' + a.id + ': above surface not dry');
    if (C.isDry(below)) fail('air pocket ' + a.id + ': below surface dry');
    if (!C.contains(above, 0.25)) fail('air pocket ' + a.id + ': no air space above the surface');
    const head = new T.Vector3(a.pos.x, a.surfaceY + 0.9, a.pos.z);
    if (!C.contains(head, 0.3)) fail('air pocket ' + a.id + ': dome too low for your head');
    if (C.waterSurfaceY(below) == null) fail('air pocket ' + a.id + ': no surfaceY under it');
  });
  out.dry = F.dryChambers.map(d => {
    const r = { id: d.id, waterY: +d.waterY.toFixed(2), floorY: +d.floorY.toFixed(2), ledge: d.ledge ? +d.ledge.height.toFixed(1) : null };
    return r;
  });
  const dc = C.spot('drychamber');
  if (F.dryChambers.length && !dc) fail('dry chamber exists but no drychamber spot');
  if (dc) {
    const n = C.nearestPoint(dc.pos);
    out.drySpot = { dry: n.dry, isDry: C.isDry(dc.pos), floorGap: +(dc.pos.y - n.floorY).toFixed(2), surfaceY: n.surfaceY, ceil: +(n.ceilY - dc.pos.y).toFixed(2) };
    if (!C.isDry(dc.pos) || !n.dry) fail('drychamber spot is not dry');
    if (Math.abs(dc.pos.y - n.floorY - 0.9) > 0.35) fail('drychamber floor not found under the spot: gap ' + (dc.pos.y - n.floorY));
    if (n.floorY < n.surfaceY) fail('drychamber floor below the water line');
  }
  const lg = C.spot('ledge');
  if (lg) {
    const n = C.nearestPoint(lg.pos), d = F.dryChambers.find(x => x.ledge);
    out.ledgeSpot = { floorGap: +(lg.pos.y - n.floorY).toFixed(2), drop: d ? d.ledge.height : null, dry: n.dry };
    if (!n.dry || Math.abs(lg.pos.y - n.floorY - 0.9) > 0.4) fail('ledge spot not standing on the ledge');
  }
  // the entrance is the real surface
  const e = F.entrance;
  if (!C.isDry(new T.Vector3(e.pos.x, 0.4, e.pos.z))) fail('entrance: above the pool should be air');
  if (C.waterSurfaceY(e.pos) !== 0) fail('entrance surfaceY should be 0');
  // formations: every stalactite tip points DOWN, every stalagmite UP, straws hang down
  const scene = TU.scene, m = new T.Matrix4(), res = {};
  for (const [name, wantDown] of [['stalactites', true], ['stalagmites', false], ['sodastraws', true]]) {
    const meshes = []; scene.traverse(o => { if (o.name === name && o.isInstancedMesh) meshes.push(o); });
    if (!meshes.length) { fail('missing mesh ' + name); continue; }
    let down = 0, up = 0, count = 0;
    meshes.forEach(mesh => { count += mesh.count; for (let i = 0; i < mesh.count; i++) { mesh.getMatrixAt(i, m); const b = new T.Vector3(0, 0, 0).applyMatrix4(m), t = new T.Vector3(0, 1, 0).applyMatrix4(m); if (t.y < b.y) down++; else up++; } });
    res[name] = { count, meshes: meshes.length, first: scene.getObjectByName(name).count, down, up };
    if (name !== 'sodastraws' && scene.getObjectByName(name).count < (name === 'stalactites' ? 51 : 6)) fail('first ' + name + ' mesh too small for run_test.py');
    if (wantDown && up) fail(name + ': ' + up + ' point up');
    if (!wantDown && down) fail(name + ': ' + down + ' point down');
  }
  const g = scene.getObjectByName('stalactites').geometry; g.computeBoundingBox();
  res.geomY = [+g.boundingBox.min.y.toFixed(3), +g.boundingBox.max.y.toFixed(3)];
  if (Math.abs(res.geomY[0]) > 0.02 || Math.abs(res.geomY[1] - 1) > 0.02) fail('cone geometry must span y 0..1');
  // stalactite bases are in the ceiling (just above the tip + length there is rock)
  let floating = 0;
  F.stalactites.forEach(s => { const base = s.pos.clone(); base.y += s.len + 0.12; if (GEO.field(G, base.x, base.y, base.z) < -0.15) floating++; });
  res.floatingBases = floating;
  if (floating > F.stalactites.length * 0.03) fail(floating + ' stalactites have no rock above them');
  out.formations = res;
  // named spots
  out.spots = {};
  C.spotNames().forEach(n => {
    const s = C.spot(n); if (!s) return;
    const np = C.nearestPoint(s.pos);
    out.spots[n] = { wall: +np.wallDist.toFixed(2), area: np.area, type: np.pieceType, dry: np.dry, s: +(s.s || 0).toFixed(1) };
    if (np.wallDist < 0.25 && n !== 'pocketSurface') fail('spot ' + n + ' too close to rock: ' + np.wallDist.toFixed(2));
  });
  ['entrance', 'mid', 'deep', 'end', 'branch', 'branchEnd'].forEach(n => { if (!C.spot(n)) fail('missing required spot ' + n); });
  const end = C.spot('end'), b = F.bottom;
  if (end) { const d = end.pos.distanceTo(b.pos); if (d < b.radius + 1 || d > 12) fail('end spot distance to core ' + d.toFixed(1)); if (C.raycast(end.pos, b.pos.clone().sub(end.pos).normalize(), d) < d - 0.5) fail('end spot cannot see the core'); }
  if (C.features.siltAreas.length === 0) fail('no silt area');
  const sl = C.spot('silt'); if (sl) { const n = C.nearestPoint(sl.pos); out.siltSpot = { silt: n.siltiness, floorGap: +(sl.pos.y - n.floorY).toFixed(2) }; if (n.siltiness < 0.5) fail('silt spot not silty'); }
  // currents expose a flow vector
  out.currents = F.currents.length;
  if (F.currents.length) { const cs = C.spot('current'); const n = C.nearestPoint(cs.pos); out.currentFlow = +n.current.length().toFixed(2); if (n.current.length() < 0.2) fail('current spot has no flow'); }
  // temperatures and daylight
  out.temp = { spawn: +ns.temperature.toFixed(1), deep: +C.nearestPoint(C.spot('deep').pos).temperature.toFixed(1) };
  out.daylight = { spawn: +ns.daylight.toFixed(2), mid: +C.nearestPoint(C.spot('mid').pos).daylight.toFixed(2) };
  if (ns.daylight < 0.3) fail('spawn should see daylight');
  // map and finds
  const md = C.mapData();
  out.map = { segments: md.segments.length, chambers: md.chambers.length, airPockets: md.airPockets.length, bottom: !!md.bottom, entrance: !!md.entrance };
  if (!md.segments.length || !md.bottom) fail('mapData incomplete');
  out.finds = F.finds.map(x => x.kind + x.tier).join(' ');
  out.airHints = F.airHints.length;
  if (F.airPockets.length && !F.airHints.length) fail('no air hints');
  return out;
}"""

QUAKE = r"""() => {
  const TU = __debug.TU, C = TU.cave, G = C._W.G, GEO = TU.caveGeo, T = THREE;
  let ev = { quake: 0, collapse: null };
  TU.on('quake', () => ev.quake++); TU.on('cave:collapse', e => ev.collapse = e);
  const r = C.quake(1.6);
  const out = { result: r, events: { quake: ev.quake, collapse: ev.collapse ? ev.collapse.pieceId : null } };
  if (r && r.collapsed != null) {
    const P = G.byId[r.collapsed], n = P.node || P.center;
    out.blockedField = +GEO.field(G, n[0], n[1], n[2]).toFixed(2);
  }
  __debug.sim(3);
  out.falling = C._W.falling.map(f => f.settled).length;
  return out;
}"""


PAUSE = "(() => { const F = __debug.TU.fx; if (!F._render) F._render = F.render; F.render = function () {}; })()"
RESUME = "(() => { const F = __debug.TU.fx; if (F._render) F.render = F._render; })()"
LAUNCH = ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required", "--enable-unsafe-swiftshader"]


def shot(page, name):
    # Rendering is paused (software GL is very slow): draw one frame and copy the WebGL canvas
    # right away (no page screenshot: that path crashes the GPU process under heavy load).
    data = page.evaluate("""(() => { const F = __debug.TU.fx; if (F._render) F.render = F._render;
      __debug.render(); const d = __debug.TU.canvas.toDataURL('image/png'); F.render = function () {}; return d; })()""")
    open(os.path.join(SHOTS, name), "wb").write(base64.b64decode(data.split(",")[1]))
    print("  saved tests/screens/" + name, flush=True)


PLAN = [("entrance", "{}"), ("entrance_up", "{pitch: 1.1}"), ("mid", "{}"), ("junction", "{}"), ("pocket", "{pitch: 0.75}"), ("pocketSurface", "{pitch: 0.05}"),
        ("squeeze", "{}"), ("silt", "{}"), ("drop", "{pitch: -0.4}"), ("current", "{}"), ("drychamber", "{}"), ("ledge", "{}"),
        ("landmark", "{}"), ("stalactites", "{}"), ("branchEnd", "{}"), ("deep", "{}"), ("end", "{}"), ("deep_light_off", "{}"), ("overview", None)]
OVERVIEW = """(() => {
  const TU = __debug.TU, T = THREE, W = TU.cave._W, md = TU.cave.mapData();
  const lo = md.bounds.min.slice(), hi = md.bounds.max.slice(); hi[1] = Math.min(hi[1], 0); const c = new T.Vector3((lo[0]+hi[0])/2, (lo[1]+hi[1])/2, (lo[2]+hi[2])/2);
  const size = Math.max(hi[0]-lo[0], hi[1]-lo[1], hi[2]-lo[2]);
  W.noCull = true; W.chunks.forEach(ch => ch.mesh.visible = true); (W.instRegions || []).forEach(m => m.visible = true);
  const cam = TU.camera, far = cam.far; cam.far = size * 4; cam.position.set(c.x + size * 0.42, c.y + size * 0.12, c.z + size * 0.42); cam.lookAt(c); cam.updateProjectionMatrix();
  const fog = TU.scene.fog.density; TU.scene.fog.density = 0.0008;
  const hemi = new T.HemisphereLight(0xdfeff0, 0x2a2420, 1.6); TU.scene.add(hemi);
  TU.renderer.render(TU.scene, cam);
  const d = TU.canvas.toDataURL('image/png');
  TU.scene.remove(hemi); TU.scene.fog.density = fog; W.noCull = false; cam.far = far; cam.updateProjectionMatrix();
  return d;
})()"""


def screenshots(p, url, errors):
    """Screenshots of seed 1 at every named spot (flashlight on), one with the light off, and an
    x-ray overview. A crashed browser is relaunched and continues where it stopped."""
    todo = list(PLAN)
    for attempt in range(4):
        if not todo:
            return
        browser = p.chromium.launch(args=LAUNCH)
        try:
            page = browser.new_page(viewport={"width": 960, "height": 560})
            page.set_default_timeout(400000)
            page.route(re.compile(r"https://fonts\.(googleapis|gstatic)\.com/.*"), lambda r: r.fulfill(status=200, content_type="text/css", body=""))
            page.on("console", lambda m: errors.append("[shots] console.%s: %s" % (m.type, m.text)) if m.type == "error" else None)
            page.on("pageerror", lambda e: errors.append("[shots] pageerror: %s" % e))
            page.goto(url)
            page.wait_for_function("window.__debug !== undefined", timeout=180000)
            page.evaluate(PAUSE)
            # pictures in full quality (the software renderer would otherwise use the light shader)
            page.evaluate("__debug.TU.caveMat.setLow(false); __debug.start({seed: 1, difficulty: 'standard'}); __debug.screenshotMode(true)")
            names = page.evaluate("__debug.TU.cave.spotNames()")
            while todo:
                n, opts = todo[0]
                if n == "overview":
                    data = page.evaluate(OVERVIEW)
                    open(os.path.join(SHOTS, "A_overview.png"), "wb").write(base64.b64decode(data.split(",")[1]))
                    print("  saved tests/screens/A_overview.png", flush=True)
                elif n == "deep_light_off":
                    page.evaluate("__debug.teleport('deep'); __debug.lookAtCore(); __debug.TU.player.toggleFlash(); __debug.sim(0.5)")
                    shot(page, "A_deep_light_off.png")
                    page.evaluate("__debug.TU.player.toggleFlash()")
                else:
                    spot = "entrance" if n == "entrance_up" else n
                    if spot not in names:
                        print("  (no spot %s in this cave)" % n)
                    else:
                        page.evaluate("__debug.teleport('%s', %s); __debug.sim(0.4)" % (spot, opts))
                        if n in ("deep", "end"):
                            page.evaluate("__debug.lookAtCore(); __debug.sim(0.2)")
                        shot(page, "A_%s.png" % n)
                todo.pop(0)
        except Exception as e:
            print("  screenshot browser failed (%s), retrying" % str(e)[:120], flush=True)
        try:
            browser.close()
        except Exception:
            pass
    if todo:
        errors.append("screenshots incomplete: " + ", ".join(t[0] for t in todo))


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "all"
    quick = mode == "quick"
    os.makedirs(SHOTS, exist_ok=True)
    httpd = serve()
    errors = []
    fails = []
    url = "http://127.0.0.1:%d/" % httpd.server_address[1]
    with sync_playwright() as p:
        browser = p.chromium.launch(args=LAUNCH)
        page = browser.new_page(viewport={"width": 960, "height": 560})
        page.set_default_timeout(300000)
        page.route(re.compile(r"https://fonts\.(googleapis|gstatic)\.com/.*"), lambda r: r.fulfill(status=200, content_type="text/css", body=""))
        page.on("console", lambda m: errors.append("console.%s: %s" % (m.type, m.text)) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append("pageerror: %s" % e))
        t0 = time.time()
        page.goto(url)
        page.wait_for_function("window.__debug !== undefined", timeout=180000)
        page.evaluate(PAUSE)
        print("boot %.1fs, init cave:" % (time.time() - t0), page.evaluate("JSON.stringify(__debug.TU.cave.stats())"))
        runs = [(1, "standard"), (7, "easy"), (12345, "hard"), (424242, "standard"), (2, "easy")]
        if mode == "shots":
            runs = []
        for seed, diff in runs:
            t1 = time.time()
            page.evaluate("__debug.start({seed: %d, difficulty: '%s'})" % (seed, diff))
            res = page.evaluate(CHECKS)
            print("\n== seed %d %s (%.1fs) ==" % (seed, diff, time.time() - t1))
            for k, v in res.items():
                if k != "fails":
                    print("  %s: %s" % (k, json.dumps(v)))
            for f in res["fails"]:
                fails.append("seed %d %s: %s" % (seed, diff, f))
                print("  FAIL:", f)
            # every spot can be visited without errors
            for n in page.evaluate("__debug.TU.cave.spotNames()"):
                page.evaluate("__debug.teleport('%s'); __debug.sim(0.25)" % n)
            q = page.evaluate(QUAKE)
            print("  quake:", json.dumps(q))
            if not q["events"]["quake"]:
                fails.append("seed %d: quake event not emitted" % seed)
            if q["result"]["collapsed"] is not None and (q["events"]["collapse"] is None or q["blockedField"] < 0):
                fails.append("seed %d: collapse did not block the passage" % seed)

        page.evaluate(RESUME)
        browser.close()
        if not quick:
            screenshots(p, url, errors)
    httpd.shutdown()
    print("FAILS:", len(fails))
    for f in fails:
        print("  ", f)
    print("ERRORS:", len(errors))
    for e in errors:
        print("  ", e)
    sys.exit(1 if (errors or fails) else 0)


if __name__ == "__main__":
    main()
