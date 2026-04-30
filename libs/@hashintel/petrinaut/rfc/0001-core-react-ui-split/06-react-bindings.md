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

## 6.2 Hooks

```ts
// instance access
export const usePetrinautInstance = (): Petrinaut => use(PetrinautInstanceContext);

// document
export const usePetrinautDefinition = (): SDCPN => /* useSyncExternalStore over instance.definition */;
export const usePetrinautMutate = (): MutateSDCPN => /* … */;

// simulation
export const useSimulation = (): Simulation | null => /* … */;
export const useSimulationStatus = (): SimulationState => /* … */;
export const useSimulationFrameCount = (): number => /* … */;

// playback
export const usePlaybackState = (): PlaybackState => /* … */;

// lsp
export const useDiagnostics = (): { byUri: Map<DocumentUri, Diagnostic[]>; total: number } => /* … */;

// notifications
export const useNotifications = (handler: (n: Notification) => void) => /* subscribe in effect */;
```

Hook surface principle: **one hook per stream slice.** Nothing returns the whole instance plus all its state — that defeats the point of `useSyncExternalStore`'s selector-driven re-renders.

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
export const Petrinaut: FC<PetrinautProps> = (props) => {
  const instance = useMemo(() => createPetrinaut(/* derived from props */), []);
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

Verify both during Phase 3 implementation; opt-out only where the compiler genuinely can't reason about a hook.
