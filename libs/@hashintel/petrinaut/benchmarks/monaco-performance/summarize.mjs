import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname } from "node:path";

const quantile = (values, fraction) => {
  const sorted = values
    .filter(Number.isFinite)
    .sort((left, right) => left - right);
  if (!sorted.length) return null;
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  return (
    sorted[lower] +
    (sorted[Math.ceil(position)] - sorted[lower]) * (position - lower)
  );
};
const distribution = (values) => ({
  n: values.filter(Number.isFinite).length,
  median: quantile(values, 0.5),
  p95: quantile(values, 0.95),
  min: quantile(values, 0),
  max: quantile(values, 1),
});
const groups = new Map();
for (const file of process.argv.slice(2)) {
  const rows = JSON.parse(await readFile(file, "utf8"));
  for (const row of rows) {
    for (const action of row.measurements ?? []) {
      const key = [
        basename(dirname(file)),
        row.surface,
        row.model,
        new URL(row.origin).port,
        row.cpuThrottle,
        row.variant,
        action.label,
      ].join("/");
      const group = groups.get(key) ?? [];
      group.push({ row, action });
      groups.set(key, group);
    }
  }
}
const summary = Object.fromEntries(
  [...groups].map(([key, group]) => {
    const values = (select) => distribution(group.map(select));
    const countMethod = (action, method) =>
      action.snapshot.workers.reduce(
        (count, worker) =>
          count +
          worker.messages.filter(
            (message) =>
              message.time >= action.start &&
              message.time <= action.snapshot.now &&
              message.method === method,
          ).length,
        0,
      );
    return [
      key,
      {
        paint: values(({ action }) => action.paintOpportunity),
        construction: values(({ action }) =>
          action.snapshot.records
            .filter((record) => record.kind === "create")
            .reduce((sum, record) => sum + record.duration, 0),
        ),
        maxFrame: values(({ action }) =>
          Math.max(...action.snapshot.frames.map((frame) => frame.duration)),
        ),
        framesOver17ms: values(
          ({ action }) =>
            action.snapshot.frames.filter((frame) => frame.duration > 17)
              .length,
        ),
        keyPaint: values(({ action }) =>
          quantile(
            action.snapshot.records
              .filter((record) => record.kind === "key-paint-opportunity")
              .map((record) => record.duration),
            0.5,
          ),
        ),
        keyPaintP95: values(({ action }) =>
          quantile(
            action.snapshot.records
              .filter((record) => record.kind === "key-paint-opportunity")
              .map((record) => record.duration),
            0.95,
          ),
        ),
        script: values(({ action }) => action.metrics.ScriptDuration * 1000),
        style: values(
          ({ action }) => action.metrics.RecalcStyleDuration * 1000,
        ),
        layout: values(({ action }) => action.metrics.LayoutDuration * 1000),
        netUpdates: values(({ action }) =>
          countMethod(action, "sdcpn/didChange"),
        ),
        compilationRequests: values(({ action }) =>
          countMethod(action, "sdcpn/lowerVisualizer"),
        ),
        heap: values(({ row }) => row.memory.usedSize),
        appReady: values(({ row }) => row.appReady),
        startupMaxFrame: values(({ row }) =>
          Math.max(...row.startup.frames.map((frame) => frame.duration)),
        ),
      },
    ];
  }),
);
await mkdir(new URL("./results", import.meta.url), { recursive: true });
await writeFile(
  new URL("./results/summary.json", import.meta.url),
  JSON.stringify(summary, null, 2),
);
for (const [key, result] of Object.entries(summary)) {
  console.log(
    JSON.stringify({
      key,
      paint: result.paint.median,
      construction: result.construction.median,
      maxFrame: result.maxFrame.median,
      keyPaint: result.keyPaint.median,
      keyPaintP95: result.keyPaintP95.median,
      netUpdates: result.netUpdates.median,
    }),
  );
}
