# 08 — Migration plan

High-level. Will refine after the open questions in [07-open-questions.md](./07-open-questions.md) are settled.

## Phase 0 — Proof-of-concept spike (done)

A thin slice landed alongside the existing code path to validate the core concepts before the full reorganisation. Files added (no existing files modified):

- `src/core/handle.ts` — `PetrinautDocHandle`, `PetrinautPatch`, `DocChangeEvent`, `ReadableStore`, `PetrinautHistory`, `HistoryEntry`, and `createJsonDocHandle` (Immer-backed) with optional bounded history stack.
- `src/core/instance.ts` — `Petrinaut` type, `createPetrinaut`, `EventStream`, `definition` store, `patches` event stream, `mutate`, `dispose`.
- `src/core/handle.test.ts` — 15 smoke tests covering handle lifecycle, mutations, patches, no-op skipping, readonly-mode, and the history sub-API (undo/redo/goToIndex/clear, limit enforcement, redo-stack truncation, change events on undo/redo).
- `src/react/use-store.ts` — `useStore` / `useStoreSelector` adapters over `useSyncExternalStore`.
- `src/react/instance-context.ts` — `PetrinautInstanceContext`.
- `src/react/use-petrinaut-instance.ts` — escape-hatch hook that throws if no `<PetrinautProvider>` is mounted.
- `src/ui/petrinaut-next.tsx` — `<PetrinautNext handle={…}>` that creates a Core instance and bridges to the existing prop-shaped `<Petrinaut>`. Also bridges `handle.history` (when present) into the existing `UndoRedoContextValue` so the editor's top-bar undo/redo button, version-history dropdown, and Cmd/Ctrl+Z keyboard shortcut all work without consumer wiring.
- `src/petrinaut.stories.tsx` — two stories (`HandleSpike`, `HandleSpikeWithSir`) with an on-screen patch-log overlay.
- `src/main.ts` — re-exports `createJsonDocHandle`, `createPetrinaut`, `<PetrinautNext>`, and the new types so consumers of `@hashintel/petrinaut` can use the handle-driven path today.
- `package.json` — `immer: 10.1.3` added to `dependencies`.

**Downstream consumer updated in the same pass:**

- `apps/petrinaut-website/src/main/app.tsx` — switched from `<Petrinaut>` (prop-shaped) to `<PetrinautNext handle={…}>` (handle-driven). Maintains a per-net `PetrinautDocHandle` cache; mirrors handle changes to localStorage via `handle.subscribe`.
- `apps/petrinaut-website/src/main/app/use-undo-redo.ts` — **deleted.** Each handle owns its own history; the website-level history hook is no longer needed. Per-net history is preserved across net switches automatically.

**Validated:**

- `useSyncExternalStore` works under React Compiler with zero `"use no memo"` opt-outs.
- `createJsonDocHandle` round-trips: mutations → Immer patches → `PetrinautPatch[]` → subscribers in the editor + a story-level patch log.
- The full editor (`EditorView`, all existing providers) renders unchanged when fed via the bridge.
- Build, type-check, lint, and 462 unit tests all pass.

**Issues surfaced (queued for later phases):**

- `oxlint(unbound-method)` flags `store.get` and `instance.mutate` when passed as references. Spike used arrow-wrapping; Phase 2 should switch to `this: void` typing on Core methods to remove the wrapping. See [06-react-bindings.md](./06-react-bindings.md) §6.3.
- `enablePatches()` from Immer must be called at `/core` module load — `handle.ts` does this; documented in [04-core-instance.md](./04-core-instance.md) §4.1.
- No-op mutations don't emit (Immer returns an empty patch array). Subscribers may rely on "every event is a real change." Documented as a contract.

## Phase 1 — Reorganise without behaviour change

1. Create `src/core/`, `src/react/`, `src/ui/` directories.
2. Move pure modules (validation, file-format/import, clipboard/serialize, examples, lib/deep-equal, simulation/simulator, simulation/compile-scenario, simulation/worker, lsp/worker) under `src/core/...`. No API change yet.
3. Move all `views/`, `components/`, `monaco/`, `notifications/` (rendering parts), `resize/`, etc. under `src/ui/`.
4. Move providers, contexts, and hooks into `src/react/`.
5. Update internal imports.
6. Confirm tests + build still pass.

## Phase 2 — Build the Core instance

1. ~~Implement `createPetrinaut()` returning a thin façade over existing logic.~~ Done in Phase 0.
2. ~~Implement `subscribe + getSnapshot` stores backed by current state holders.~~ Done in Phase 0.
3. ~~Define `SimulationTransport` + `createWorkerTransport(createWorker)`~~ ([05-simulation.md](./05-simulation.md) §5.1) — done. `createInlineTransport()` deferred — interface is shape-compatible, can ship later without API change.
4. Add the `./core/simulation.worker` sub-entry in `package.json` `exports` ([05-simulation.md](./05-simulation.md) §5.2). **Pending** — only relevant once `/core` is its own bundle (Phase 5).
5. ~~Implement `instance.startSimulation(cfg)` returning a `Simulation` handle whose stores wrap the transport messages~~ ([05-simulation.md](./05-simulation.md) §5.3 / §5.4) — done.
6. ~~Wire `signal` / `dispose()` cancellation paths~~ ([05-simulation.md](./05-simulation.md) §5.5) — done.
7. Move playback frame loop out of `PlaybackProvider` into `instance.playback`. (`requestAnimationFrame` is browser-only — for non-browser consumers we expose a `tick()` method or accept a custom scheduler.)
8. Move LSP wrapping out of `LanguageClientProvider` into `instance.lsp`.

### Phase 2a — Simulation transport (done)

Files added:

- `src/core/simulation/transport.ts` — `SimulationTransport` interface, `createWorkerTransport(createWorker)`, `WorkerFactory`. Async-factory friendly: messages sent before worker boot are queued and flushed.
- `src/core/simulation/simulation.ts` — `Simulation` interface, `startSimulation({ transport, config })` factory. Promise resolves on `ready`; rejects on init `error` or `AbortSignal` abort. `dispose()` is idempotent.
- `src/core/simulation/index.ts` — barrel re-export.
- `src/core/simulation/simulation.test.ts` — 7 unit tests with a manual transport.

`createPetrinaut` gained `simulation.createWorker` config and `instance.{simulation, startSimulation}`. The existing `<SimulationProvider>` is **not yet replaced** — the existing prop-shaped `<Petrinaut>` continues to use `useSimulationWorker`. The `/react` bridge over `instance.simulation` is the next step.

Public exports added in `main.ts`: `createWorkerTransport`, `startSimulation`, plus the `Simulation*` types and `SimulationTransport` / `WorkerFactory`.

## Phase 3 — React bindings

1. Rewrite each bridge provider in `/react` to subscribe to a Core instance instead of holding local state. Keep their existing public context shapes so `/ui` consumers don't change.
2. Add `<PetrinautProvider instance={...}>` that mounts the bridge stack ([06-react-bindings.md](./06-react-bindings.md) §6.1).
3. Add `usePetrinautInstance`, `usePetrinautDefinition`, `useSimulationStatus`, `usePlaybackState`, `useDiagnostics`, etc. as the public hook surface ([06-react-bindings.md](./06-react-bindings.md) §6.2).

## Phase 4 — UI

1. Top-level `<Petrinaut>` (in `/ui`) creates a Core instance, mounts `<PetrinautProvider>`, then renders `MonacoProvider` + `EditorView` + toaster.
2. Verify no `/ui` file imports from `core/` directly — everything goes via `/react` hooks.

## Phase 5 — Public entry points

1. Add `exports` map: `"."` → `/ui`, `"./core"`, `"./react"`, `"./ui"`. Migrate `main.ts` to thin re-exports for back-compat.
2. Update build (Rolldown) to emit three entry bundles with appropriate `external`s (no React in `/core`'s bundle; no Monaco/xyflow in `/react`'s).
3. Update consumers in this monorepo (find call sites, switch to `/ui` or `/core` as appropriate).
4. Bump package version, write CHANGELOG entry.

## Phase 6 — (optional) trim deps further

Investigate moving `react`, `@xyflow/react`, `monaco-editor`, panda CSS out of the `dependencies` block where they're not needed by every entry point. Most likely candidates: split `peerDependencies` per entry, or rely on bundlers' tree-shaking + a clean `external` list.
