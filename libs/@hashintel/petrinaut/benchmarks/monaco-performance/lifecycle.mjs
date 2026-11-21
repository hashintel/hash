import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { chromium } from "playwright";

import { instrument } from "./instrument.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).map((argument) => argument.split("=")),
);
const origin = args.origin ?? "http://127.0.0.1:6027";
const output = resolve(
  args.output ?? new URL("./results", import.meta.url).pathname,
);
const samples = Number(args.samples ?? 6);
const mode = args.mode ?? "cold";
const variants = (
  args.variants ??
  (mode === "cold" ? "baseline,prewarm-exact" : "baseline,keep-model,retain")
).split(",");
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const rows = [];
try {
  for (let sample = 0; sample < samples; sample++) {
    const order = variants
      .slice(sample % variants.length)
      .concat(variants.slice(0, sample % variants.length));
    for (const variant of order) {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
      });
      const page = await context.newPage();
      const session = await context.newCDPSession(page);
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.addInitScript(instrument);
      try {
        await page.goto(
          `${origin}/benchmarks/monaco-performance/bench.html?surface=micro&model=satellites&variant=${variant}&open&unique`,
        );
        await page.waitForFunction(() =>
          globalThis.__monacoBench
            .editors()
            .some((editor) => globalThis.__monacoBench.isReady(editor)),
        );
        const ready = await page.evaluate(async () => {
          const editor = globalThis.__monacoBench
            .editors()
            .find((candidate) => globalThis.__monacoBench.isReady(candidate));
          const mounted = globalThis.__monacoBench
            .snapshot()
            .records.find(
              (record) => record.kind === "react-editor-mounted",
            ).start;
          editor.focus();
          await new Promise(requestAnimationFrame);
          return { mounted, paintOpportunity: performance.now() };
        });
        await page.keyboard.type("// first input\n");
        assert.ok(
          await page.evaluate(() =>
            globalThis.__monacoBench
              .editors()
              .some((editor) =>
                editor.getValue().startsWith("// first input\n"),
              ),
          ),
        );
        await page.waitForTimeout(400);
        const initial = await page.evaluate(() =>
          globalThis.__monacoBench.snapshot(),
        );
        const checkpoints = [];
        const checkpoint = async (cycles) => {
          await session.send("HeapProfiler.collectGarbage");
          checkpoints.push({
            cycles,
            memory: await session.send("Runtime.getHeapUsage"),
            dom: await session.send("Memory.getDOMCounters"),
            snapshot: await page.evaluate(() =>
              globalThis.__monacoBench.snapshot(),
            ),
          });
        };
        if (mode === "memory") {
          await page.locator('[data-bench-action="open"]').click();
          await page.waitForTimeout(100);
          await checkpoint(0);
          for (let cycle = 1; cycle <= 30; cycle++) {
            await page.locator('[data-bench-action="open"]').click();
            await page.waitForFunction(() =>
              globalThis.__monacoBench
                .editors()
                .some(
                  (editor) =>
                    globalThis.__monacoBench.isReady(editor) &&
                    editor.getDomNode().checkVisibility(),
                ),
            );
            await page.locator('[data-bench-action="switch"]').click();
            await page.waitForTimeout(40);
            await page.locator('[data-bench-action="open"]').click();
            await page.waitForTimeout(40);
            if ([10, 20, 30].includes(cycle)) await checkpoint(cycle);
          }
        }
        const resources = await page.evaluate(() =>
          performance.getEntriesByType("resource").map((resource) => ({
            name: resource.name,
            duration: resource.duration,
            transferSize: resource.transferSize,
            encodedBodySize: resource.encodedBodySize,
            decodedBodySize: resource.decodedBodySize,
          })),
        );
        assert.deepEqual(
          errors.filter((message) => message !== "Canceled"),
          [],
        );
        rows.push({
          sample,
          variant,
          mode,
          origin,
          browser: browser.version(),
          ready,
          initial,
          resources,
          checkpoints,
          errors,
        });
        await writeFile(
          `${output}/${mode}-${new URL(origin).port}.json`,
          JSON.stringify(rows),
        );
        console.log(
          JSON.stringify({
            sample,
            variant,
            mode,
            mounted: ready.mounted,
            paintOpportunity: ready.paintOpportunity,
            errors,
            checkpoints: checkpoints.map((point) => ({
              cycles: point.cycles,
              editors: point.snapshot.editors,
              models: point.snapshot.models,
              heap: point.memory.usedSize,
              dom: point.dom.nodes,
            })),
          }),
        );
      } finally {
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
}
