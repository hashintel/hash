# 04 — Core instance API

The Core needs to express:

- **Inputs** (commands flowing in): mutate definition, run/pause/reset simulation, set playback speed/frame, ack frames, paste from clipboard, etc.
- **Outputs** (events/state flowing out): current SDCPN, simulation status + frame stream, playback frame index, LSP diagnostics, validation errors, notifications.

## 4.1 Construction (locked)

Core never owns the document. It is given a **handle** to one — produced by the host from a plain JSON store, an Automerge `DocHandle`, or anything else that can satisfy the `PetrinautDocHandle` interface.

```ts
import { createPetrinaut } from "@hashintel/petrinaut/core";
import type { PetrinautDocHandle, ErrorTracker } from "@hashintel/petrinaut/core";

const instance = createPetrinaut({
  document: PetrinautDocHandle;

  simulation?: {
    createWorker: () => Worker; // see 05-simulation.md
  };

  readonly?: boolean;
  errorTracker?: ErrorTracker;
});
```

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

## 4.3 Sketch of the surface

```ts
type Petrinaut = {
  // --- Document (derived from the handle) ---
  handle: PetrinautDocHandle;            // the handle Core was constructed with
  definition: ReadableStore<SDCPN>;      // post-`whenReady` snapshot store, sourced from `handle`
  patches: EventStream<PetrinautPatch[]>; // emitted only by handles that produce them
  mutate: (fn: (draft: SDCPN) => void) => void; // delegates to handle.change
  setTitle: (title: string) => void;

  // --- Simulation (lazy — see 05-simulation.md) ---
  simulation: ReadableStore<Simulation | null>;
  startSimulation: (cfg: SimulationConfig) => Promise<Simulation>;

  // --- Playback ---
  playback: {
    state: ReadableStore<{ playState: PlayState; frameIndex: number; speed: number; mode: PlayMode }>;
    play: () => void;
    pause: () => void;
    stop: () => void;
    setSpeed: (s: number) => void;
    setFrameIndex: (i: number) => void;
    setMode: (m: PlayMode) => void;
  };

  // --- LSP (see 04.5) ---
  lsp: {
    diagnostics: ReadableStore<{ byUri: Map<DocumentUri, Diagnostic[]>; total: number }>;
    notifyDocumentChanged: (uri: DocumentUri, text: string) => void;
    initializeScenarioSession: (params: ScenarioSessionParams) => void;
    updateScenarioSession: (params: ScenarioSessionParams) => void;
    killScenarioSession: (sessionId: string) => void;
    requestCompletion: (uri: DocumentUri, position: Position) => Promise<CompletionList>;
    requestHover: (uri: DocumentUri, position: Position) => Promise<Hover | null>;
    requestSignatureHelp: (uri: DocumentUri, position: Position) => Promise<SignatureHelp | null>;
  };

  // --- Notifications (output stream) ---
  notifications: EventStream<Notification>;

  // --- Lifecycle ---
  dispose: () => void;
};

type ReadableStore<T> = {
  get: () => T;
  subscribe: (l: (value: T) => void) => () => void;
};

type EventStream<T> = {
  subscribe: (l: (event: T) => void) => () => void;
};
```

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

```ts
const handle = createJsonDocHandle({ initial: net });
const instance = createPetrinaut({ document: handle });

const sim = await instance.startSimulation({ seed: 42, dt: 0.01, maxTime: 100 });
const off = sim.frames.subscribe(({ latest }) => recordFrame(latest));
sim.run();
```
