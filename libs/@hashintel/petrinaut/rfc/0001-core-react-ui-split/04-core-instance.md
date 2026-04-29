# 04 — Core instance API

The Core needs to express:

- **Inputs** (commands flowing in): mutate definition, run/pause/reset simulation, set playback speed/frame, ack frames, paste from clipboard, etc.
- **Outputs** (events/state flowing out): current SDCPN, simulation status + frame stream, playback frame index, LSP diagnostics, validation errors, notifications.

## 4.1 Construction

```ts
import { createPetrinaut } from "@hashintel/petrinaut/core";

const instance = createPetrinaut({
  // Document ownership: who holds the source of truth?
  document: {
    // Option A — core owns it; host subscribes to changes:
    mode: "owned";
    initial: SDCPN;
  } | {
    // Option B — host owns it (today's model); core asks host to mutate:
    mode: "external";
    get: () => SDCPN;
    mutate: MutateSDCPN; // (fn: (draft: SDCPN) => void) => void
    subscribe: (listener: (next: SDCPN) => void) => () => void;
  };

  simulation?: {
    createWorker: () => Worker; // see 05-simulation.md
  };

  readonly?: boolean;
  errorTracker?: ErrorTracker;
});
```

> **Major design decision (Q1 in [07-open-questions.md](./07-open-questions.md)):** does Core own the document, or does the host? Today the host owns it, which lets immer/automerge sit on top. If Core owns it, we remove the `mutate` callback and Core just exposes the post-mutation state on a stream — but then automerge / collaborative editing has to wrap Core, not the other way around.

## 4.2 Stream primitive

We pick **one** stream primitive and stick with it. Options:

| Option | Pros | Cons |
| ------ | ---- | ---- |
| **Standard `Observable` (TC39 proposal / zen-observable)** | Familiar, composable, no new dep if we ship a small shim. | Not yet standard; need a tiny base class. |
| **RxJS** | Battle-tested, powerful operators. | Heavy dep for a "core" library; conflicts with consumers' RxJS versions. |
| **`AsyncIterable`** | Native, no dep. | Awkward for state ("current value" semantics need extra logic); harder to multicast. |
| **Custom `subscribe(listener) → unsubscribe` + `getSnapshot()`** | Trivial, matches React's `useSyncExternalStore`. | Reinventing observables; less interop. |
| **Signals (`@preact/signals-core`)** | Tiny, fine-grained, very ergonomic. | Push-pull rather than pure push; less common in non-React code. |

**Recommendation:** `subscribe(listener) → unsubscribe` + `getSnapshot()` for state slices, plus an event-emitter pattern for one-shot events (notifications, completion). Zero deps, maps cleanly to `useSyncExternalStore`, easy to wrap as Observable/AsyncIterable on the consumer side. Pending final ack — see Q2 in [07-open-questions.md](./07-open-questions.md).

## 4.3 Sketch of the surface

```ts
type Petrinaut = {
  // --- Document ---
  definition: ReadableStore<SDCPN>;
  mutate: MutateSDCPN;
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

The host-app integration depends on which mode is picked in Q1. The three shapes:

### A. External-document mode (today's model preserved)

Host owns the SDCPN; Core borrows it. This is what most existing consumers (immer, Automerge) already do.

```ts
import { createPetrinaut } from "@hashintel/petrinaut/core";
import { produce } from "immer";

let doc: SDCPN = initialDefinition;
const listeners = new Set<(d: SDCPN) => void>();

const instance = createPetrinaut({
  document: {
    mode: "external",
    get: () => doc,
    mutate: (fn) => {
      doc = produce(doc, fn);
      listeners.forEach((l) => l(doc));
    },
    subscribe: (l) => (listeners.add(l), () => listeners.delete(l)),
  },
  readonly: false,
  errorTracker: mySentryAdapter,
});
```

Automerge variant: `mutate: (fn) => changeDoc(handle, fn)`, `subscribe` taps `handle.on("change", ...)`.

### B. Owned-document mode (Core holds the state)

Simpler for headless consumers that don't need collaboration.

```ts
const instance = createPetrinaut({
  document: { mode: "owned", initial: initialDefinition },
});

instance.mutate((draft) => {
  draft.places.push({ id: "p1", /* … */ });
});

const unsubscribe = instance.definition.subscribe((next) => {
  console.log("definition changed", next);
});
```

### C. From the React component (what 99% of users see)

Host never calls `createPetrinaut` directly — `<Petrinaut>` does it internally and wires its props into mode A:

```tsx
import { Petrinaut } from "@hashintel/petrinaut/ui";

<Petrinaut
  petriNetDefinition={doc}
  mutatePetriNetDefinition={(fn) => setDoc(produce(doc, fn))}
  /* …rest of today's props… */
/>;
```

### D. Headless simulation (the new use case the split unlocks)

```ts
const instance = createPetrinaut({ document: { mode: "owned", initial: net } });
const sim = await instance.startSimulation({ seed: 42, dt: 0.01, maxTime: 100 });
const off = sim.frames.subscribe(({ latest }) => recordFrame(latest));
sim.run();
```

> Open: do we support both A and B (one factory, discriminated `document` field) or pick one? Supporting both is ~30 lines extra and keeps headless ergonomics nice without breaking collaborative editing — but it does mean two code paths to maintain. See Q1.
