"""Playwright smoke test for Tied Under (the modular build).

What it does:
  1. Static checks on index.html and js/*.js (artifact rules: no doctype/html/head/body tags,
     first lines, only the cdnjs three.js script, no em dashes, no alert/confirm/prompt, no fetch,
     no WebSocket/WebRTC, no ES modules).
  2. Serves the folder locally. "/" is index.html wrapped in a minimal doctype page, with the cdnjs
     three.js URL swapped for a local copy (cdnjs is blocked in this sandbox). Google Fonts requests
     are answered with empty CSS so they do not log errors.
  3. Drives a dive with window.__debug (software rendering is about 1 fps, so it steps the game
     directly), saves screenshots to tests/screens/, and asserts zero console errors.
  4. Checks that every stalactite points DOWN and every stalagmite points UP (instance matrices),
     and saves a screenshot looking up at the stalactites.
  5. Boots again with creatures.js and audio.js removed, to prove the core.js stubs keep the game running.

Run:  python3 tests/run_test.py
"""
import http.server
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
PORT = 8771
THREE_CANDIDATES = [
    os.path.join(HERE, "node_modules", "three", "build", "three.min.js"),
    os.path.join(ROOT, "..", "tests", "node_modules", "three", "build", "three.min.js"),
]


def three_path():
    for p in THREE_CANDIDATES:
        if os.path.exists(p):
            return p
    sys.exit("three.min.js r128 not found: run `npm i three@0.128.0` in tests/")


def static_checks():
    idx = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
    lines = [l for l in idx.splitlines()]
    assert lines[0].strip() == "<title>Tied Under</title>", "first line must be the title"
    assert lines[1].strip() == '<meta name="claude:viewport-fit-sides" content="cover">', "second line must be the viewport meta"
    assert lines[2].strip() == "<style>", "third line must open <style>"
    for bad in ("<!DOCTYPE", "<!doctype", "<html", "<head", "<body"):
        assert bad not in idx, "forbidden tag in index.html: %r" % bad
    scripts = re.findall(r'<script[^>]*src="([^"]+)"', idx)
    externals = [s for s in scripts if s.startswith("http")]
    assert externals == [CDN], "only the cdnjs three.js script may be external, got %r" % externals
    assert scripts.index(CDN) == 0, "three.js must load before our scripts"
    assert all(s.startswith("js/") for s in scripts[1:]), "our scripts must be relative js/ paths"
    files = {"index.html": idx}
    for name in sorted(os.listdir(os.path.join(ROOT, "js"))):
        if name.endswith(".js"):
            files["js/" + name] = open(os.path.join(ROOT, "js", name), encoding="utf-8").read()
    contract = os.path.join(ROOT, "CONTRACT.md")
    if os.path.exists(contract):
        files["CONTRACT.md"] = open(contract, encoding="utf-8").read()
    for name, text in files.items():
        assert "\u2014" not in text, "em dash found in %s" % name
        if name.endswith(".md"):
            continue
        for pat, why in ((r"\balert\s*\(", "alert"), (r"\bconfirm\s*\(", "confirm"), (r"(?<![\w.])prompt\s*\(", "prompt"),
                         (r"\bfetch\s*\(", "fetch"), (r"\bWebSocket\b", "WebSocket"), (r"RTCPeerConnection", "WebRTC"),
                         (r"^\s*import\s", "ES module import"), (r"^\s*export\s", "ES module export"), (r"\bdownload=", "download link")):
            assert not re.search(pat, text, re.M), "%s found in %s" % (why, name)
        # every localStorage use must sit inside a try block on the same line
        for line in text.splitlines():
            if "localStorage." in line:
                assert "try" in line, "localStorage outside try/catch in %s: %s" % (name, line.strip())
    total = sum(os.path.getsize(os.path.join(ROOT, n)) for n in files if n != "CONTRACT.md")
    print("static checks ok; page + scripts: %.1f KB" % (total / 1024))


def harness_html(drop):
    body = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read().replace(CDN, "/three.min.js")
    for d in drop:
        body = body.replace('<script src="js/%s.js"></script>' % d, "<!-- dropped %s -->" % d)
    return ("<!doctype html><html><head><meta charset=utf-8>"
            "<meta name=viewport content='width=device-width,initial-scale=1'></head><body>" + body + "</body></html>")


def serve():
    three = open(three_path(), "rb").read()

    class Q(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *a, **k):
            super().__init__(*a, directory=ROOT, **k)

        def log_message(self, *a):
            pass

        def do_GET(self):
            u = urlparse(self.path)
            if u.path in ("/", "/index.html"):
                drop = [d for d in parse_qs(u.query).get("drop", [""])[0].split(",") if d]
                data = harness_html(drop).encode("utf-8")
                ctype = "text/html; charset=utf-8"
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
    httpd = socketserver.ThreadingTCPServer(("127.0.0.1", PORT), Q)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def new_page(browser, errors, tag, **kw):
    page = browser.new_page(**kw)
    page.set_default_timeout(240000)
    page.route(re.compile(r"https://fonts\.(googleapis|gstatic)\.com/.*"), lambda r: r.fulfill(status=200, content_type="text/css", body=""))
    page.on("console", lambda m: errors.append("%s console.%s: %s" % (tag, m.type, m.text)) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append("%s pageerror: %s" % (tag, e)))
    page.on("requestfailed", lambda r: errors.append("%s request failed: %s" % (tag, r.url)))
    return page


def shot(page, name, clean=False):
    if clean:
        page.evaluate("__debug.screenshotMode(true)")
    page.evaluate("__debug.render()")
    page.screenshot(path=os.path.join(SHOTS, name))
    if clean:
        page.evaluate("__debug.screenshotMode(false)")


STALACTITE_CHECK = """() => {
  const T = THREE, scene = __debug.TU.scene;
  const res = {};
  for (const name of ['stalactites', 'stalagmites']) {
    const mesh = scene.getObjectByName(name);
    const m = new T.Matrix4();
    let down = 0, up = 0;
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, m);
      const base = new T.Vector3(0, 0, 0).applyMatrix4(m), tip = new T.Vector3(0, 1, 0).applyMatrix4(m);
      if (tip.y < base.y) down++; else up++;
    }
    res[name] = { count: mesh.count, tipDown: down, tipUp: up };
  }
  // the wide base of the shared cone must be at local y = 0 and the tip at y = +1
  const g = scene.getObjectByName('stalactites').geometry;
  g.computeBoundingBox();
  res.geomMinY = +g.boundingBox.min.y.toFixed(3); res.geomMaxY = +g.boundingBox.max.y.toFixed(3);
  return res;
}"""


def main():
    static_checks()
    os.makedirs(SHOTS, exist_ok=True)
    httpd = serve()
    errors = []
    url = "http://127.0.0.1:%d/" % PORT
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"])
        page = new_page(browser, errors, "[desktop]", viewport={"width": 1280, "height": 760})
        t0 = time.time()
        page.goto(url)
        page.wait_for_function("window.__debug !== undefined", timeout=120000)
        print("boot %.1fs" % (time.time() - t0))
        assert page.evaluate("__debug.TU.state.current") == "title"
        page.wait_for_timeout(1500)
        shot(page, "01_title.png")

        # Loadout screen
        page.click("#ui-btn-loadout")
        page.click(".ui-tank[data-tank='standard']")
        assert page.evaluate("__debug.TU.state.current") == "loadout"
        shot(page, "01b_loadout.png")

        # Start the dive from the loadout screen (a real click, so audio and pointer lock get a gesture)
        page.click("#ui-btn-lo-start")
        st = page.evaluate("__debug.getStats()")
        print("started:", {k: st[k] for k in ("state", "seed", "layoutOk", "tanks", "area")})
        assert st["state"] == "dive"
        assert st["layoutOk"], "the generator should have produced a layout for the run seed"
        assert len(st["tanks"]) == 2, "standard loadout has 2 tanks"
        page.mouse.move(640, 380)
        page.mouse.down()
        page.mouse.move(630, 382, steps=4)
        page.mouse.up()
        page.keyboard.down("w")
        page.wait_for_timeout(1200)
        page.keyboard.up("w")

        st = page.evaluate("__debug.teleport('entrance'); __debug.sim(4, ['KeyW'])")
        print("after W:", round(st["s"], 2), "m along the cave")
        assert st["s"] > 7, "player should have swum forward"
        page.evaluate("__debug.sim(0.6)")
        shot(page, "02_entrance.png")
        page.evaluate("__debug.teleport(9, {yaw: 3.14, pitch: 0.1}); __debug.sim(0.5)")
        shot(page, "02b_looking_back_to_daylight.png")

        page.evaluate("__debug.teleport('mid'); __debug.sim(2, ['KeyW']); __debug.sim(1)")
        shot(page, "03_mid_tunnel_flashlight.png")
        page.keyboard.press("q")
        st = page.evaluate("__debug.sim(0.3); __debug.teleport('mid', {yaw: 3.14}); __debug.sim(1.5, ['KeyW']); __debug.sim(1)")
        assert st["wp"] == 1, "Q should drop a waypoint"
        shot(page, "04_rope_and_waypoint.png")

        st = page.evaluate("__debug.teleport('silt'); __debug.sim(3.5, ['ShiftLeft','KeyW']); __debug.sim(1.0)")
        print("silt:", round(st["silt"], 3))
        assert st["silt"] > 0.3, "sprinting over silt should cause a silt-out"
        shot(page, "05_silt_out.png")
        st = page.evaluate("__debug.sim(12)")
        print("silt after 12s:", round(st["silt"], 3))
        assert st["silt"] < 0.3, "silt should settle"
        shot(page, "05b_silt_settled.png")

        page.evaluate("__debug.teleport('pocket', {dy: -0.5, pitch: 0.75}); __debug.sim(0.5)")
        shot(page, "06_air_pocket_below.png")
        page.evaluate("__debug.set('air', 120); __debug.teleport('pocketSurface', {pitch: 0.12}); __debug.sim(2)")
        st = page.evaluate("__debug.getStats()")
        print("pocket:", {k: st[k] for k in ("surfaced", "air", "area")})
        assert st["surfaced"], "should be surfaced in the air pocket"
        assert st["air"] > 130, "air should refill when surfaced"
        shot(page, "07_air_pocket_surfaced.png")

        st = page.evaluate("__debug.teleport('squeeze'); __debug.sim(1.5, ['KeyW'])")
        print("squeeze area:", st["area"])
        shot(page, "08_squeeze.png")

        page.evaluate("__debug.teleport('deep'); __debug.lookAtCore(); __debug.sim(1.5)")
        shot(page, "09_end_chamber.png")
        page.keyboard.press("f")
        page.evaluate("__debug.sim(0.5)")
        assert page.evaluate("__debug.get('flashOn')") is False, "F should turn the light off"
        shot(page, "10_end_chamber_light_off.png")
        page.keyboard.press("f")

        # Stalactites: numeric check of every instance, then a picture looking up at them
        stal = page.evaluate(STALACTITE_CHECK)
        print("stalactites:", stal)
        assert stal["stalactites"]["tipUp"] == 0 and stal["stalactites"]["tipDown"] > 50, "every stalactite must point down"
        assert stal["stalagmites"]["tipDown"] == 0 and stal["stalagmites"]["tipUp"] > 5, "every stalagmite must point up"
        assert abs(stal["geomMinY"]) < 0.05 and abs(stal["geomMaxY"] - 1) < 0.05, "cone base at y=0, tip at y=1"
        st = page.evaluate("__debug.teleport('stalactites'); __debug.sim(0.4)")
        assert st["state"] == "dive", "the stalactite viewpoint must not trigger the end of the run"
        shot(page, "11_stalactites_point_down.png", clean=True)
        page.evaluate("__debug.teleport('stalactites', {pitch: -0.2, yaw: 0.35}); __debug.sim(0.4)")
        shot(page, "11b_stalactites_wide.png", clean=True)

        page.evaluate("__debug.teleport('branchEnd'); __debug.sim(0.8)")
        shot(page, "12_branch_dead_end.png")

        page.evaluate("__debug.teleport('end'); __debug.lookAtCore()")
        st = page.evaluate("__debug.sim(12, ['KeyW'])")
        print("end:", st["state"])
        assert st["state"] == "results", "touching the ancient thing should end the run"
        page.wait_for_timeout(300)
        shot(page, "13_results.png")

        page.click("#ui-btn-again-results")
        st = page.evaluate("__debug.setAir(0.5, true); __debug.sim(6)")
        print("drown:", st["state"])
        assert st["state"] == "dead"
        shot(page, "14_drowned.png")

        page.click("#ui-btn-again-dead")
        page.keyboard.press("Escape")
        assert page.evaluate("__debug.TU.state.current") == "paused", "Esc should pause"
        shot(page, "15_pause_tuning.png")
        page.click("#ui-btn-resume")
        assert page.evaluate("__debug.TU.state.current") == "dive"

        saved = page.evaluate("JSON.parse(localStorage.getItem('tiedUnder.save.v1'))")
        print("save: runs=%s deepest=%.1f boards=%s" % (saved["progress"]["runs"], saved["progress"]["deepestM"], {k: len(v) for k, v in saved["leaderboards"].items()}))
        assert saved["progress"]["runs"] >= 2, "runs should be recorded in the save"

        fps = page.evaluate("new Promise(r=>{let n=0;const t=performance.now();function f(){n++; if(performance.now()-t<2000) requestAnimationFrame(f); else r(n/2);} requestAnimationFrame(f);})")
        print("fps in swiftshader: %.1f" % fps)
        page.close()

        # Missing modules: the stubs in core.js must keep the game alive
        page = new_page(browser, errors, "[no creatures/audio]", viewport={"width": 960, "height": 600})
        page.goto(url + "?drop=creatures,audio")
        page.wait_for_function("window.__debug !== undefined", timeout=120000)
        st = page.evaluate("__debug.start(); __debug.teleport('deep'); __debug.sim(2, ['KeyW'])")
        print("stubbed run:", {k: st[k] for k in ("state", "creatures", "area")})
        assert st["state"] == "dive" and st["creatures"] == 0
        shot(page, "16_stubbed_modules.png")
        page.close()

        # Phone layout of the title screen
        mob = new_page(browser, errors, "[phone]", viewport={"width": 390, "height": 800}, has_touch=True, is_mobile=True, device_scale_factor=1)
        mob.goto(url)
        mob.wait_for_function("window.__debug !== undefined", timeout=120000)
        mob.wait_for_timeout(800)
        wide = mob.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1")
        assert wide, "no horizontal scroll on a phone"
        shot(mob, "17_phone_title.png")
        browser.close()
    httpd.shutdown()
    print("ERRORS:", len(errors))
    for e in errors:
        print("  ", e)
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
