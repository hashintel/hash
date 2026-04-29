# 08 — Migration plan

High-level. Will refine after the open questions in [07-open-questions.md](./07-open-questions.md) are settled.

## Phase 1 — Reorganise without behaviour change

1. Create `src/core/`, `src/react/`, `src/ui/` directories.
2. Move pure modules (validation, file-format/import, clipboard/serialize, examples, lib/deep-equal, simulation/simulator, simulation/compile-scenario, simulation/worker, lsp/worker) under `src/core/...`. No API change yet.
3. Move all `views/`, `components/`, `monaco/`, `notifications/` (rendering parts), `resize/`, etc. under `src/ui/`.
4. Move providers, contexts, and hooks into `src/react/`.
5. Update internal imports.
6. Confirm tests + build still pass.

## Phase 2 — Build the Core instance

1. Implement `createPetrinaut()` returning a thin façade over existing logic.
2. Implement `subscribe + getSnapshot` stores backed by current state holders.
3. Define `SimulationTransport` + `createWorkerTransport(createWorker)` + `createInlineTransport()` ([05-simulation.md](./05-simulation.md) §5.1).
4. Add the `./core/simulation.worker` sub-entry in `package.json` `exports` ([05-simulation.md](./05-simulation.md) §5.2).
5. Implement `instance.startSimulation(cfg)` returning a `Simulation` handle whose stores wrap the transport messages ([05-simulation.md](./05-simulation.md) §5.3 / §5.4).
6. Wire `signal` / `dispose()` cancellation paths ([05-simulation.md](./05-simulation.md) §5.5).
7. Move playback frame loop out of `PlaybackProvider` into `instance.playback`. (`requestAnimationFrame` is browser-only — for non-browser consumers we expose a `tick()` method or accept a custom scheduler.)
8. Move LSP wrapping out of `LanguageClientProvider` into `instance.lsp`.

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
