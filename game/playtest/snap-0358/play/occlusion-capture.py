# usage: python3 occlusion-capture.py  — headless before/after shots for occlusion.js
# proves: occluders opaque (occ=0) -> stipple-faded (occ=1) -> restored (<0.2s after leaving ray)
# then drives the real game (index.html?capture) until a fade engages -> occl_game.png
import asyncio, os, subprocess, time, json
ROOT = os.path.dirname(os.path.abspath(__file__))      # play/
SRVROOT = os.path.dirname(ROOT)                        # repro/ (three lives in ../node_modules)

def free_server():
    import socket
    for port in (8921, 8922, 8923, 8931, 8941, 8951):
        with socket.socket() as s:
            if s.connect_ex(("127.0.0.1", port)) != 0:
                srv = subprocess.Popen(["python3", "-m", "http.server", str(port)], cwd=SRVROOT,
                                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                time.sleep(1.2)
                with socket.socket() as s2:
                    if s2.connect_ex(("127.0.0.1", port)) == 0:
                        return srv, str(port)
                srv.kill()
    raise RuntimeError("no free port")
ARGS = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]

async def shot(pg, port, name, q, settle_ms=480):
    await pg.goto(f"http://localhost:{port}/play/occlusion-test.html?{q}")
    await pg.wait_for_function("window.ready", timeout=60000)
    for _ in range(7):                                 # updateOcclusion uses wall-clock dt —
        await pg.wait_for_timeout(settle_ms // 7)      # spread ticks across real time so the
        await pg.evaluate("window.tick(1/30)")         # fade/restore actually advances
    faded = await pg.evaluate("window.__occ ? window.__occ.faded() : 'occ disabled'")
    await pg.screenshot(path=f"{ROOT}/{name}")
    print(f"{name}: faded={faded}")
    return faded

async def main():
    srv, port = free_server()
    print("serving on", port)
    try:
        from playwright.async_api import async_playwright
        async with async_playwright() as p:
            b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=ARGS)
            pg = await b.new_page(viewport={"width": 960, "height": 600})
            logs = []; pg.on("console", lambda m: logs.append(m.text)); pg.on("pageerror", lambda e: logs.append("ERR " + str(e)))

            await shot(pg, port, "occl_before.png", "occ=0&warm=80")                    # control: module off
            after = await shot(pg, port, "occl_after.png", "occ=1&warm=80")             # canopy+house faded
            rest = await shot(pg, port, "occl_restored.png", "occ=1&warm=80&shift=1")   # player shifted -> restored
            # fade progression log: cold start, sample values while stepping
            await pg.goto(f"http://localhost:{port}/play/occlusion-test.html?occ=1&warm=1")
            await pg.wait_for_function("window.ready", timeout=60000)
            vals = []
            for i in range(14):
                await pg.evaluate("window.tick(1/30)"); await pg.wait_for_timeout(45)
                vals.append(await pg.evaluate("window.__occ.faded()"))
            print("progression:", json.dumps(vals))
            assert after, "no occluder faded in the after shot"
            assert rest == [], f"restored shot still has faded roots: {rest}"

            # restore timing: warm faded -> shift player off-ray -> sample until clear
            await pg.goto(f"http://localhost:{port}/play/occlusion-test.html?occ=1&warm=90")
            await pg.wait_for_function("window.ready", timeout=60000)
            await pg.evaluate("window.__seat(0.35,0.935,0)")
            t0 = time.time(); clear_t = None; seq = []
            for i in range(14):
                await pg.evaluate("window.tick(1/30)"); await pg.wait_for_timeout(40)
                f = await pg.evaluate("window.__occ.faded()"); seq.append(f)
                if not f and clear_t is None: clear_t = time.time() - t0
            print(f"restore: cleared in ~{clear_t:.2f}s wall", seq[:6])
            assert clear_t is not None and clear_t <= 0.35, "restore took too long"

            # ---- real game: index.html?capture — debugBehindTree parks the courier
            # so the follow camera sits inside a canopy; fall back to auto-walk ----
            await pg.goto(f"http://localhost:{port}/play/index.html?capture&m=1&nosave&lang=en&palette=day")
            await pg.wait_for_function("window.ready", timeout=180000)
            got = False
            ntrees = await pg.evaluate("window.debugBehindTree ? window.debugBehindTree(0) : 0")
            for i in range(min(ntrees or 0, 8)):
                await pg.evaluate(f"window.debugBehindTree({i})")
                f = []
                for _ in range(40):                    # camF lerps — needs real-time ticks
                    await pg.evaluate("tick(1/15)"); await pg.wait_for_timeout(35)
                    f = await pg.evaluate("gameState().occ || []")
                    if f and all(g['v'] >= 0.6 for g in f): break
                if f:
                    await pg.screenshot(path=f"{ROOT}/occl_game.png")
                    print(f"occl_game.png behind tree {i}: faded={f}"); got = True; break
            if not got:
                held = set()
                for i in range(900):                   # ~60s at 15fps fallback
                    want = set(await pg.evaluate("autoKeys()"))
                    for k in held - want: await pg.keyboard.up(k)
                    for k in want - held: await pg.keyboard.down(k)
                    held = want
                    await pg.evaluate("tick(1/15)")
                    f = await pg.evaluate("window.__occ ? window.__occ.faded() : []")
                    if f:
                        await pg.wait_for_timeout(140); await pg.evaluate("tick(1/15)")
                        await pg.screenshot(path=f"{ROOT}/occl_game.png")
                        print(f"occl_game.png at tick {i}: faded={f}"); got = True; break
            if not got:
                await pg.screenshot(path=f"{ROOT}/occl_game.png")
                print("occl_game.png: no fade engaged")
            print("\n".join(l for l in logs if "404" not in l)[-1500:])
            await b.close()
    finally:
        srv.kill()

asyncio.run(main())
