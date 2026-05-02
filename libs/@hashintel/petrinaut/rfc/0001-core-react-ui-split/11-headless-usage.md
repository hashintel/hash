# 11 — Using Petrinaut without any UI

This chapter shows how to use `@hashintel/petrinaut/core` as a headless engine — no React, no DOM, no Monaco. CLI tools, server-side simulation runners, snapshot tests, and alternative-framework bindings all consume Core through this surface.

Status callouts:

- 🟢 **Shipped** — works today against the `cf/fe-628` branch.
- 🟡 **Planned** — described in the RFC, not yet implemented. Consumers shouldn't rely on the exact shape until it lands.

---

## 11.1 At a glance

```ts
import {
  createJsonDocHandle,
  createPetrinaut,
} from "@hashintel/petrinaut/core"; // (today: re-exported from "@hashintel/petrinaut")

const handle = createJsonDocHandle({ initial: emptySDCPN });
const instance = createPetrinaut({ document: handle });

// mutate
instance.mutate((draft) => {
  draft.places.push({ id: "p1", name: "Place 1", /* … */ });
});

// observe
const off = instance.definition.subscribe((sdcpn) => {
  console.log(`Now ${sdcpn.places.length} place(s)`);
});

// run a simulation (browser-side; needs a Worker factory)
const sim = await instance.startSimulation({
  initialMarking: new Map(),
  parameterValues: {},
  seed: 42,
  dt: 0.01,
  maxTime: 10,
});
sim.run();

// later
sim.dispose();
instance.dispose();
off();
```

---

## 11.2 `createPetrinaut`

```ts
function createPetrinaut(config: {
  document: PetrinautDocHandle;
  readonly?: boolean;
  simulation?: { createWorker?: () => Worker | Promise<Worker> };
}): Petrinaut;
```

🟢 **Shipped.** Returns a stateful `Petrinaut` instance bound to a single document handle. Core never owns the document — it's the host's responsibility to provide a handle via one of the patterns below.

### 11.2.1 With `createJsonDocHandle` (in-memory, the common case)

🟢 **Shipped.**

```ts
import { createJsonDocHandle } from "@hashintel/petrinaut/core";

const handle = createJsonDocHandle({
  id: "my-net",          // optional; auto-generated if omitted
  initial: someSDCPN,    // required initial document
  historyLimit: 50,      // optional, default 50; pass 0 to disable history
});
```

Backed by Immer — `produceWithPatches` runs on every `change()` so the handle gets forward and inverse patches for free. Patches are emitted with each `DocChangeEvent` and feed both the optional history stack and any consumer subscribed to `instance.patches`.

### 11.2.2 With an Automerge handle (for collaborative editing)

🟡 **Planned.** No adapter is shipped — adding `@automerge/automerge-repo` as a peer dep just for the type isn't worth it. The docs include a 5-line wrapper consumers paste in:

```ts
import type { DocHandle as AutomergeDocHandle } from "@automerge/automerge-repo";
import type {
  PetrinautDocHandle,
  PetrinautPatch,
} from "@hashintel/petrinaut/core";
import type { SDCPN } from "@hashintel/petrinaut/core";

function fromAutomergeHandle(h: AutomergeDocHandle<SDCPN>): PetrinautDocHandle {
  return {
    id: h.documentId,
    state: /* map h.state() to the Petrinaut DocHandleState shape */,
    whenReady: () => h.whenReady().then(() => {}),
    doc: () => h.docSync(),
    change: (fn) => h.change(fn),
    subscribe: (listener) => {
      const handler = ({ doc, patches }) => listener({
        next: doc,
        patches: patches.map(automergePatchToPetrinaut), // small switch
        source: "remote", // or detect local based on payload origin
      });
      h.on("change", handler);
      return () => h.off("change", handler);
    },
    // history could optionally be implemented against Automerge's heads.
  };
}

const repo = new Repo({ /* storage, network, … */ });
const automergeHandle = repo.find<SDCPN>("automerge:abc123");
const handle = fromAutomergeHandle(automergeHandle);
const instance = createPetrinaut({ document: handle });
```

Patch conversion is a small switch (`put` → `replace`, `del` → `remove`, `splice`/`insert` → multiple `add`). Atomicity loss on splice is documented in [04-core-instance.md](./04-core-instance.md) §4.1.

### 11.2.3 Building your own handle

🟢 **Shipped** (the interface; build it however you like).

The contract is in [04-core-instance.md](./04-core-instance.md) §4.1. Minimum:

```ts
import type {
  DocChangeEvent,
  DocHandleState,
  DocumentId,
  PetrinautDocHandle,
  ReadableStore,
} from "@hashintel/petrinaut/core";
import type { SDCPN } from "@hashintel/petrinaut/core";

function createMyHandle(initial: SDCPN, id: DocumentId): PetrinautDocHandle {
  let current = initial;
  const subs = new Set<(e: DocChangeEvent) => void>();
  const stateListeners = new Set<(s: DocHandleState) => void>();

  const state: ReadableStore<DocHandleState> = {
    get: () => "ready",
    subscribe: (l) => (stateListeners.add(l), () => stateListeners.delete(l)),
  };

  return {
    id,
    state,
    whenReady: () => Promise.resolve(),
    doc: () => current,
    change(fn) {
      const next = structuredClone(current); // or Immer; or your CRDT API
      fn(next);
      current = next;
      for (const sub of subs) {
        sub({ next: current, source: "local" }); // omit `patches` if you can't produce them
      }
    },
    subscribe(listener) {
      subs.add(listener);
      return () => subs.delete(listener);
    },
    // history: omit if not supported
  };
}
```

Things to consider when writing your own handle:

- **`patches` are optional** in the `DocChangeEvent`. Omit when your underlying store can't produce them; consumers fall back to deep-equal where it matters.
- **`source: "local" | "remote"`** lets subscribers distinguish locally-applied mutations from remote-sync deliveries. Useful for Automerge adapters; harmless to omit otherwise.
- **`history?` is optional**. Omit on read-only / mirror handles. If you implement it, the contract is in [04-core-instance.md](./04-core-instance.md) §4.1 "History (locked)".
- **No-op mutations should not emit.** Subscribers rely on "every event is a real change" (Phase 0 contract).

### 11.2.4 History

🟢 **Shipped** when `handle.history` is present (it is for `createJsonDocHandle`):

```ts
const h = createJsonDocHandle({ initial });
h.change(addPlace);            // history entry 1
h.change(addTransition);       // history entry 2

h.history?.undo();             // back to state after entry 1
h.history?.canRedo.get();      // → true
h.history?.redo();             // forward again

// Subscribe to canUndo/canRedo for UI gating without a render framework:
const offCanUndo = h.history?.canUndo.subscribe((can) => {
  console.log("can undo:", can);
});

// Jump arbitrarily (used by version-history dropdowns):
h.history?.goToIndex(0);       // back to initial state
```

Each `undo` / `redo` / `goToIndex` emits a normal `DocChangeEvent` with the patches applied (so simulation, validators, etc. react the same way as for fresh mutations).

Coalescing of typing-bursts is **deferred** (Q1.c in [07-open-questions.md](./07-open-questions.md)). Today every `change()` is a fresh history entry.

---

## 11.3 Mutating the document

🟢 **Shipped.**

Two ways, equivalent except for the readonly check:

```ts
// Through the instance — respects `readonly: true`
instance.mutate((draft) => {
  draft.transitions.push({ id: "t1", /* … */ });
});

// Directly through the handle — bypasses the instance's readonly flag
handle.change((draft) => {
  draft.transitions.push({ id: "t1", /* … */ });
});
```

The `draft` is an Immer draft when using `createJsonDocHandle`. You can mutate it directly; Immer produces the immutable next state plus patches.

For multi-step changes, just call `change` once with all of them — they're a single history entry and a single patch event.

---

## 11.4 Running a simulation

### 11.4.1 The high-level path

🟢 **Shipped.** Browser only (needs a `Worker`):

```ts
import {
  createJsonDocHandle,
  createPetrinaut,
} from "@hashintel/petrinaut/core";

const instance = createPetrinaut({
  document: createJsonDocHandle({ initial: net }),
  simulation: {
    createWorker: () =>
      new Worker(
        // Today: use the bundled worker URL via your bundler's resolution.
        // Once Phase 5 lands, this becomes a `./core/simulation.worker` sub-entry.
        new URL("./worker.js", import.meta.url),
        { type: "module" },
      ),
  },
});

const sim = await instance.startSimulation({
  initialMarking: new Map(), // empty = all places start with zero tokens
  parameterValues: {},
  seed: 42,
  dt: 0.01,
  maxTime: 10,
  backpressure: { maxFramesAhead: 40, batchSize: 10 },
  signal: abortController.signal, // optional
});

sim.run();

// Watch the latest frame:
const off = sim.frames.subscribe(({ count, latest }) => {
  if (latest) {
    console.log(`Frame ${count}, t=${latest.time}`);
  }
});

// Listen for completion:
sim.events.subscribe((e) => {
  if (e.type === "complete") {
    console.log(`Done at frame ${e.frameNumber} (${e.reason})`);
  }
});

await new Promise((r) => sim.events.subscribe((e) => e.type === "complete" && r(undefined)));

off();
sim.dispose();
```

`startSimulation` snapshots `handle.doc()` once, at start time. Mutations to the document after that point don't affect the running simulation.

### 11.4.2 The lower-level path

🟢 **Shipped.** Skip `createPetrinaut` entirely:

```ts
import {
  createWorkerTransport,
  startSimulation,
} from "@hashintel/petrinaut/core";

const transport = createWorkerTransport(() => new Worker(/* … */));

const sim = await startSimulation({
  transport,
  config: {
    sdcpn: someSDCPN,
    initialMarking: new Map(),
    parameterValues: {},
    seed: 42,
    dt: 0.01,
    maxTime: 10,
  },
});

sim.run();
```

Useful when you don't have a document handle (just a static SDCPN) or want to swap in a custom transport. Tests in `src/core/simulation/simulation.test.ts` use a manual transport for exactly this reason.

### 11.4.3 Frame consumption

The `frames` store deliberately exposes only `{ count, latest }` so subscribers don't re-render per frame for nothing. Pull individual frames with `sim.getFrame(index)` when you need them:

```ts
const offFrames = sim.frames.subscribe(({ count }) => {
  // Only react every 10 frames, say
  if (count % 10 === 0) {
    const frame = sim.getFrame(count - 1);
    persist(frame);
  }
});
```

### 11.4.4 Recording / replay

Because frames are a stream, persisting a run is just subscribing:

```ts
const recorded: SimulationFrame[] = [];
sim.frames.subscribe(({ latest }) => {
  if (latest) recorded.push(latest);
});
```

🟡 **Planned:** `createInlineTransport()` (synchronous, no worker, no DOM) and `createRecordedTransport(frames)` (replay against a saved tape). The `SimulationTransport` interface is shape-compatible with both; they ship later without API change.

### 11.4.5 Headless-headless (no Worker available)

🟡 **Planned.** Until `createInlineTransport()` lands, simulating in Node/Deno requires either:

- The `web-worker` polyfill (already a dep of this package) — works for many cases.
- A custom `SimulationTransport` that drives the simulator on the calling thread via the modules in `src/simulation/simulator/*`.

Once `createInlineTransport()` ships, the recommended pattern is `createPetrinaut({ ..., simulation: { createWorker: undefined } })` with a fall-back path that uses inline.

---

## 11.5 Type-checking user code (LSP)

🟡 **Planned.** Today the LSP worker (`src/lsp/worker/`) is consumed only through `<LanguageClientProvider>` in `/react`. Headless consumers can't easily check that a transition guard or kernel function compiles without booting React.

Planned surface (RFC [04-core-instance.md](./04-core-instance.md) §4.3):

```ts
const instance = createPetrinaut({ document: handle });

// One-shot: ask LSP to lint the current document
instance.lsp.notifyDocumentChanged(uri, code);

const off = instance.lsp.diagnostics.subscribe(({ total, byUri }) => {
  if (total > 0) {
    for (const [docUri, diags] of byUri) {
      console.error(`${docUri}: ${diags.length} diagnostic(s)`);
    }
  }
});

// Or ask explicitly:
const completion = await instance.lsp.requestCompletion(uri, position);
const hover = await instance.lsp.requestHover(uri, position);
```

The LSP worker is already headless — it runs in a Web Worker over a typed message protocol. Phase 2 task: wrap it in `instance.lsp.*` the same way Phase 2a wrapped the simulation worker. Until then, headless type-checking requires reaching into `src/lsp/worker/` directly, which isn't a stable API.

---

## 11.6 Subscribing — the two patterns

Core uses exactly two stream primitives ([04-core-instance.md](./04-core-instance.md) §4.2):

### `ReadableStore<T>` — for state ("there is always a current value")

```ts
type ReadableStore<T> = {
  get(): T;
  subscribe(listener: (value: T) => void): () => void;
};
```

Examples in Core: `instance.definition`, `handle.state`, `handle.history.canUndo`, `sim.status`, `sim.frames`.

```ts
const current = instance.definition.get();
const off = instance.definition.subscribe((next) => render(next));
// later:
off();
```

### `EventStream<T>` — for discrete events ("things that happen")

```ts
type EventStream<T> = {
  subscribe(listener: (event: T) => void): () => void;
};
```

Examples: `instance.patches`, `sim.events`. No `get()` — events are gone after they fire.

```ts
const off = sim.events.subscribe((e) => {
  if (e.type === "error") report(e.message);
});
```

### When to use which

- "What is the current X?" → `ReadableStore<X>`.
- "What happened?" / "Tell me when X happens" → `EventStream<X>`.
- For React, both are bridged via `useStore` / `useStoreSelector` (see [06-react-bindings.md](./06-react-bindings.md) §6.3).
- For non-React consumers, just call `subscribe` directly and store the unsubscribe function.

### Cleanup

Always call the unsubscribe function returned by `subscribe`. Long-lived consumers that forget will leak. In Node:

```ts
const off = sim.frames.subscribe(handler);
process.on("beforeExit", off);
```

---

## 11.7 Disposal and lifecycle

```ts
const instance = createPetrinaut({ document: handle });
const sim = await instance.startSimulation(cfg);

// Tear down the simulation only:
sim.dispose();

// Tear down the entire instance (also disposes any active simulation):
instance.dispose();
```

Disposal is **idempotent** — safe to call twice. The handle itself is owned by the host; Core does not call any teardown on it (e.g. it doesn't close localStorage adapters or detach Automerge listeners).

🟡 **Planned:** lifecycle ordering when both LSP and simulation are active — ensure LSP is initialized before the editor opens a document. See [09-risks.md](./09-risks.md) "Monaco + LSP timing".

---

## 11.8 End-to-end example: lint an SDCPN file

Putting it together — a future CI script that fails when a saved net has type errors. (🟡 LSP currently still goes through `/react`; sketched here as it will look once Phase 2c lands.)

```ts
import { readFile } from "node:fs/promises";
import {
  createJsonDocHandle,
  createPetrinaut,
} from "@hashintel/petrinaut/core";
import { importSDCPN } from "@hashintel/petrinaut/core/file-format"; // 🟡 path TBD in Phase 5

const json = await readFile(process.argv[2]!, "utf8");
const sdcpn = importSDCPN(json);

const instance = createPetrinaut({
  document: createJsonDocHandle({ initial: sdcpn, historyLimit: 0 }),
});

await new Promise<void>((resolve, reject) => {
  const off = instance.lsp.diagnostics.subscribe(({ total, byUri }) => {
    if (total > 0) {
      console.error(`Found ${total} diagnostic(s)`);
      for (const [uri, diags] of byUri) {
        for (const d of diags) console.error(`  ${uri} :: ${d.message}`);
      }
      off();
      reject(new Error("type-check failed"));
      return;
    }
    off();
    resolve();
  });

  // Trigger LSP to lint every URI in the SDCPN
  for (const t of sdcpn.transitions) {
    instance.lsp.notifyDocumentChanged(`net://transition/${t.id}/guard`, t.guard ?? "");
  }
});

instance.dispose();
console.log("OK");
```

This script is the canonical motivator for the headless surface — every part of it should remain a single import away from a `node` script when Phase 2c finishes.

---

## 11.9 Status summary

| Capability | Status |
| ---------- | :----: |
| `createJsonDocHandle` (with history) | 🟢 |
| `createPetrinaut` (document + readonly + simulation factory) | 🟢 |
| `instance.mutate` / `instance.definition` / `instance.patches` | 🟢 |
| `instance.startSimulation` / `instance.simulation` store | 🟢 |
| `createWorkerTransport` / `startSimulation` low-level | 🟢 |
| Automerge handle adapter | 🟡 (pasted snippet, not shipped) |
| `createInlineTransport` / `createRecordedTransport` | 🟡 |
| `instance.lsp.*` (headless type-checking) | 🟡 |
| `instance.playback.*` (frame loop in Core) | 🟡 |
| `./core/simulation.worker` `package.json` sub-entry | 🟡 (Phase 5) |
