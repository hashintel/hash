import { performance } from "node:perf_hooks";

import { readRustWasm } from "./read-rust-wasm.mjs";

const { probabilisticSatellitesSDCPN } =
  /** @type {typeof import("../src/examples/index.ts")} */ (
    await import("../dist/examples/index.js")
  );
const { createJsonDocHandle, createPetrinaut, normalizeSDCPN, toPetrinautId } =
  /** @type {typeof import("../src/index.ts")} */ (
    await import("../dist/index.js")
  );
const { createRustPetrinaut, initializePetrinautRust } =
  /** @type {typeof import("../src/rust/index.ts")} */ (
    await import("../dist/rust.js")
  );

const engine =
  process.argv.find((argument) => argument.startsWith("--engine="))?.slice(9) ??
  "rust";
if (!["rust", "typescript"].includes(engine)) {
  throw new Error("Engine must be rust or typescript");
}
const initial = normalizeSDCPN(probabilisticSatellitesSDCPN.petriNetDefinition);
const uuid = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;
/** @param {unknown} value @param {number} copy @returns {unknown} */
const cloneCopy = (value, copy) => {
  if (typeof value === "string" && uuid.test(value)) {
    return toPetrinautId(`${copy}:${value}`);
  }
  if (Array.isArray(value)) {
    return value.map((item) => cloneCopy(item, copy));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        uuid.test(key) ? toPetrinautId(`${copy}:${key}`) : key,
        cloneCopy(item, copy),
      ]),
    );
  }
  return value;
};
/** @param {number} copies @returns {import("../src/index.ts").SDCPN} */
const scaled = (copies) => {
  const documents = Array.from({ length: copies }, (_, index) =>
    cloneCopy(initial, index),
  );
  return /** @type {import("../src/index.ts").SDCPN} */ (
    Object.fromEntries(
      Object.entries(initial).map(([key, value]) => [
        key,
        Array.isArray(value)
          ? documents.flatMap(
              (document) =>
                /** @type {Record<string, unknown[]>} */ (document)[key],
            )
          : value,
      ]),
    )
  );
};
/** @param {number[]} values */
const median = (values) =>
  [...values].sort((left, right) => left - right)[
    Math.floor(values.length / 2)
  ];
/** @param {(index: number) => void} operation @param {number} repetitions @param {() => void} after */
const measure = (operation, repetitions = 30, after = () => {}) => {
  const values = [];
  for (let index = 0; index < repetitions; index++) {
    const start = performance.now();
    operation(index);
    values.push(performance.now() - start);
    after();
  }
  return {
    medianMs: median(values),
    p95Ms: [...values].sort((left, right) => left - right)[
      Math.floor(values.length * 0.95)
    ],
  };
};
const memory = () => {
  global.gc?.();
  const usage = process.memoryUsage();
  return { heapBytes: usage.heapUsed, rssBytes: usage.rss };
};
const wasm = await readRustWasm();
const coldStart = performance.now();
if (engine === "rust") {
  await initializePetrinautRust(wasm);
}
const initializeMs = performance.now() - coldStart;
const rows = [];
for (const copies of [1, 10, 100]) {
  const document = scaled(copies);
  const before = memory();
  const start = performance.now();
  const options = { initial: document, historyLimit: 50 };
  const instance =
    engine === "rust"
      ? await createRustPetrinaut(options)
      : createPetrinaut({ document: createJsonDocHandle(options) });
  const startupMs = performance.now() - start;
  const started = memory();
  const place = instance.handle.doc().places[0];
  const move = measure((index) =>
    instance.mutations.updatePlacePosition({
      placeId: place.id,
      position: { x: index + 1, y: index + 2 },
    }),
  );
  const historyMemory = memory();
  const undo = measure(() => instance.handle.history.undo());
  const redo = measure(() => instance.handle.history.redo());
  const batch = instance.handle
    .doc()
    .places.slice(0, 100)
    .map((node) => ({
      id: node.id,
      itemType: /** @type {const} */ ("place"),
      position: { x: node.x + 100, y: node.y + 100 },
    }));
  const bulk = measure(
    (index) =>
      instance.mutations.commitNodePositions({
        commits: batch.map((commit) => ({
          ...commit,
          position: { x: index + 200, y: index + 201 },
        })),
      }),
    10,
  );
  const bulkDelete = measure(
    () =>
      instance.mutations.deleteItemsByIds({
        items: batch.map(({ id }) => ({ type: "place", id })),
      }),
    10,
    () => {
      instance.handle.history.undo();
    },
  );
  instance.handle.history.clear();
  const cleared = memory();
  rows.push({
    copies,
    nodes: document.places.length + document.transitions.length,
    documentBytes: Buffer.byteLength(JSON.stringify(document)),
    startupMs,
    move,
    undo,
    redo,
    bulk,
    bulkDelete,
    instanceHeapBytes: started.heapBytes - before.heapBytes,
    moveHistoryHeapBytes: historyMemory.heapBytes - started.heapBytes,
    retainedHeapAfterClearBytes: cleared.heapBytes - started.heapBytes,
    processRssDeltaBytes: cleared.rssBytes - before.rssBytes,
  });
  instance.dispose();
}
process.stdout.write(
  `${JSON.stringify({ engine, node: process.version, wasmBytes: wasm.byteLength, initializeMs, rows }, null, 2)}\n`,
);
