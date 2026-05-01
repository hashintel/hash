# 06 — React bindings (`/react`) and how `/ui` consumes them

The `/react` layer exposes a `<PetrinautProvider>` that takes a Core instance and mounts every bridge provider. The `/ui` layer's `<Petrinaut>` is then a thin wrapper that creates the instance and renders the editor.

## 6.1 `<PetrinautProvider>`

```tsx
// @hashintel/petrinaut/react
export const PetrinautProvider: FC<{ instance: Petrinaut; children: ReactNode }> = ({ instance, children }) => (
  <PetrinautInstanceContext value={instance}>
    <SDCPNProvider /* subscribes to instance.definition */>
      <MutationProvider /* delegates to instance.mutate */>
        <SimulationProvider /* subscribes to instance.simulation.* */>
          <PlaybackProvider /* subscribes to instance.playback.* */>
            <LanguageClientProvider /* subscribes to instance.lsp.* */>
              <EditorProvider>
                <UserSettingsProvider>{children}</UserSettingsProvider>
              </EditorProvider>
            </LanguageClientProvider>
          </PlaybackProvider>
        </SimulationProvider>
      </MutationProvider>
    </SDCPNProvider>
  </PetrinautInstanceContext>
);
```

Each existing provider is rewritten as a **thin bridge**: it reads from a Core stream via `useSyncExternalStore` and republishes through the existing React Context shape. That keeps the consumer-facing context API stable, so `/ui` files don't change.

## 6.2 Hook surface

### 6.2.1 Rules every hook must follow

1. **One concern per hook.** A hook returns a single value, a single coherent action bundle, or subscribes to a single event stream. No "return everything" hooks (the only exception is `usePetrinautInstance` as the explicit escape hatch).
2. **Read hooks return plain values.** Never return a `ReadableStore<T>` — do the `useStore` bridge inside (§6.3). Consumers should not see Core's stream primitive.
3. **Action hooks return stable function references.** Either expose the instance method directly (already stable) or wrap once. Never allocate new closures per render.
4. **Selector hooks let consumers narrow re-renders.** When a value is large (the whole `SDCPN`), expose a `*Selector(selector)` variant alongside the full hook so consumers can subscribe to only their slice.
5. **Subscription hooks for events take a callback and return `void`.** Events have no current value — there's nothing to read between renders. Pattern: `useNotifications(handler)`, `usePetrinautPatches(handler)`. Callback subscribes in `useEffect`, unsubscribes on cleanup.
6. **All hooks require `<PetrinautProvider>` as an ancestor.** Throw a clear error when missing — never silently return defaults.
7. **No mutations during render.** Hooks read; mutations happen in handlers and effects.
8. **Async actions return promises.** No fire-and-poll patterns. `startSimulation` returns `Promise<Simulation>`.
9. **Naming.** `use<Subject>[<Aspect>]` for reads; `use<Subject>Actions` for action bundles; `use<Subject>` for event subscriptions. No abbreviations, no Hungarian prefixes.
10. **No transitive re-renders.** Changing one slice (e.g. simulation frame count) must not re-render consumers of an unrelated slice (e.g. LSP diagnostics). Each hook subscribes only to what it returns.
11. **Hooks live in `/react` only.** `/ui` consumes them; never re-implements them. `/ui` files don't call `useSyncExternalStore` or import from `/core` directly.

### 6.2.2 The full hook surface

```ts
// ─── Instance access (escape hatch) ───────────────────────────────────────
usePetrinautInstance(): Petrinaut;

// ─── Document handle ──────────────────────────────────────────────────────
useDocumentId(): DocumentId;
useDocumentState(): DocHandleState;          // "loading" | "ready" | "deleted" | "unavailable"
useIsDocumentReady(): boolean;               // sugar over state === "ready"

// ─── Document content ─────────────────────────────────────────────────────
usePetrinautDefinition(): SDCPN;
usePetrinautDefinitionSelector<T>(selector: (sdcpn: SDCPN) => T): T;
useMutate(): (fn: (draft: SDCPN) => void) => void;
useSetTitle(): (title: string) => void;
usePetrinautPatches(handler: (patches: PetrinautPatch[]) => void): void;

// ─── Simulation ───────────────────────────────────────────────────────────
useSimulation(): Simulation | null;          // current handle, or null if no run started
useSimulationStatus(): SimulationState;      // "NotRun" | "Paused" | "Running" | "Complete" | "Error"
useSimulationFrameCount(): number;
useSimulationLatestFrame(): SimulationFrame | null;
useStartSimulation(): (cfg: SimulationConfig) => Promise<Simulation>;
useSimulationActions(): {                    // null-safe wrappers over the active sim
  run: () => void;
  pause: () => void;
  reset: () => void;
  ack: (frameNumber: number) => void;
  setBackpressure: (cfg: BackpressureConfig) => void;
};

// ─── Playback ─────────────────────────────────────────────────────────────
usePlaybackState(): PlaybackState;           // { playState, frameIndex, speed, mode }
usePlaybackFrameIndex(): number;             // selector hook for the hot path
usePlaybackActions(): {
  play: () => void;
  pause: () => void;
  stop: () => void;
  setSpeed: (s: number) => void;
  setFrameIndex: (i: number) => void;
  setMode: (m: PlayMode) => void;
};

// ─── LSP ──────────────────────────────────────────────────────────────────
useDiagnostics(): { byUri: Map<DocumentUri, Diagnostic[]>; total: number };
useDiagnosticsForUri(uri: DocumentUri): Diagnostic[];
useTotalDiagnosticsCount(): number;
useLspActions(): {
  notifyDocumentChanged: (uri: DocumentUri, text: string) => void;
  requestCompletion: (uri: DocumentUri, position: Position) => Promise<CompletionList>;
  requestHover: (uri: DocumentUri, position: Position) => Promise<Hover | null>;
  requestSignatureHelp: (uri: DocumentUri, position: Position) => Promise<SignatureHelp | null>;
  initializeScenarioSession: (params: ScenarioSessionParams) => void;
  updateScenarioSession: (params: ScenarioSessionParams) => void;
  killScenarioSession: (sessionId: string) => void;
};

// ─── Notifications ────────────────────────────────────────────────────────
useNotifications(handler: (n: Notification) => void): void;

// ─── Settings / mode ──────────────────────────────────────────────────────
useIsReadOnly(): boolean;
```

### 6.2.3 Why split read hooks from action bundles

State and actions live on different timescales. Read hooks change the rendered tree on every value change; action bundles never do, because they return stable function references. Bundling them together (the "useState-style" tuple) means consumers re-render on state change even when they only call actions, which fights React's render model.

The split also makes the dependency surface clear: a component that only mutates uses `useMutate()` and never subscribes to the definition.

### 6.2.4 Pitfalls and conventions

- **Selectors must be stable across renders.** React Compiler memoizes inline functions in this codebase, so `usePetrinautDefinitionSelector(s => s.transitions[0])` is fine. Outside the compiler, consumers would need `useCallback`.
- **Subscription hooks accept unstable callbacks.** Inside, the callback is captured in a ref and re-read on each event, so consumers can pass inline arrows freely.
- **`useSimulationActions()` is null-safe.** When `instance.simulation.get()` returns `null`, calling `actions.run()` is a no-op (with a dev warning), not a throw. Callers that need the active handle directly use `useSimulation()` and check.
- **Don't compose hooks that subscribe to the same store twice.** A `useDiagnosticsForUri(uri)` and a `useDiagnostics()` in the same component share a single subscription internally — but two separate `useStore(instance.lsp.diagnostics)` calls would each register a subscription. Acceptable, but worth a perf note.
- **`usePetrinautPatches(handler)` does not include the local snapshot.** If the consumer needs the resulting state, they should also subscribe to `usePetrinautDefinition` (or use the snapshot in scope).

## 6.3 Bridging `ReadableStore<T>` to `useSyncExternalStore`

Core's `ReadableStore<T>.subscribe` passes the new value to its listener; React's `useSyncExternalStore` passes nothing. The adapter is one function:

```ts
// @hashintel/petrinaut/react/lib/use-store.ts
import { useSyncExternalStore } from "react";
import type { ReadableStore } from "@hashintel/petrinaut/core";

export function useStore<T>(store: ReadableStore<T>): T {
  return useSyncExternalStore(
    (onStoreChange) => store.subscribe(() => onStoreChange()),
    store.get,
  );
}

export function useStoreSelector<T, U>(
  store: ReadableStore<T>,
  selector: (value: T) => U,
): U {
  return useSyncExternalStore(
    (onStoreChange) => store.subscribe(() => onStoreChange()),
    () => selector(store.get()),
  );
}
```

Every hook in `/react` uses these two helpers. Consumers never call `useSyncExternalStore` directly.

### Note: oxlint `unbound-method` and method typing

Passing `store.get` (or any Core method) as a function reference triggers the `typescript-eslint(unbound-method)` rule under oxlint, even though our methods don't use `this`. Two fixes:

1. **Inline-wrap at the call site** — `() => store.get()`. Done in the Phase 0 spike.
2. **Type the method with `this: void`** — preferred long-term: declare `get(this: void): T;` in `ReadableStore<T>` (and similarly on `Petrinaut.mutate`, etc.). Lets consumers and bridges pass the method reference directly without wrapping.

Phase 2 should adopt approach (2) when finalising the Core types, so `/react` and downstream consumers don't have to wrap. Spike code uses (1) as the temporary form.

### LSP example

The existing `LanguageClientProvider` becomes a ~10-line bridge:

```tsx
const instance = usePetrinautInstance();
const diagnostics = useStore(instance.lsp.diagnostics);

const value: LanguageClientContextValue = {
  diagnosticsByUri: diagnostics.byUri,
  totalDiagnosticsCount: diagnostics.total,
  notifyDocumentChanged: instance.lsp.notifyDocumentChanged,
  requestCompletion: instance.lsp.requestCompletion,
  requestHover: instance.lsp.requestHover,
  requestSignatureHelp: instance.lsp.requestSignatureHelp,
  initializeScenarioSession: instance.lsp.initializeScenarioSession,
  updateScenarioSession: instance.lsp.updateScenarioSession,
  killScenarioSession: instance.lsp.killScenarioSession,
};
```

Monaco bindings (`monaco/sync/*` adapters that today call into `LanguageClientContext`) keep consuming the React context — they don't touch Core directly. This satisfies the rule from the README: `ui` → `react` → `core`, never skip a layer.

## 6.4 `/ui`'s top-level component

```tsx
// @hashintel/petrinaut/ui
export type PetrinautProps = {
  handle: PetrinautDocHandle; // replaces today's petriNetDefinition + mutatePetriNetDefinition
  readonly?: boolean;
  hideNetManagementControls?: boolean;
  viewportActions?: ViewportAction[];
  // …other UI props…
};

export const Petrinaut: FC<PetrinautProps> = (props) => {
  const instance = useMemo(() => createPetrinaut({ document: props.handle, readonly: props.readonly }), [props.handle, props.readonly]);
  useEffect(() => () => instance.dispose(), [instance]);

  return (
    <PetrinautProvider instance={instance}>
      <NotificationsToaster />
      <MonacoProvider>
        <EditorView
          hideNetManagementControls={props.hideNetManagementControls}
          viewportActions={props.viewportActions}
        />
      </MonacoProvider>
    </PetrinautProvider>
  );
};
```

The existing context API to child components stays roughly the same — only the *source* of context values changes (from local React state to the Core instance). That keeps the diff inside `views/` and `components/` close to zero.

## 6.5 React Compiler interaction

The library uses React Compiler with `panicThreshold: "critical_errors"`. Two things to watch:

- **Instance handles.** `createPetrinaut()` returns a stable object. Compiler memoization of derived values built off `instance.foo` is fine because `instance` is stable for the component's lifetime.
- **`useSyncExternalStore` selectors.** These are read in render but already understood by the compiler. No `"use no memo"` should be needed.

**Confirmed by the Phase 0 spike.** The `<PetrinautNext>` wrapper builds and runs under React Compiler with no opt-outs and no panic-threshold violations. Both bullets above held up in practice. Phase 3 should retain this property — opt out only where the compiler genuinely can't reason about a hook.
