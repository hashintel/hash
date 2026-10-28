import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { setImmediate } from "node:timers/promises";
import { parseArgs } from "node:util";

import { readRustWasm } from "./read-rust-wasm.mjs";

const { probabilisticSatellitesSDCPN } =
  /** @type {typeof import("../src/examples/index.ts")} */ (
    await import("../dist/examples/index.js")
  );
const { createJsonDocHandle, createPetrinaut, normalizeSDCPN, toPetrinautId } =
  /** @type {typeof import("../src/index.ts")} */ (
    await import("../dist/index.js")
  );

/** @typedef {import("../src/index.ts").SDCPN} SDCPN */
/** @typedef {import("../src/index.ts").Petrinaut} Petrinaut */
/** @typedef {{ engine: "rust" | "typescript", nodes: number, mode: "timing" | "memory" }} BenchmarkOptions */

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
/** @param {number} nodes @returns {SDCPN} */
const scaled = (nodes) => {
  const copies = nodes / (initial.places.length + initial.transitions.length);
  assert(
    Number.isInteger(copies) && copies > 0,
    "Node count must be a positive multiple of five",
  );
  const documents = Array.from({ length: copies }, (_, index) =>
    cloneCopy(initial, index),
  );
  return /** @type {SDCPN} */ (
    Object.fromEntries(
      Object.entries(initial).map(([key, value]) => [
        key,
        Array.isArray(value)
          ? documents.flatMap((document) => {
              const field = /** @type {Record<string, unknown[]>} */ (document)[
                key
              ];
              assert(field);
              return field;
            })
          : value,
      ]),
    )
  );
};
/** @param {unknown} value @returns {unknown} */
const canonical = (value) => {
  if (Array.isArray(value)) {
    return value.map(canonical);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonical(item)]),
    );
  }
  return value;
};
/** @param {Petrinaut} instance */
const digest = (instance) =>
  createHash("sha256")
    .update(JSON.stringify(canonical(instance.handle.doc())))
    .digest("hex");
/** @param {() => void} operation @param {number} repetitions @param {() => void} after */
const measure = (operation, repetitions, after = () => {}) => {
  const samples = [];
  for (let index = 0; index < repetitions; index++) {
    const start = performance.now();
    operation();
    samples.push(performance.now() - start);
    after();
  }
  return samples;
};
const memory = async () => {
  await setImmediate();
  assert(global.gc, "Memory measurements require node --expose-gc");
  global.gc();
  global.gc();
  const usage = process.memoryUsage();
  return {
    heapUsedBytes: usage.heapUsed,
    externalBytes: usage.external,
    arrayBufferBytes: usage.arrayBuffers,
    rssBytes: usage.rss,
    peakRssBytes: process.resourceUsage().maxRSS * 1024,
  };
};
/** @param {Petrinaut} instance */
const operations = (instance) => {
  const document = instance.handle.doc();
  const history = instance.handle.history;
  assert(document && history);
  const place = document.places[0];
  assert(place);
  const ids = document.places.slice(0, 100).map(({ id }) => id);
  let position = 10_000;
  let notifications = 0;
  instance.definition.subscribe(() => {
    notifications++;
  });
  instance.patches.subscribe(() => {
    notifications++;
  });
  return {
    history,
    batchSize: ids.length,
    move: () =>
      instance.mutations.updatePlacePosition({
        placeId: place.id,
        position: { x: ++position, y: position + 1 },
      }),
    batch: () => {
      position++;
      instance.mutations.commitNodePositions({
        commits: ids.map((id) => ({
          id,
          itemType: "place",
          position: { x: position, y: position + 1 },
        })),
      });
    },
    remove: () =>
      instance.mutations.deleteItemsByIds({
        items: ids.map((id) => ({ type: "place", id })),
      }),
    undo: () => {
      assert(history.undo(), "Undo history is empty");
    },
    redo: () => {
      assert(history.redo(), "Redo history is empty");
    },
    verifyMove: () => {
      const current = instance.handle
        .doc()
        ?.places.find(({ id }) => id === place.id);
      assert.equal(current?.x, position);
      assert.equal(current.y, position + 1);
      assert(notifications > 0, "Document subscribers received no updates");
    },
    verifyDelete: () => {
      assert.equal(
        instance.handle.doc()?.places.length,
        document.places.length - ids.length,
      );
    },
  };
};

/** @param {BenchmarkOptions} options */
export const runBenchmark = async ({ engine, nodes, mode }) => {
  const document = scaled(nodes);
  const documentBytes = Buffer.byteLength(JSON.stringify(document));
  const beforeEngine = mode === "memory" ? await memory() : undefined;
  const initializeStart = performance.now();
  /** @type {(initial: SDCPN) => Promise<Petrinaut>} */
  let createInstance;
  if (engine === "rust") {
    const { createRustPetrinaut, initializePetrinautRust } =
      /** @type {typeof import("../src/rust/index.ts")} */ (
        await import("../dist/rust.js")
      );
    await initializePetrinautRust(await readRustWasm());
    createInstance = (value) =>
      createRustPetrinaut({ initial: value, historyLimit: 50 });
  } else {
    createInstance = async (value) =>
      createPetrinaut({
        document: createJsonDocHandle({ initial: value, historyLimit: 50 }),
      });
  }
  const initializeMs = performance.now() - initializeStart;
  if (mode === "memory") {
    const ready = await memory();
    const cycle = async () => {
      const instance = await createInstance(document);
      const actions = operations(instance);
      const loaded = await memory();
      for (let index = 0; index < 50; index++) {
        actions.move();
      }
      actions.verifyMove();
      assert.equal(actions.history.entries.get().length, 51);
      const historyFull = await memory();
      actions.remove();
      actions.verifyDelete();
      actions.undo();
      const structural = await memory();
      actions.history.clear();
      assert.equal(actions.history.entries.get().length, 1);
      const cleared = await memory();
      instance.dispose();
      return { loaded, historyFull, structural, cleared };
    };
    const cycles = [];
    for (let index = 0; index < 3; index++) {
      const readings = await cycle();
      cycles.push({ ...readings, disposed: await memory() });
    }
    return { engine, nodes, mode, documentBytes, beforeEngine, ready, cycles };
  }

  const start = performance.now();
  const instance = await createInstance(document);
  const loadMs = performance.now() - start;
  const actions = operations(instance);
  const initialDigest = digest(instance);
  for (let index = 0; index < 10; index++) {
    actions.move();
    actions.undo();
  }
  actions.batch();
  actions.undo();
  actions.remove();
  actions.undo();
  assert.equal(digest(instance), initialDigest);
  actions.history.clear();
  const moveMs = measure(actions.move, 30);
  actions.verifyMove();
  const movedDigest = digest(instance);
  const undoMs = measure(actions.undo, 30);
  assert.equal(digest(instance), initialDigest);
  const redoMs = measure(actions.redo, 30);
  assert.equal(digest(instance), movedDigest);
  const batchMs = measure(actions.batch, 10);
  actions.verifyMove();
  const batchDigest = digest(instance);
  const deleteMs = measure(actions.remove, 10, () => {
    actions.verifyDelete();
    actions.undo();
  });
  assert.equal(digest(instance), batchDigest);
  const batchSize = actions.batchSize;
  instance.dispose();
  return {
    engine,
    nodes,
    mode,
    documentBytes,
    batchSize,
    initializeMs,
    loadMs,
    moveMs,
    undoMs,
    redoMs,
    batchMs,
    deleteMs,
    digests: { initial: initialDigest, moved: movedDigest, batch: batchDigest },
  };
};

const { values } = parseArgs({
  options: {
    engine: { type: "string", default: "rust" },
    nodes: { type: "string", default: "500" },
    mode: { type: "string", default: "timing" },
  },
});
assert(
  values.engine === "rust" || values.engine === "typescript",
  "Engine must be rust or typescript",
);
assert(
  values.mode === "timing" || values.mode === "memory",
  "Mode must be timing or memory",
);
const result = await runBenchmark({
  engine: values.engine,
  nodes: Number(values.nodes),
  mode: values.mode,
});
process.stdout.write(`${JSON.stringify(result)}\n`);
