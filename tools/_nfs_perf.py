"""
M6 性能压测 + 帧率记录（本地）。
用后删除。三档设备模拟：low/mid/high，CDP CPU 限速 + 视口/DPR/触屏。
输出每档 avgFPS / p95 帧时 / 卡帧(>100ms) / JS 堆 / 平均物理步长。
"""
import asyncio
import json
import sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from playwright.async_api import async_playwright

BASE = "http://127.0.0.1:8099/need-for-speed/"

PRESETS = {
    "low":  {"width": 480, "height": 800, "dpr": 1, "cpu": 6, "touch": True},
    "mid":  {"width": 844, "height": 390, "dpr": 2, "cpu": 4, "touch": True},
    "high": {"width": 1280, "height": 720, "dpr": 1, "cpu": 1, "touch": False},
}

INJECT = """
window.__perf = [];
let __last = performance.now();
requestAnimationFrame(function loop(t) {
  const dt = t - __last;
  __last = t;
  if (!window.__perfStop) window.__perf.push(dt);
  requestAnimationFrame(loop);
});
"""

async def run_preset(browser, name, cfg):
    ctx = await browser.new_context(
        viewport={"width": cfg["width"], "height": cfg["height"]},
        device_scale_factor=cfg["dpr"],
        is_mobile=cfg["touch"],
        has_touch=cfg["touch"],
        user_agent=(
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
            if cfg["touch"] else None
        ),
    )
    page = await ctx.new_page()
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)[:120]))
    await page.add_init_script(INJECT)
    cdp = await ctx.new_cdp_session(page)
    if cfg["cpu"] > 1:
        await cdp.send("Emulation.setCPUThrottlingRate", {"rate": cfg["cpu"]})
    await page.goto(BASE)
    await page.wait_for_timeout(6000)
    await page.click("#nfs-mode-list .nfs-pill:nth-child(2)")  # 竞速
    await page.wait_for_timeout(300)
    await page.click("#nfs-btn-start")
    await page.wait_for_timeout(4000)
    # 驾驶 20s：W 全油门 + 周期性氮气/漂移
    await page.keyboard.down("w")
    for i in range(10):
        await page.keyboard.down("Shift")
        await page.wait_for_timeout(500)
        await page.keyboard.up("Shift")
        await page.wait_for_timeout(900)
        if i % 3 == 0:
            await page.keyboard.down(" ")
            await page.keyboard.down("a")
            await page.wait_for_timeout(600)
            await page.keyboard.up("a")
            await page.keyboard.up(" ")
    await page.keyboard.up("w")
    await page.evaluate("window.__perfStop = true")
    await page.wait_for_timeout(300)
    data = await page.evaluate("({perf: window.__perf, heap: performance.memory ? performance.memory.usedJSHeapSize : 0})")
    dts = [d for d in data["perf"] if 0 < d < 1000]
    if dts:
        dts_sorted = sorted(dts)
        n = len(dts_sorted)
        avg = sum(dts_sorted) / n
        p95 = dts_sorted[int(n * 0.95)]
        jank = sum(1 for d in dts_sorted if d > 100)
        fps = 1000 / avg
    else:
        fps = p95 = jank = 0
    await ctx.close()
    return {
        "preset": name,
        "cpu_rate": cfg["cpu"],
        "frames": len(dts),
        "avgFPS": round(fps, 1),
        "p95_ms": round(p95, 1),
        "jank_frames": jank,
        "heap_mb": round(data["heap"] / 1048576, 1),
        "errors": errs[:3] if errs else [],
    }

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(channel="chrome", args=["--enable-unsafe-swiftshader"])
        results = []
        for name, cfg in PRESETS.items():
            r = await run_preset(browser, name, cfg)
            results.append(r)
            print(f"M6 PERF {name}: {json.dumps(r, ensure_ascii=False)}")
        with open("tools/_nfs_perf_result.json", "w", encoding="utf-8") as f:
            json.dump(results, f, ensure_ascii=False, indent=1)
        await browser.close()

asyncio.run(main())
