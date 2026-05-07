# 04 — Core instance API

The Core instance owns "the live document":

- **Inputs** (commands flowing in): mutate definition, paste from clipboard, undo/redo via the handle, etc.
- **Outputs** (events/state flowing out): current SDCPN, patches, future LSP diagnostics, future notifications.

**Simulation does not live on the instance.** A simulation operates on a frozen SDCPN snapshot and has no need for the live document. It is constructed by `createSimulation` standalone — see [05-simulation.md](./05-simulation.md). Playback state belongs to whoever's driving the visualisation (today the React layer; future Core surface).

## 4.1 Construction (locked)

Core never owns the document. It is given a **handle** to one — produced by the host from a plain JSON store, an Automerge `DocHandle`, or anything else that can satisfy the `PetrinautDocHandle` interface.

```ts
import { createPetrinaut } from "@hashintel/petrinaut/core";
import type { PetrinautDocHandle } from "@hashintel/petrinaut/core";

const instance = createPetrinaut({
  document: handle,        // PetrinautDocHandle
  readonly: false,         // optional, defaults to false
});
```

The instance config is deliberately minimal. **Simulation is not configured here** — it's built standalone via `createSimulation`. **LSP is also separate** — `createLanguageClient` is its own factory. **Error tracking** lives on the `/react` side (`<ErrorTrackerContext.Provider>` from `@hashintel/petrinaut/react`); Core doesn't take an `errorTracker` because it has typed error channels (`simulation.events`, `lsp.diagnostics`, `handle.state`) for everything legitimately observable. See [05-simulation.md](./05-simulation.md).

### Handle interface

```ts
export type DocumentId = string;
export type DocHandleState = "loading" | "ready" | "deleted" | "unavailable";

/**
 * Minimal RFC 6902-shaped patch. Modeled on Immer's `produceWithPatches` output:
 * array path, `op` field, three operations only.
 *
 * Petrinaut-defined to avoid a runtime dependency. Adapters from Immer (no
 * conversion needed) and Automerge (small mapper) are documented at the
 * adapter-construction site.
 */
export type PetrinautPatch = {
  op: "add" | "remove" | "replace";
  path: (string | number)[];
  value?: unknown;
};

export type DocChangeEvent = {
  /** Post-mutation snapshot. */
  next: SDCPN;
  /** Optional. Emitted by handles that can produce them (e.g. Immer-backed, Automerge-backed). */
  patches?: PetrinautPatch[];
  /** Optional. "local" if produced by `change()`, "remote" if delivered via a sync channel. */
  source?: "local" | "remote";
};

export type HistoryEntry = {
  timestamp: string;
};

export interface PetrinautHistory {
  /** Apply the most recent inverse patches. Returns true if anything was undone. */
  undo(): boolean;
  /** Re-apply the most recently undone patches. Returns true if anything was redone. */
  redo(): boolean;
  /** Jump to an arbitrary point in history. Returns true if the index changed. */
  goToIndex(index: number): boolean;
  /** Drop the entire history (state stays at the current value). */
  clear(): void;

  readonly canUndo: ReadableStore<boolean>;
  readonly canRedo: ReadableStore<boolean>;

  /**
   * Ordered timestamps of the history checkpoints. Index 0 is the initial
   * state; index N is the state after the Nth retained mutation.
   */
  readonly entries: ReadableStore<readonly HistoryEntry[]>;

  /** Position of the current state within {@link entries}. */
  readonly currentIndex: ReadableStore<number>;
}

export interface PetrinautDocHandle {
  /** Stable id. Used for LSP document URIs, error reports, simulation-recording keys. */
  readonly id: DocumentId;

  /** Lifecycle state, observable. */
  readonly state: ReadableStore<DocHandleState>;

  /** Resolves when state reaches "ready"; rejects on "unavailable" / "deleted". */
  whenReady(): Promise<void>;

  /** Synchronous current value. `undefined` while not ready. */
  doc(): SDCPN | undefined;

  /** Apply a mutation. Implementation decides how (Immer.produce, Automerge.change, plain assignment). */
  change(fn: (draft: SDCPN) => void): void;

  /** Subscribe to changes (local + remote). */
  subscribe(listener: (event: DocChangeEvent) => void): () => void;

  /**
   * Optional. Present on handles that track local history (Immer-backed,
   * Automerge-backed, …). Read-only mirror handles omit it. See §4.1 "History".
   */
  readonly history?: PetrinautHistory;
}
```

### History (locked)

Undo/redo lives on the handle, not as a separate host-implemented interface. Reasons:

- An Immer-backed handle already has the data (`produceWithPatches` returns `[next, forward, inverse]`); the previous design was throwing the inverse patches away.
- Automerge handles can implement `history` against their own time-travel API (`Doc.heads`).
- Read-only / mirror handles simply omit `history`.
- This removes today's pass-through `UndoRedoContextValue`. The host's job becomes "build/choose a handle"; it no longer wires history separately.

`createJsonDocHandle` ships a default implementation:

- Bounded stack (`historyLimit`, default 50) — older entries dropped to cap memory.
- New mutation truncates the redo stack.
- `goToIndex(n)` jumps to an arbitrary point (used by today's version-history dropdown).
- `clear()` empties the stack but leaves the current state alone.
- Each undo / redo / `goToIndex` emits a `DocChangeEvent` with the patches actually applied.
- Pass `historyLimit: 0` to opt out — `handle.history` becomes `undefined`.

### Coalescing — deferred

Single-character edits in Monaco produce one `change` per keystroke, so naïve history would mean one undo per character. The current website's `useUndoRedo` debounces at 500 ms; the spike's handle does not. Two future shapes:

- `handle.transaction(fn)` — group multiple `change` calls into one history entry.
- `handle.change(fn, { coalesceWith: "monaco:transition-t1" })` — tag-based coalescing: merge with the previous entry if tags match.

Most editors do both. Locking the API is a Phase 3 concern; for now the limit is "one change = one history entry."

### Why a handle, not a document or repo

| Level | Why not |
| ----- | ------- |
| **Document** (raw value + 3 callbacks — today's prop shape) | Three loose primitives, no unifying type, no lifecycle (loading / ready / deleted). |
| **Repo** (multi-document, load-by-id, storage / network adapters) | Persistence and sync are host concerns. Core handles one document at a time. |
| **Handle** ✓ | Right scope. One document, observable lifecycle, mutate + subscribe in one type. Matches Automerge `DocHandle<T>` so collaboration plugs in cleanly. |

### Adapters

Core ships exactly one helper for the common case:

```ts
export function createJsonDocHandle(opts: {
  id?: DocumentId;
  initial: SDCPN;
}): PetrinautDocHandle;
```

Internally uses Immer's `produceWithPatches` so plain-JSON consumers get patches for free. Adds `immer` (~14 KB) as a `/core` dep.

Implementation notes (locked by the Phase 0 spike):

- `enablePatches()` must be called once at `/core` module load — `handle.ts` does this at import time before any `produceWithPatches` call.
- **No-op mutations do not emit.** `produceWithPatches` returns an empty patch array when the draft was not actually changed; in that case the handle skips notifying subscribers. Subscribers can rely on "every event corresponds to a real change."

For **Automerge**, no adapter is shipped (would require `@automerge/automerge-repo` as a peer dep). The docs include a 5-line wrapper consumers paste in; Automerge's `Patch` shape maps to `PetrinautPatch` via a small switch (`put` → `replace`, `del` → `remove`, `splice`/`insert` → multiple `add`).

### Where patch conversion happens

Conversion lives **at the handle adapter boundary, inbound only.** Core itself never converts; it only consumes `PetrinautPatch[]`.

| Adapter | Direction | Where it lives | What it does |
| ------- | --------- | -------------- | ------------ |
| `createJsonDocHandle` | Immer → `PetrinautPatch` | `/core` (shipped) | Near-identity. Immer's `produceWithPatches` already emits `{ op, path, value }`; the adapter passes them through (or coerces the type). |
| `fromAutomergeHandle` | Automerge → `PetrinautPatch` | Consumer code (documented snippet) | Switch on `action`: `put` → `replace`, `del` → `remove`, `splice`/`insert` → fan out into per-element `add`. Drops `inc`/`mark`/`unmark` (not used by SDCPN). |

There is **no outbound direction in Core**. Core never needs to turn a `PetrinautPatch` back into an Immer or Automerge patch — the handle is the only thing that applies mutations, and it does so via `change(fn)`, not via patches. If a downstream consumer ever wants to re-apply patches against a separate Immer or Automerge doc (e.g. mirror the document somewhere else), that conversion is their problem and lives in their code.

### `PetrinautPatch` is not a persistence or wire format

`PetrinautPatch` is an **in-memory event payload only**. Do not:

- write it to disk,
- serialize it into telemetry / analytics with a versioned schema,
- send it across a network boundary as a Petrinaut-defined protocol.

Persistence and sync go through the **underlying handle**: `createJsonDocHandle` persists SDCPN snapshots; an Automerge handle persists Automerge's binary change log; future network sync uses the CRDT engine's native protocol (Automerge / Yjs sync messages), not raw `PetrinautPatch[]`.

This is what lets us evolve the patch shape — including the eventual splice-on-string addition for text-range edits (Q1.c) — as a TypeScript-level breaking change with **zero on-disk migration**. Adding a new variant to the `op` union is caught by exhaustiveness checking on every consumer; consumers update; nothing on disk has to.

### Why the handle has its own subscribe shape

`PetrinautDocHandle.subscribe` is **not** a `ReadableStore<SDCPN>`. The event carries optional `patches` and `source` fields that don't belong in a generic state-store interface. Internally Core constructs a `ReadableStore<SDCPN>` (`instance.definition`) on top of the handle, dropping `patches`/`source` for consumers that just want the value.

### Known limitation: text-range edits

`PetrinautPatch` (Immer-shaped) treats strings as atomic. A single-character edit inside a long code block (transition guard, kernel, equation) emits a `replace` carrying the **entire new string** — there is no `splice` op for sub-string ranges.

This is acceptable for the current single-user editor, but it has two drawbacks worth flagging:

1. **Bandwidth.** Every keystroke produces a patch sized like the whole field. For 10 KB code blocks, that's a lot of duplication.
2. **Collaboration.** Character-level CRDT merging (Automerge `Text`, Yjs) requires sub-string operations. Whole-string `replace` ops can't be merged without conflict and would defeat collaborative code editing if it's ever introduced.

**Decision:** keep Immer-shape now; address later. When/if Petrinaut needs collaborative code editing — or when patch volume becomes a problem — a follow-up RFC will introduce either:

- a richer op (`{ op: "splice"; path; index; remove; insert }`) added to `PetrinautPatch`, or
- a separate text-edit event channel on `PetrinautDocHandle` (e.g. `subscribeText(path, listener)`) that operates alongside the structural patch stream.

Tracked as a known follow-up in [07-open-questions.md](./07-open-questions.md) and [09-risks.md](./09-risks.md).

## 4.2 Stream primitive (locked)

Two primitives. State uses `ReadableStore<T>`; one-shot events use `EventStream<T>`.

```ts
type ReadableStore<T> = {
  /** Synchronous read of the current value. */
  get(): T;
  /** Subscribe to changes. The listener receives the new value on every call. Returns an unsubscribe function. */
  subscribe(listener: (value: T) => void): () => void;
};

type EventStream<T> = {
  /** Subscribe to discrete events. Returns an unsubscribe function. */
  subscribe(listener: (event: T) => void): () => void;
};
```

### Why this shape

- **Zero dependencies.** Two interfaces, no library.
- **Listener receives the value.** Avoids forcing every consumer to call `get()` after a ping. Slight allocation cost per emission is acceptable for the rates Petrinaut runs at.
- **Easy to wrap.** A consumer who wants Observable / RxJS / AsyncIterable / Signals can build any of them as a thin adapter on top.
- **React adaptation is one wrapper line.** See [06-react-bindings.md](./06-react-bindings.md) §6.3.

### Alternatives considered

| Option | Why rejected |
| ------ | ------------ |
| Standard `Observable` (TC39 / zen-observable) | Adds a base class for little gain; `error`/`complete` channels rarely apply to state slices. |
| RxJS | Heavy for `/core`; conflicts with consumers' own RxJS versions. |
| `AsyncIterable` | No native "current value" semantics; awkward to multicast. |
| Signals (`@preact/signals-core`) | Push-pull model; less idiomatic outside React-likes. |
| Listener-as-ping (React `useSyncExternalStore` shape) | Slightly cheaper for React, but worse ergonomics for non-React consumers who'd then have to chase a `get()` after every notification. |

## 4.3 The surface

```ts
type Petrinaut = {
  // --- Document (derived from the handle) ---
  readonly handle: PetrinautDocHandle;          // the handle Core was constructed with
  readonly definition: ReadableStore<SDCPN>;    // current snapshot store, sourced from `handle`
  readonly patches: EventStream<PetrinautPatch[]>; // only fires for handles that produce them

  // --- Mutation ---
  mutate(fn: (draft: SDCPN) => void): void;      // delegates to handle.change; no-op if readonly

  // --- Config echo ---
  readonly readonly: boolean;

  // --- Lifecycle ---
  dispose(): void;
};
```

That's it. Earlier drafts of this RFC sketched a much wider surface (`setTitle`, an `lsp` block, a `notifications` stream); each ended up belonging elsewhere — see "Not on the instance" below.

`mutate` and `dispose` carry `this: void` so consumers can pass them as method references without `unbound-method` complaints. Same retrofit was applied to `Simulation` and `LanguageClient`.

### Not on the instance

These are intentionally outside the `Petrinaut` type:

- **Simulation.** Operates on a frozen SDCPN snapshot; no need for the live document. Built via `createSimulation({ sdcpn, ... })`. The host owns the resulting `Simulation` handle and its lifecycle. Multiple simulations can coexist against one document. See [05-simulation.md](./05-simulation.md).
- **LSP.** Built standalone via `createLanguageClient({ createWorker })` from `@hashintel/petrinaut/core/lsp`. Returns a `LanguageClient` handle with `diagnostics: ReadableStore<DiagnosticsSnapshot>`, `notifyDocumentChanged`, `requestCompletion` / `requestHover` / `requestSignatureHelp`, scenario / metric session methods, and `dispose`. The React side wires it up through `<LanguageClientProvider>`; the host can also call it directly for headless use.
- **Notifications.** Folded into `simulation.events` (one-shot `complete` / `error` events the React layer surfaces as toasts). There is no separate notifications channel on the instance.
- **Title.** Net title is a host-management concern, not a document field. Lives in `NetManagement` (`{ title, setTitle, existingNets, createNewNet, loadPetriNet }`) provided by the host through `<PetrinautProvider netManagement={…}>`. See [06-react-bindings.md](./06-react-bindings.md) §6.1.
- **Playback.** Frame-loop timing belongs to whoever drives the visualisation. Today the React layer (`PlaybackProvider`); a future Core helper might package the rAF loop, but it would still take a `Simulation`, not an instance.
- **Editor / UI state.** Selection, panels, modes — purely React.
- **Undo/redo.** Lives on the handle (see §4.1 "History"), not on the instance.
- **Error tracking.** `ErrorTrackerContext` lives in `/react` (host plugs Sentry / Datadog in via the provider). Core has typed error channels (`simulation.events`, `lsp.diagnostics`, `handle.state`); a generic capture callback would duplicate them.

## 4.4 Instantiation patterns

The host produces a `PetrinautDocHandle` and passes it to Core. The four shapes:

### A. Plain JSON (in-memory, headless or React)

```ts
import { createPetrinaut, createJsonDocHandle } from "@hashintel/petrinaut/core";

const handle = createJsonDocHandle({ id: "net-1", initial: emptyNet() });
const instance = createPetrinaut({ document: handle });

instance.mutate((draft) => {
  draft.places.push({ id: "p1", /* … */ });
});
```

`createJsonDocHandle` uses Immer internally, so `subscribe` events carry patches.

### B. Automerge

```ts
import { createPetrinaut } from "@hashintel/petrinaut/core";
import { Repo } from "@automerge/automerge-repo";

const repo = new Repo({ /* storage, network, … */ });
const automergeHandle = repo.find<SDCPN>("automerge:abc123");

const handle = fromAutomergeHandle(automergeHandle); // 5-line adapter, see docs
const instance = createPetrinaut({ document: handle });
```

Petrinaut never sees the `Repo`. Storage, sync, and lifecycle stay in the host.

### C. From the React component (what most consumers see)

```tsx
import { Petrinaut } from "@hashintel/petrinaut/ui";

<Petrinaut handle={handle} /* …other UI props… */ />;
```

`<Petrinaut>` calls `createPetrinaut` internally and disposes the instance on unmount. The handle's identity is the React `key` — replacing the handle re-creates the instance.

### D. Headless simulation (the new use case the split unlocks)

The simulation is constructed standalone — no need for a `Petrinaut` instance if all you want to do is run an SDCPN.

```ts
import { createSimulation } from "@hashintel/petrinaut/core";

const sim = await createSimulation({
  sdcpn: net,
  initialMarking: new Map(),
  parameterValues: {},
  seed: 42,
  dt: 0.01,
  maxTime: 100,
  createWorker: () => new Worker(/* … */),
});

const off = sim.frames.subscribe(({ latest }) => recordFrame(latest));
sim.run();
```

If you already have an instance (for live editing), the SDCPN is a `handle.doc()` away:

```ts
const sim = await createSimulation({
  sdcpn: instance.handle.doc()!,
  initialMarking: new Map(),
  parameterValues: {},
  seed: 42,
  dt: 0.01,
  maxTime: 100,
  createWorker: () => new Worker(/* … */),
});
```

The simulation is independent of the instance and outlives it. Disposing the instance does **not** dispose the simulation; the host owns the simulation's lifecycle. Multiple simulations can coexist against one document (parameter sweeps, scenario comparison).
