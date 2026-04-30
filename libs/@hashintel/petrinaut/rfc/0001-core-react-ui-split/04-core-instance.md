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
}
```

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

For **Automerge**, no adapter is shipped (would require `@automerge/automerge-repo` as a peer dep). The docs include a 5-line wrapper consumers paste in; Automerge's `Patch` shape maps to `PetrinautPatch` via a small switch (`put` → `replace`, `del` → `remove`, `splice`/`insert` → multiple `add`).

### Why the handle has its own subscribe shape

`PetrinautDocHandle.subscribe` is **not** a `ReadableStore<SDCPN>`. The event carries optional `patches` and `source` fields that don't belong in a generic state-store interface. Internally Core constructs a `ReadableStore<SDCPN>` (`instance.definition`) on top of the handle, dropping `patches`/`source` for consumers that just want the value.

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
