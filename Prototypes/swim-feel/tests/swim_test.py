"""Playwright smoke test for the swim-feel prototype.

Builds a harness copy of the artifact (wrapped in a minimal document skeleton,
with the cdnjs three.js URL swapped for a local copy because cdnjs is blocked
in this sandbox), serves it locally, drives a short dive and saves screenshots.
"""
import http.server
import os
import shutil
import socketserver
import sys
import threading
import time

from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "swim-feel", "index.html")
SHOTS = os.path.join(HERE, "..", "swim-feel", "screens")
CDN = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"
PORT = 8765


def build_harness():
    body = open(SRC, encoding="utf-8").read()
    assert CDN in body, "artifact must reference cdnjs three r128"
    for bad in ("<!DOCTYPE", "<!doctype", "<html", "<head", "<body", "—"):
        assert bad not in body, "forbidden token in artifact: %r" % bad
    body = body.replace(CDN, "three.min.js")
    html = "<!doctype html><html><head><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'></head><body>" + body + "</body></html>"
    open(os.path.join(HERE, "harness.html"), "w", encoding="utf-8").write(html)
    shutil.copy(os.path.join(HERE, "node_modules", "three", "build", "three.min.js"), os.path.join(HERE, "three.min.js"))
    print("artifact size: %.1f KB" % (os.path.getsize(SRC) / 1024))


def serve():
    class Q(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *a, **k):
            super().__init__(*a, directory=HERE, **k)

        def log_message(self, *a):
            pass

    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(("127.0.0.1", PORT), Q)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def main():
    build_harness()
    os.makedirs(SHOTS, exist_ok=True)
    httpd = serve()
    errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"])
        page = browser.new_page(viewport={"width": 1280, "height": 760})
        page.set_default_timeout(180000)
        page.on("console", lambda m: errors.append("console.%s: %s" % (m.type, m.text)) if m.type == "error" and "ERR_TUNNEL_CONNECTION_FAILED" not in m.text else None)
        page.on("pageerror", lambda e: errors.append("pageerror: %s" % e))
        page.on("requestfailed", lambda r: print("request failed (ok if font):", r.url))
        t0 = time.time()
        page.goto("http://127.0.0.1:%d/harness.html" % PORT)
        page.wait_for_function("window.__debug !== undefined", timeout=60000)
        print("boot %.1fs" % (time.time() - t0))
        page.wait_for_timeout(1500)
        page.screenshot(path=os.path.join(SHOTS, "01_start.png"))

        page.click("#btnStart")
        page.wait_for_timeout(600)
        page.mouse.move(640, 380)
        page.mouse.down()
        page.mouse.move(630, 382, steps=4)
        page.mouse.up()
        page.keyboard.down("w")
        page.wait_for_timeout(1500)
        page.keyboard.up("w")
        look = page.evaluate("[__debug.get('t'), __debug.state().pos]")
        print("mouse look moved camera; resetting view for deterministic run", look)
        st = page.evaluate("__debug.teleport('entrance'); __debug.sim(4, ['KeyW'])")
        print("after W:", st)
        assert st["s"] > 7, "player should have swum forward"
        page.evaluate("__debug.sim(0.6)")
        page.wait_for_timeout(1200)
        page.screenshot(path=os.path.join(SHOTS, "02_entrance.png"))
        page.evaluate("__debug.look(__debug.get('t')*0+0.0, 0); __debug.teleport(9, {yaw: 3.14, pitch: 0.1}); __debug.sim(0.5)")
        page.wait_for_timeout(1200)
        page.screenshot(path=os.path.join(SHOTS, "02b_looking_back_to_daylight.png"))

        page.evaluate("__debug.teleport('mid'); __debug.sim(2, ['KeyW']); __debug.sim(1)")
        page.wait_for_timeout(1200)
        page.screenshot(path=os.path.join(SHOTS, "03_mid_tunnel_flashlight.png"))
        page.keyboard.press("q")
        page.evaluate("__debug.sim(0.3); __debug.teleport('mid', {yaw: 3.14}); __debug.sim(1.5, ['KeyW']); __debug.sim(1)")
        page.wait_for_timeout(1200)
        page.screenshot(path=os.path.join(SHOTS, "04_rope_and_waypoint.png"))

        st = page.evaluate("__debug.teleport('silt'); __debug.sim(3.5, ['ShiftLeft','KeyW']); __debug.sim(1.0)")
        print("silt:", st)
        assert st["silt"] > 0.3, "sprinting over silt should cause a silt-out"
        page.wait_for_timeout(1200)
        page.screenshot(path=os.path.join(SHOTS, "05_silt_out.png"))
        st = page.evaluate("__debug.sim(12)")
        print("silt after 12s:", st["silt"])
        page.wait_for_timeout(1200)
        page.screenshot(path=os.path.join(SHOTS, "05b_silt_settled.png"))

        page.evaluate("__debug.teleport('pocket', {dy: -0.5, pitch: 0.75}); __debug.sim(0.5)")
        page.wait_for_timeout(1200)
        page.screenshot(path=os.path.join(SHOTS, "06_air_pocket_below.png"))
        page.evaluate("__debug.set('air', 120); __debug.teleport('pocketSurface', {pitch: 0.12}); __debug.sim(2)")
        st = page.evaluate("__debug.state()")
        print("pocket:", st)
        assert st["surfaced"], "should be surfaced in the air pocket"
        assert st["air"] > 130, "air should refill when surfaced"
        page.wait_for_timeout(1200)
        page.screenshot(path=os.path.join(SHOTS, "07_air_pocket_surfaced.png"))

        st = page.evaluate("__debug.teleport('squeeze'); __debug.sim(1.5, ['KeyW'])")
        print("squeeze:", st)
        page.wait_for_timeout(1200)
        page.screenshot(path=os.path.join(SHOTS, "08_squeeze.png"))

        page.evaluate("__debug.teleport('deep'); __debug.lookAtCore(); __debug.sim(1.5)")
        page.wait_for_timeout(1200)
        page.screenshot(path=os.path.join(SHOTS, "09_end_chamber.png"))
        page.keyboard.press("f")
        page.evaluate("__debug.sim(0.5)")
        page.wait_for_timeout(1200)
        page.screenshot(path=os.path.join(SHOTS, "10_end_chamber_light_off.png"))
        page.keyboard.press("f")

        page.evaluate("__debug.teleport('branchEnd'); __debug.sim(0.8)")
        page.wait_for_timeout(1200)
        page.screenshot(path=os.path.join(SHOTS, "11_branch_dead_end.png"))

        page.evaluate("__debug.teleport('end'); __debug.lookAtCore()")
        st = page.evaluate("__debug.sim(12, ['KeyW'])")
        print("end:", st)
        assert st["state"] == "end", "touching the ancient thing should end the run"
        page.wait_for_timeout(1500)
        page.screenshot(path=os.path.join(SHOTS, "12_results.png"))

        page.click("#btnRestart2")
        page.wait_for_timeout(500)
        st = page.evaluate("__debug.set('air', 0.5); __debug.sim(6)")
        print("drown:", st)
        assert st["state"] == "end"
        page.wait_for_timeout(1200)
        page.screenshot(path=os.path.join(SHOTS, "13_drowned.png"))

        # rough frame time
        page.click("#btnRestart2")
        page.wait_for_timeout(500)
        fps = page.evaluate("new Promise(r=>{let n=0;const t=performance.now();function f(){n++; if(performance.now()-t<2000) requestAnimationFrame(f); else r(n/2);} requestAnimationFrame(f);})")
        print("fps in swiftshader: %.1f" % fps)

        # phone message
        page.close()
        mob = browser.new_page(viewport={"width": 390, "height": 800}, has_touch=True, is_mobile=True, device_scale_factor=1)
        mob.set_default_timeout(180000)
        mob.on("pageerror", lambda e: errors.append("mobile pageerror: %s" % e))
        mob.goto("http://127.0.0.1:%d/harness.html" % PORT)
        mob.wait_for_function("window.__debug !== undefined", timeout=60000)
        mob.wait_for_timeout(800)
        mob.screenshot(path=os.path.join(SHOTS, "14_phone_start.png"))
        browser.close()
    httpd.shutdown()
    print("ERRORS:", len(errors))
    for e in errors:
        print("  ", e)
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
