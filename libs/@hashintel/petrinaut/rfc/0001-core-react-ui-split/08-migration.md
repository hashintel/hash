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

Done incrementally, alongside subsystem-by-subsystem work:

1. ✅ `src/core/`, `src/react/`, `src/ui/` directories created (Phase 0).
2. **Simulation subsystem moved (done):**
   - `src/simulation/simulator/` → `src/core/simulation/simulator/`
   - `src/simulation/worker/` → `src/core/simulation/worker/`
   - `src/simulation/compile-scenario.{ts,test.ts}` → `src/core/simulation/`
   - `src/simulation/compile-metric.{ts,test.ts}` → `src/core/simulation/`
   - `src/simulation/metric-state.ts` → `src/core/simulation/`
   - `src/simulation/sandbox.ts` → `src/core/simulation/`
   - `src/simulation/README.md` → `src/core/simulation/`
   - `src/simulation/context.ts` split: pure types (`SimulationFrame`, `InitialMarking`, `SimulationFrameState_*`, `SimulationFrameState`) extracted to `src/core/simulation/types.ts`; React glue (`SimulationContext`, `SimulationContextValue`, legacy `SimulationState` enum) → `src/react/simulation/context.ts`.
   - `src/simulation/provider.tsx` → `src/react/simulation/provider.tsx`.
   - All ~22 consumer files updated to the new paths. `src/simulation/` directory removed.
3. **Pending:** validation, file-format/import, clipboard/serialize, examples, lib/deep-equal, lsp/worker still in old locations. To be moved when their subsystems get worked on.
4. **Pending:** `views/`, `components/`, `monaco/`, `notifications/` (rendering parts), `resize/` → `src/ui/`. Mechanical move; deferred until `/ui` becomes a separate bundle.
5. **Pending:** providers, contexts, and hooks → `src/react/`. Same — moves alongside subsystem work.

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
- `src/core/simulation/simulation.ts` — `Simulation` interface, **`createSimulation(config)`** factory. Accepts either a `createWorker: WorkerFactory` or a pre-built `transport: SimulationTransport` (discriminated union). Promise resolves on `ready`; rejects on init `error` or `AbortSignal` abort. `dispose()` is idempotent and tears down the transport.
- `src/core/simulation/index.ts` — barrel re-export.
- `src/core/simulation/simulation.test.ts` — 8 unit tests covering both flavours (mock transport + fake-`Worker` factory route).

**Decoupled from `createPetrinaut`.** Simulations operate on a frozen SDCPN snapshot — they don't need the live document. So `createPetrinaut` does **not** take a simulation config, and the `Petrinaut` instance has no `simulation` field. To run a simulation, call `createSimulation({ sdcpn, ... })` directly (passing `instance.handle.doc()` if you have an instance, or any other SDCPN value). Multiple simulations can coexist against one document.

Public exports added in `main.ts`: `createSimulation`, `createWorkerTransport`, plus the `Simulation*` types, `CreateSimulationConfig`, `SimulationTransport`, and `WorkerFactory`.

### Phase 4 — UI relocation (done)

The visual editor and its supporting subsystems moved from flat `src/` into `src/ui/`:

| From | To | Files |
| ---- | -- | ----- |
| `src/monaco/` | `src/ui/monaco/` | 9 |
| `src/views/` | `src/ui/views/` | 88 |
| `src/components/` | `src/ui/components/` | 30 |
| `src/resize/` | `src/ui/resize/` | 1 |
| `src/constants/` | `src/ui/constants/` | 4 |
| `src/petrinaut.tsx` | `src/ui/petrinaut.tsx` | 1 |
| `src/petrinaut.stories.tsx` | `src/ui/petrinaut.stories.tsx` | 1 |
| `src/petrinaut-story-provider.tsx` | `src/ui/petrinaut-story-provider.tsx` | 1 |
| `src/index.css` | `src/ui/index.css` | 1 |
| `src/fontsource.d.ts` | `src/ui/fontsource.d.ts` | 1 |

All 137 files moved via `git mv` (history preserved).

**Import-path fix-ups** applied via two perl passes:

1. Inside files now under `src/ui/`, paths to non-moved dirs (`core`, `react`, `state`, `clipboard`, `lib`, `examples`, `validation`, `file-format`, `hooks`, `error-tracker`, `types`) got one extra `../` because they're now one level deeper. Two false positives — `views/SDCPN/hooks/` and `views/Editor/lib/` are nested directories with the same name as top-level dirs — manually reverted in three transition-node files.
2. Files outside `/ui/` referencing the moved dirs (e.g. `state/mutation-provider.tsx` referring to `views/SDCPN/styles/styling`) had `ui/` inserted into the path.
3. Top-level config files (`panda.config.shared.ts`) updated by hand.
4. Two pre-existing files in `src/ui/` (`petrinaut-next.tsx`, `index.ts`) had their `../core/...` etc. paths un-deepened — they were already at the correct depth and shouldn't have been touched by the bulk pass.

**Verified**: yarn lint:tsc + yarn lint:eslint clean; yarn build succeeds; 485 unit tests pass.

**Layer rule status**: spot-checked that `/ui` files don't import `/core` *values* directly. They do import `/core` *types* (e.g. `SDCPN`, `PetrinautDocHandle`, `Diagnostic`), which is fine — type-only imports don't create runtime dependencies. The "no `/ui` → `/core` value imports" rule is honored. A formal audit (e.g. an eslint plugin enforcing layer direction) is a future cleanup, not blocking.

**Pending Phase 1 moves** (no forcing function — done as a single tidiness commit later if desired):

- ~~`src/state/` → `src/react/state/`~~ — done (post-Phase 3b). All 13 files (`*-context.ts`, `*-provider.tsx`, `selection.ts`, the `use-*` hooks) moved via `git mv`. Imports rewritten across 67 consumer files via perl. The two pre-existing `react/state → ui/constants/ui` value imports were resolved by extracting `panel-defaults.ts` into `react/state/` (and `node-dimensions.ts` into `ui/views/SDCPN/`); the layer-direction lint rule now passes cleanly.
- ~~`src/lib/` → split between `src/core/lib/` and `src/ui/lib/`~~ — done. `deep-equal` (and its test) moved to `src/core/lib/`; `calculate-graph-layout`, `hsl-color`, `snap-position-to-grid`, `split-pascal-case`, `viewport` (and tests) moved to `src/ui/lib/`. `src/lib/` is gone. The layer-direction lint rule now covers these files automatically (`/core/lib/**` is part of `/core/**`, `/ui/lib/**` is part of `/ui/**`).
- ~~`get-connections` to `/core/lib/`~~ — done in a follow-up. The function is pure graph traversal but pulled in `generateArcId` and `SelectionMap` from `react/state/`, which initially forced it to land in `react/state/`. Those two pure pieces were extracted: the ARC ID conventions (`ARC_ID_PREFIX`, `ARC_ID_SEPARATOR`, `generateArcId`, `ArcIdPrefix`) live in `src/core/arc-id.ts`, and the SDCPN-shaped selection types (`SelectionItemType`, `SelectionItem`, `SelectionMap`, `PanelTarget`, `parseArcId`) live in `src/core/types/selection.ts`. With those upstream, `get-connections` itself moved to `src/core/lib/get-connections.ts`. `src/react/state/selection.ts` was deleted; `src/react/state/sdcpn-context.ts` shrank to just its React-context shape. ~30 consumer imports across `/ui`, `/react`, and `/clipboard` repointed at the new `/core` paths.
- `src/hooks/` → split between `src/core/` (pure) and `src/react/hooks/`
- `src/clipboard/` → split between `src/core/clipboard/` (pure) and `src/ui/clipboard/` (DOM)
- `src/file-format/` → split between `src/core/file-format/` (import) and `src/ui/file-format/` (export)
- `src/examples/` — **stay at root for now** (decision: 2026-05-05). The 6 SDCPN samples will eventually move out of the editor's "Load example" submenu, ship as a separate `@hashintel/petrinaut/examples` subpath export, and surface in the demo site via per-example read-only routes (e.g. `/examples/sir-model`). Skip during the Phase 1 sweep; revisit when that flow lands.
- `src/validation/` — alive (`validate*` functions consumed by Properties Panel); export surface trimmed (schemas + result-type aliases unexported). Still at top level; could move to `src/core/validation/` if we want layer enforcement.
- `src/error-tracker/` — leave per the RFC's earlier decision

### Phase 5 — Public entry points (done)

The headline deliverable: `@hashintel/petrinaut/core`, `/react`, `/ui` are now real subpath imports backed by separate bundles.

**Per-entry barrels** in `src/`:

- `src/core/index.ts` — re-exports the headless surface: handle / instance / simulation / lsp / playback factories + types, `parameter-values` utilities, `SDCPNItemError`, domain types.
- `src/react/index.ts` — re-exports the React bindings: `<PetrinautInstanceContext>`, `usePetrinautInstance`, `useStore`, `useStoreSelector`, plus the full hook surface from `react/hooks/`.
- `src/ui/index.ts` — re-exports `<PetrinautNext>` and (via re-export from `src/petrinaut.tsx`) the existing `<Petrinaut>` editor + `isSDCPNEqual`.
- `src/main.ts` — back-compat barrel; left unchanged so existing consumers (the website) keep working without import-path edits.

**`package.json` `exports` map** with four entries: `.`, `./core`, `./react`, `./ui`, plus `./package.json` for tooling.

**Multi-entry build config** in `vite.config.ts`:

- `lib.entry` is now an object mapping each alias (`main`, `core`, `react`, `ui`) to its entry file.
- `lib.fileName` template emits `${entryName}.js` for each.
- The `dts` plugin emits per-entry `.d.ts` bundles (current quirk: filenames come out as `core.d.d.ts` instead of `core.d.ts` — cosmetic; the `exports` map points at the actual paths).

**Externals tightened**: `vscode-languageserver-types` added to the `external` list. This is what unblocks the multi-entry build — when the upstream namespace-merged types are externalised, [sxzz/rolldown-plugin-dts#209](https://github.com/sxzz/rolldown-plugin-dts/issues/209) "Duplicated export" errors disappear because the plugin no longer tries to inline the upstream `.d.ts` into multiple bundles. LSP types now ship as `import type { … } from "vscode-languageserver-types"` in the consumer's resolved type tree, which matches how every other LSP-using library handles it.

**Phase 5 prep audit** (the only forced cleanup):

- `core/simulation/simulator/build-simulation.ts` was importing `deriveDefaultParameterValues` and `mergeParameterValues` from `hooks/use-default-parameter-values.ts` — a layer leak (`/core` reaching into `/hooks`). Extracted the pure functions into `src/core/parameter-values.ts`. The hook file now re-exports from there for back-compat.

**Bundle sanity check**:

- `dist/core.js` (4 KB stub + chunks): no `import "react"`. Confirms `/core` is genuinely React-free.
- `dist/react.js`: imports React; expected.
- `dist/ui.js`: imports React, Monaco, `@xyflow/react`; expected.

**Not yet done** (deferred to Phase 4 or later):

- The website (`apps/petrinaut-website`) still imports from `@hashintel/petrinaut` (the default `.` entry). It works via back-compat. Switching it to `/ui` is a one-line change but not required.
- The legacy `<Petrinaut>` editor still lives at `src/petrinaut.tsx`. Phase 4 moves it (and `views/`, `components/`, `monaco/`, `resize/`) into `src/ui/` properly.
- The remaining "no-forcing-function" Phase 1 moves (`examples/`, `validation/`, `clipboard/` split, `file-format/` split, `lib/` split, `constants/`, `state/`) — still pending.

### Phase 3a — Public hook surface (done)

The 25-hook surface from [06-react-bindings.md](./06-react-bindings.md) §6.2, implemented as thin wrappers over the existing React contexts:

- `src/react/hooks/use-document.ts` — `usePetrinautDefinition`, `usePetrinautDefinitionSelector`, `useMutate`, `useSetTitle`, `useTitle`, `useDocumentId`, `useDocumentState`, `useIsDocumentReady`, `usePetrinautPatches`.
- `src/react/hooks/use-simulation.ts` — `useSimulationStatus`, `useSimulationFrameCount`, `useGetSimulationFrame`, `useSimulationActions`, `useSimulationParameters`, `useSimulationError`.
- `src/react/hooks/use-playback.ts` — `usePlaybackState`, `usePlaybackFrameIndex`, `usePlaybackSpeed`, `usePlaybackMode`, `useCurrentFrame`, `useCurrentViewedFrame`, `usePlaybackActions`, `useIsViewOnlyAvailable`, `useIsComputeAvailable`.
- `src/react/hooks/use-lsp.ts` — `useDiagnostics`, `useDiagnosticsForUri`, `useTotalDiagnosticsCount`, `useLspActions`.
- `src/react/hooks/index.ts` — barrel; re-exports `useIsReadOnly`, `useNotifications`, `usePetrinautInstance`, `useStore`, `useStoreSelector`.

Most hooks read from the existing React contexts (`SDCPNContext`, `SimulationContext`, `PlaybackContext`, `LanguageClientContext`). A few read from the Petrinaut instance directly (`useMutate`, `useDocumentState`, `useDocumentId` via instance, `usePetrinautPatches`).

`this: void` retrofit applied to `Petrinaut` (`mutate`, `dispose`) and `Simulation` (`run`, `pause`, `reset`, `ack`, `setBackpressure`, `getFrame`, `dispose`) — same treatment LSP already had. Removes the `unbound-method` complaint when consumers pass methods as references.

**What's deferred to Phase 3b**: replacing the existing per-feature provider stack (`<SDCPNProvider>`, `<MutationProvider>`, `<SimulationProvider>`, `<PlaybackProvider>`, `<LanguageClientProvider>`) with a single `<PetrinautProvider instance={…}>` that mounts all the bridges. Today's hooks work inside the existing prop-shaped `<Petrinaut>` (whether mounted directly or via `<PetrinautNext>`).

### Phase 3b — Provider unification (done)

`<PetrinautProvider>` is the single React entry point for mounting every bridge against a Core instance, and the legacy prop-shaped `<Petrinaut>` is now a thin adapter on top of it.

- `src/react/petrinaut-provider.tsx` — `<PetrinautProvider instance netManagement>`. Composes (top-down):
  - `PetrinautInstanceContext` (host for `usePetrinautInstance`)
  - `NetManagementContext` (host-owned: `title / setTitle / existingNets / createNewNet / loadPetriNet`)
  - `UndoRedoContext` — **only mounted when `instance.handle.history` is defined**, fed via `useHandleHistoryAsUndoRedo`. When absent, the outer `UndoRedoContext` (e.g. one wrapped by the legacy `<Petrinaut>` adapter) shows through unchanged.
  - `SDCPNProvider` (bridge)
  - `LanguageClientProvider` (bridge; keyed by `instance.handle.id` so a net switch fully resets the LSP worker)
  - `SimulationProvider`, `PlaybackProvider` (bridges)
  - `UserSettingsProvider`, `EditorProvider` (UI-state, unchanged)
  - `MutationProvider` (bridge)
- `src/react/sdcpn-provider.tsx` — new bridge. Reads `usePetrinautInstance()` + `use(NetManagementContext)`, subscribes to `instance.definition` via `useStore`, republishes through the existing `SDCPNContext` shape (no signature changes for `/ui` consumers).
- `src/react/mutation-provider.tsx` — new bridge. Delegates writes to `instance.mutate`. No `mutatePetriNetDefinition` prop; everything is read from the instance.
- `src/react/net-management-context.ts` — new context for host-owned net actions / metadata. Single shape (`NetManagement`) so the SDCPN bridge can compose it with Core-derived values without splitting the consumer-facing context.
- `src/react/use-handle-history-as-undo-redo.ts` — extracted from `petrinaut-next.tsx`.
- `src/react/use-ephemeral-handle.ts` — adapter that turns prop-driven `{ petriNetId, petriNetDefinition, mutatePetriNetDefinition }` into a stable `PetrinautDocHandle`. The handle has no `history`; the legacy `<Petrinaut>` wraps `<PetrinautNext>` in `<UndoRedoContext value={undoRedo ?? null}>` so the prop-supplied `undoRedo` shows through.
- `src/react/mutation-provider.test.tsx` — moved from `src/state/`, ported to mount `PetrinautInstanceContext` over a stub instance whose `mutate` is the spied function. 14 tests covering not-readonly mutations, readonly enforcement, and cascading deletes.

`<PetrinautNext>` was rewritten to skip the legacy prop-shaped `<Petrinaut>` entirely: it creates the Core instance and renders `<PetrinautProvider>` + `<MonacoProvider>` + `<EditorView>` directly. Side-effect imports (fonts, `@xyflow/react/dist/style.css`, `index.css`) moved with it.

The legacy `<Petrinaut>` (`src/ui/petrinaut.tsx`) was briefly kept as a thin adapter — building an ephemeral handle from its props and wrapping `<PetrinautNext>` in `<UndoRedoContext>` — to preserve back-compat. **It has since been retired entirely** along with the supporting `src/react/use-ephemeral-handle.ts`. The only internal caller (`petrinaut-story-provider.tsx`) was migrated to `<PetrinautNext>` + `createJsonDocHandle` (one handle per net id, kept in a ref map so per-net history survives switching). The demo site (`apps/petrinaut-website`) was already on `<PetrinautNext>`. SDCPN domain types and `isSDCPNEqual` that the legacy file used to re-export (`Color`, `MinimalNetMetadata`, `MutateSDCPN`, `Place`, `SDCPN`, `Transition`, `ViewportAction`, …) are now re-exported explicitly from `main.ts`, so external consumers are unaffected.

The duplicated prop-driven providers in `src/state/` are gone:

- `src/state/sdcpn-provider.tsx` — **deleted**.
- `src/state/mutation-provider.tsx` — **deleted**.
- `src/state/mutation-provider.test.tsx` — **deleted** (replaced by the ported version under `src/react/`).
- `src/ui/petrinaut.tsx`, `src/react/use-ephemeral-handle.ts` — **deleted** (post-Phase 3b).

`<PetrinautProvider>`, `NetManagement`, and `NetManagementContext` are exported from the `/react` public surface.

Verified: `yarn lint:tsc` clean, `yarn lint:eslint` clean, 485 unit tests pass, library build succeeds.

**Post-retirement rename.** With the legacy editor gone, the "Next" suffix on the surviving entry was misleading — it implied an old-vs-new split that no longer exists. The component and its props were renamed `PetrinautNext → Petrinaut` and `PetrinautNextProps → PetrinautProps`, and the file `src/ui/petrinaut-next.tsx → src/ui/petrinaut.tsx`. All internal call sites (`/main.ts`, `/ui/index.ts`, story provider, stories, `usePetrinautInstance` error message, `useMutate` JSDoc) and the demo site (`apps/petrinaut-website/src/main/app.tsx`) were updated in the same change. Earlier sections of this document reference the old name historically; that's intentional — the chronology stays accurate.

### Phase 3b polish — host-controlled workers + StrictMode fix (done)

Two issues turned up while migrating the demo site to subpath imports:

- The demo (production-style consumer of `@hashintel/petrinaut`'s dist) couldn't load the simulation / LSP workers reliably. The `?worker&inline` blob URLs that ship in dist load in some host bundler setups but not others, so the package needs to let hosts plug in their own worker construction.
- React StrictMode's dev-only re-invocation of `useState` lazy initializers was creating two LSP clients per mount: one orphan (leaks a worker) and one live one whose `initialize` message had been queued on the orphan's transport. Result: no diagnostics and no error surfaced.

Both addressed:

- `<SimulationProvider>` and `<LanguageClientProvider>` now accept an optional `workerFactory` prop. When provided, it replaces the bundled `createSimulationWorker` / `createLanguageServerWorker` defaults. The prop is plumbed through `<PetrinautProvider>` (`simulationWorkerFactory`, `lspWorkerFactory`) and `<Petrinaut>` (`/ui`) so hosts can supply factories at the editor entry. Storybook's source-built path keeps using the defaults.
- `<LanguageClientProvider>` was rewritten to construct the `LanguageClient` inside a `useEffect` (with cleanup) rather than in `useState`'s lazy initializer. Each StrictMode cycle's client is now disposed individually; only the survivor receives `initialize`. Diagnostics flow correctly even with React's dev double-invocation.

Side fixes captured in the same change set:

- `vite.config.ts` adds `cssFileName: "main"` so the bundled CSS lands at `dist/main.css` (matching the `style` field), instead of vite's package-name default `dist/petrinaut.css`.
- `package.json` `exports` adds `./styles.css` (preferred) and `./dist/main.css` (back-compat for hash-frontend's existing import).
- `/ui` re-exports `ViewportAction`; `/react` re-exports `ErrorTrackerContext` + `ErrorTracker`. Both were previously only on the `main.ts` back-compat barrel; making them available on the per-layer surfaces is what unblocked the demo's switch to subpath imports.
- Diagnostic instrumentation: `[sim]` / `[sim:worker]` / `[sim:provider]` / `[playback]` / `[lsp]` console logs added at the worker boundary, the simulation handle, and the React provider edges. Useful for tracing init/start/pause flows in dev; safe to leave in for now (filterable in DevTools, no production impact beyond the existing ESLint `no-console` rule, which is suppressed at each call).

**Consumer migration.** `apps/petrinaut-website` is fully on subpath imports (`@hashintel/petrinaut/core` for the handle / domain types, `/react` for `ErrorTrackerContext`, `/ui` for `Petrinaut` + `ViewportAction`). `apps/hash-frontend` stayed on the `@hashintel/petrinaut` back-compat barrel because its `tsconfig.moduleResolution` doesn't support subpath imports — a tsconfig change there would cascade to the rest of the app. Its editor wrapper migrated from the legacy prop-shaped API to the handle-based one (creates a `PetrinautDocHandle` per loaded net, mirrors `handle.doc()` into a snapshot for the existing save/load logic).

`apps/petrinaut-website/src/main/app.tsx` (`DevApp`) gained a `"use no memo"` directive — same intentional ref-during-render pattern as `<PetrinautStoryProvider>`. The React Compiler was treating `setStoredSDCPNsRef.current = setStoredSDCPNs` as a critical error.

### Phase 2d — Playback timing model + provider rewire (done)

Mirrors 2a/2b/2c — pure timing model lives in `/core`; React provider drives ticks and coordinates simulation lifecycle.

New in `/core`:

- `src/core/playback/playback.ts` — `createPlayback(initial?)` returning a `Playback` handle:
  - `state: ReadableStore<{ playState, frameIndex, speed, mode }>`
  - actions: `play / pause / stop / setFrameIndex / setSpeed / setMode / resetTiming / dispose` (all `this: void`-typed)
  - `tick({ currentTime, dt, totalFrames, simulationDone })` — caller drives the loop. Returns `{ frameIndex, advanced, reachedEnd }`. Auto-pauses on reaching the end when `simulationDone` or `mode === "viewOnly"`.
- Pure helpers: `getPlayModeBackpressure(mode)`, `formatPlaybackSpeed(speed)`, the `PLAYBACK_SPEEDS` constant, and the `PlaybackState` / `PlayMode` / `PlaybackSpeed` enums — all moved out of `react/playback/context.ts`.
- `src/core/playback/index.ts` — barrel.
- `src/core/playback/playback.test.ts` — 18 unit tests covering speed/mode/state transitions, tick advancement, max-speed jump, auto-pause behaviour, no-op-when-not-Playing, dispose idempotency, resetTiming.

Phase 1 reorg of playback files:

- `src/playback/{provider.tsx, provider.test.tsx, context.ts, README.md}` → `src/react/playback/`
- `src/playback/` directory removed.

`<PlaybackProvider>` rewritten as a bridge:

- Holds the core `Playback` via `useState` lazy-init.
- `useStore(playback.state)` for snapshot subscription.
- Drives the `requestAnimationFrame` loop, calling `playback.tick(...)` with the current dt / totalFrames / simulationDone.
- Coordinates simulation lifecycle: `play()` initialises the sim if NotRun, runs it; `pause()` / `stop()` pause it; `setPlayMode()` runs/pauses appropriately; backpressure ack logic stays here.
- `currentFrame` (the actual frame data) is fetched in React from `getFrame(frameIndex)` — Core doesn't hold frame data.
- Republishes through the existing `PlaybackContext` shape so `/ui` consumers don't change.

The 11 external consumers (`views/SDCPN/**`, `views/Editor/**`, `petrinaut.tsx`) updated to the new `react/playback/` path. The `react/playback/context.ts` re-exports `PlaybackState`, `PlayMode`, `PlaybackSpeed`, `PLAYBACK_SPEEDS`, `formatPlaybackSpeed` from `core/playback` for back-compat.

### Phase 2c — LSP transport + LanguageClient (done)

Same shape as 2a/2b, applied to the language-server worker:

- `src/core/lsp/transport.ts` — `LspTransport` interface + `createWorkerLspTransport(createWorker)`. Async-factory friendly with message queueing.
- `src/core/lsp/language-client.ts` — `createLanguageClient(config)` returning a `LanguageClient` handle: `diagnostics: ReadableStore<{ byUri, total }>`, fire-and-forget notifications (`initialize`, `notifySDCPNChanged`, `notifyDocumentChanged`, scenario / metric session methods), promise-returning RPCs (`requestCompletion`, `requestHover`, `requestSignatureHelp`), `dispose()`.
- `src/core/lsp/index.ts` — barrel.

`LanguageClient` methods are typed with `this: void` so consumers can pass them as references without `unbound-method` complaints. Worth retrofitting onto `Petrinaut` and `Simulation` in a follow-up; see [06-react-bindings.md](./06-react-bindings.md) §6.3 "Note".

Phase 1 simulation pattern repeated for LSP:

- `src/lsp/lib/` → `src/core/lsp/lib/` (checker, language-service host, virtual-files, document-URIs, position-utils, ts-to-lsp, helper/)
- `src/lsp/worker/language-server.worker.ts` → `src/core/lsp/worker/`
- `src/lsp/worker/protocol.ts` → `src/core/lsp/worker/`
- `src/lsp/provider.tsx` → `src/react/lsp/` (rewritten to call `createLanguageClient`)
- `src/lsp/context.ts` → `src/react/lsp/`
- `src/lsp/worker/use-language-client.ts` — **deleted.** Replaced by `createLanguageClient`.
- `src/lsp/` directory removed.

The 17 external consumers (`monaco/*`, `views/Editor/**`, `petrinaut.tsx`) updated to the new paths via sed.

`<LanguageClientProvider>` rewritten to use `useState` lazy-init for the client (React Compiler rejects ref writes during render). It still owns:

- creating the worker via the existing `?worker&inline` import,
- calling `client.initialize(sdcpn)` on first mount,
- calling `client.notifySDCPNChanged(sdcpn)` on every subsequent SDCPN change,
- subscribing to diagnostics via `useStore(client.diagnostics)`,
- republishing through the existing `LanguageClientContext` shape so `/ui` and `monaco/` consumers don't change.

**Public exports — known issue.** The dts bundler (`rolldown-plugin-dts`) emits "Duplicated export" errors for `vscode-languageserver-types` symbols (`DocumentUri`, `Position`, …) whenever those types are reachable through more than one path in the dependency graph. Tracked upstream as [sxzz/rolldown-plugin-dts#209](https://github.com/sxzz/rolldown-plugin-dts/issues/209) — open since 2026-03-19, no fix shipped.

We removed `core/lsp/worker/protocol.ts`'s re-exports of upstream types (consumers now import directly from `vscode-languageserver-types`) — that's a clean-up regardless, but it is **not enough on its own** to fix the dts duplication, because the upstream types are still imported by both `core/lsp/language-client.ts` and `react/lsp/context.ts`, and both sit in `main.ts`'s dependency graph.

LSP exports therefore remain absent from `main.ts`. Phase 5's per-entry bundling resolves this naturally: when `/core` becomes its own bundle, the upstream types only show up once in its dts.

### Phase 2b — `<SimulationProvider>` swap (done)

`src/simulation/provider.tsx` rewritten to call `createSimulation` instead of `useSimulationWorker`. The provider keeps its existing public `SimulationContextValue` shape — `/ui` files (the simulation panel, scenarios UI, etc.) are unchanged. Internally:

- A `Simulation | null` is held in React state. Disposed on unmount, on `petriNetId` change, on `reset()`, and before each new `initialize()`.
- `status` and `frames.count` come from `useStore(simulation.status)` / `useStore(simulation.frames)` with stable empty-store fallbacks when no simulation is active.
- `error` / `errorItemId` are captured from `simulation.events` (the core handle no longer republishes the message via stores; it fires once on transition).
- The legacy `SimulationState` shape ("NotRun" | "Paused" | "Running" | "Complete" | "Error") is reconstructed from the new `CoreSimulationState` ("Initializing" | "Ready" | "Running" | "Paused" | "Complete" | "Error") + the presence of a handle.
- `getFrame` / `getAllFrames` / `getFramesInRange` read from `simulation.getFrame(i)` and the `frames.count` store. Promise-wrapped to preserve the existing async signature.

`useSimulationWorker` hook + its test file deleted (`src/simulation/worker/use-simulation-worker.{ts,test.ts}`). The hook's `WorkerStatus` type and the React glue around it are no longer needed — the engine talks to the main thread purely through the `Simulation` handle.

`create-simulation-worker.ts` is kept as the default `WorkerFactory` used by the provider; its `?worker&inline` import is the existing browser-side bundling path.

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
