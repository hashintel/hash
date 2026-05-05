# RFC 0001 — Petrinaut: Core / React / UI Split

**Status:** Draft (iterating) — Phase 0 + 2a/2b/2c/2d + 3a + 3b + 4 + 5 landed; post-3b polish (legacy retirement + rename, layer-direction lint, host-controlled workers) landed; Phase 1 layout sweep complete (every top-level dir now lives under `/core/`, `/react/`, or `/ui/` apart from the intentional `/examples/`)
**Authors:** @cf
**Created:** 2026-04-28
**Last updated:** 2026-05-05
**Tracking issue:** FE-628

---

## Summary

Restructure `@hashintel/petrinaut` into three import paths:

- **`@hashintel/petrinaut/core`** — stateful, headless instance. No React, no DOM, no Monaco. Inputs and outputs flow through streams.
- **`@hashintel/petrinaut/react`** — React bindings: hooks, contexts, and bridge providers that synchronize a Core instance with React. No visual widgets.
- **`@hashintel/petrinaut/ui`** — the opinionated visual editor: `<Petrinaut>`, all views, panels, and components. Built on top of `/react`.

Layer dependency direction: **`ui` → `react` → `core`**, never the reverse, and `/ui` should not reach into `/core` directly — always through `/react` hooks.

## Why

- Enable non-React consumers (CLI tools, headless automation, server-side simulation).
- Let advanced consumers build alternative UIs against `/react` without forking the editor.
- Keep the polished editor available out of the box via `/ui`.
- Make the boundary between *what the system does* and *how it is rendered* explicit.

## Reading order

| # | File | Purpose |
| - | ---- | ------- |
| 01 | [01-motivation.md](./01-motivation.md) | Goals + non-goals |
| 02 | [02-current-state.md](./02-current-state.md) | The provider stack today and the SDCPN ownership model |
| 03 | [03-layering.md](./03-layering.md) | What goes in `core` / `react` / `ui` |
| 04 | [04-core-instance.md](./04-core-instance.md) | `createPetrinaut()` surface, streams, instantiation |
| 05 | [05-simulation.md](./05-simulation.md) | Simulation patterns (locked) |
| 06 | [06-react-bindings.md](./06-react-bindings.md) | `<PetrinautProvider>` + hooks; how `/ui` consumes them |
| 07 | [07-open-questions.md](./07-open-questions.md) | The hot file while the RFC is in flight |
| 08 | [08-migration.md](./08-migration.md) | Phased migration plan |
| 09 | [09-risks.md](./09-risks.md) | Risks and likely surprises |
| 10 | [10-public-api.md](./10-public-api.md) | Final import surface summary |
| 11 | [11-headless-usage.md](./11-headless-usage.md) | Using Petrinaut without any UI — handle setup, simulation, type-checking, subscriptions |

## Decisions locked so far

- Three entry points: `core`, `react`, `ui` (not two; not `hooks`).
- Single package with an `exports` map, not three separate packages.
- Simulation worker lives in `/core`; bundling via caller-provided `createWorker` factory + `./core/simulation.worker` sub-entry. See [05-simulation.md](./05-simulation.md).
- Stream primitive: `ReadableStore<T>` (`get` + value-passing `subscribe`) for state, `EventStream<T>` for one-shot events. React adapts via a `useStore` helper. See [04-core-instance.md](./04-core-instance.md) §4.2.
- Document never owned by Core — Core takes a `PetrinautDocHandle` (adapts plain JSON, Immer, Automerge, …). `createJsonDocHandle` shipped for the common case. See [04-core-instance.md](./04-core-instance.md) §4.1.
- Patches: Petrinaut-defined minimal `PetrinautPatch` type (Immer-shaped: array path, `op: add | remove | replace`). Adds `immer` (~14 KB) as a `/core` dep. Patches are in-memory only, never persisted. See [04-core-instance.md](./04-core-instance.md) §4.1.
- Undo/redo lives on the handle as an optional `history` field. `createJsonDocHandle` ships a default Immer-based implementation; the host's `UndoRedoContextValue` pass-through goes away. Coalescing of typing-bursts is a deferred follow-up. See [04-core-instance.md](./04-core-instance.md) §4.1 "History (locked)".
- Phase 0 spike landed: `createJsonDocHandle` (with history), `createPetrinaut`, `useStore`, `<PetrinautNext>`, two Storybook stories, 15 smoke tests. Demo site (`apps/petrinaut-website`) migrated to the handle-driven path; per-net history preserved across switches. See [08-migration.md](./08-migration.md) Phase 0.
- Phase 2a landed: `SimulationTransport` interface, `createWorkerTransport(createWorker)`, **`createSimulation(config)`** standalone factory returning a `Simulation` handle (status / frames / events stores, run/pause/reset/ack/setBackpressure/getFrame/dispose actions). Simulation is **decoupled** from the `Petrinaut` instance — it operates on a frozen SDCPN snapshot and the host owns its lifecycle. See [05-simulation.md](./05-simulation.md) §5.1, §5.8.
- Phase 2b landed: `<SimulationProvider>` swapped to call `createSimulation` directly. Old `useSimulationWorker` hook deleted. The legacy `SimulationContextValue` shape is preserved so `/ui` files don't change. See [08-migration.md](./08-migration.md) "Phase 2b".
- Phase 2c landed: `LspTransport` interface, `createWorkerLspTransport(createWorker)`, **`createLanguageClient(config)`** standalone factory returning a `LanguageClient` handle (diagnostics store, fire-and-forget notifications, promise-returning RPCs, `dispose`). `<LanguageClientProvider>` swapped to use it; old `useLanguageClient` hook deleted. `LanguageClient` methods carry `this: void` — same retrofit recommended for `Petrinaut` and `Simulation`. LSP files moved into `core/lsp/` + `react/lsp/`. See [08-migration.md](./08-migration.md) "Phase 2c".
- Phase 2d landed: pure playback timing model in `/core` — **`createPlayback(initial?)`** returning a `Playback` handle (state store + caller-driven `tick(currentTime, dt, totalFrames, simulationDone)`). Auto-pauses on reaching end when `simulationDone` or `mode === "viewOnly"`. `<PlaybackProvider>` rewritten as a thin bridge driving rAF + simulation coordination. Playback files moved into `core/playback/` + `react/playback/`. 18 new unit tests. See [08-migration.md](./08-migration.md) "Phase 2d".
- Phase 3a landed: public hook surface in `src/react/hooks/` — `usePetrinautDefinition`, `useMutate`, `useDocumentState`, `useSimulationStatus`, `usePlaybackState`, `useDiagnostics`, `useLspActions`, etc. (~25 hooks across `use-document.ts`, `use-simulation.ts`, `use-playback.ts`, `use-lsp.ts`). `this: void` retrofit applied to `Petrinaut` and `Simulation` for clean method-reference passing. See [08-migration.md](./08-migration.md) "Phase 3a".
- Phase 3b landed: `<PetrinautProvider instance netManagement>` in `/react` mounts every bridge over a Core instance. New bridges: `react/sdcpn-provider.tsx`, `react/mutation-provider.tsx`. `NetManagementContext` (new) holds host-owned title/switching actions. `useHandleHistoryAsUndoRedo` extracted from `<PetrinautNext>`. `<PetrinautNext>` rewritten to use `<PetrinautProvider>` directly, skipping the legacy prop-shaped `<Petrinaut>`. Legacy `<Petrinaut>` is now a thin adapter on top of `<PetrinautNext>` (ephemeral handle synthesised from props, `undoRedo` prop wrapped as outer `UndoRedoContext`); the duplicated `state/sdcpn-provider.tsx` + `state/mutation-provider.tsx` are deleted. See [08-migration.md](./08-migration.md) "Phase 3b".
- Post-3b polish landed (compounding the work above into a single coherent shape):
  - **Legacy `<Petrinaut>` adapter retired** along with `useEphemeralHandle`. `<PetrinautNext>` was renamed to `<Petrinaut>` (file `petrinaut-next.tsx → petrinaut.tsx`) and is now the sole editor entry. SDCPN domain types and `isSDCPNEqual` re-exported explicitly from `main.ts` so external consumers are unaffected.
  - **Layer-direction lint rule** in `.oxlintrc.json`: `/core/**` may not import from `/react` or `/ui`; `/react/**` may not import from `/ui`. Probed with deliberate violations to confirm both directions trigger.
  - **`MutationContext.layoutGraph` and `pasteEntities` removed** — both were `/react→/ui` leaks (one needed visual node dimensions, the other called `pasteFromClipboard`). Composing the right primitives in `/ui` (`runAutoLayout` for the layout button; inline `pasteFromClipboard(instance.mutate)` in the keyboard-shortcuts handler) keeps `/react` clean.
  - **Host-controlled workers**: `simulationWorkerFactory` + `lspWorkerFactory` props on `<Petrinaut>` (plumbed through `<PetrinautProvider>` to the bridges). Hosts can replace the bundled inlined-blob defaults when their bundler can't handle them. `<LanguageClientProvider>` now creates the `LanguageClient` in a `useEffect` rather than `useState`'s lazy initializer — fixes a StrictMode dev-time leak where two LSP clients were created and `initialize` went to the orphaned one. See [08-migration.md](./08-migration.md) "Phase 3b polish" + [06-react-bindings.md](./06-react-bindings.md) §6.4.1.
  - **CSS exports**: `vite.config.ts` `cssFileName: "main"` so the bundle lands at `dist/main.css`; `package.json` `exports` exposes `./styles.css` and `./dist/main.css`.
  - **`/validation` export surface trimmed** (schemas + result-type aliases unexported per knip).
  - **Consumer migration**: `apps/petrinaut-website` fully on subpath imports (`/core`, `/react`, `/ui`); `apps/hash-frontend` stays on the back-compat barrel (older `moduleResolution`) but its editor wrapper migrated from the legacy prop-shape to the handle-based API.

- **Phase 1 layout sweep** landed across a series of `git mv` commits. Every top-level dir except `/core/`, `/react/`, `/ui/`, and `/examples/` is gone:
  - `src/state/` → `src/react/state/` (+ pure pieces extracted to `/core`: `arc-id.ts`, `types/selection.ts`, `lib/get-connections.ts`).
  - `src/lib/` split — pure (`deep-equal`) into `/core/lib/`; UI-bound (`calculate-graph-layout`, `hsl-color`, `snap-position-to-grid`, `split-pascal-case`, `viewport`) into `/ui/lib/`.
  - `src/file-format/` split — pure conversion (`serialize-sdcpn`, `parse-sdcpn-file`, `sdcpn-to-tikz`, `types`, `remove-visual-info`) into `/core/file-format/`; browser-bound import/export wrappers into `/ui/file-io/` (deliberately renamed — the `/ui` side does file I/O, not format definition). New `/ui/lib/download-blob.ts` exposes a generic `downloadBlob` + `timestampedFilename` so future format exporters don't duplicate the DOM plumbing.
  - `src/clipboard/` split — pure (`serialize`, `paste`, `deduplicate-name`, `types`) into `/core/clipboard/`; the `navigator.clipboard.readText/writeText` wrappers into `/ui/clipboard/`.
  - `src/hooks/` → `src/react/hooks/` — folds the 4 utility hooks (`use-default-parameter-values`, `use-element-size`, `use-latest`, `use-stable-callback`) next to the public hook surface from Phase 3a.
  - `src/validation/` → `src/core/validation/` — pure zod-based validators.
  - `src/types/viewport-action.ts` → `src/ui/types/viewport-action.ts` — UI-shaped type carrying `React.ReactNode`.
  - `src/examples/` stays at root (decision: 2026-05-05 — will become its own `@hashintel/petrinaut/examples` subpath export with per-example demo-site routes; revisit when that flow lands).
  - `src/error-tracker/error-tracker.context.ts` → `src/react/error-tracker-context.ts` — `ErrorTracker` is a React context (host plugs Sentry / Datadog in via the provider), so `/react` is the layer-correct home. Considered placing it in `/core` so the simulation worker / handle could call it directly, but rejected: `/core` already has typed error channels (`simulation.events`, `lsp.diagnostics`, `handle.state`) for everything observable, and a generic capture callback would duplicate them. The wiring-fix (actually using it from worker error paths and React error boundaries) is folded into FE-694.

## What this RFC does *not* cover

- Collaborative editing (Automerge / Yjs) wire-up — only the document-ownership decision that affects it.
- Worker pool strategies (one worker per instance vs shared pool).
- Public docs / migration guide for external consumers — to be written once the RFC is accepted.

## Iteration protocol

While this RFC is in flight, most edits land in [07-open-questions.md](./07-open-questions.md). Once a question is resolved, its conclusion migrates into the relevant chapter, and the question is struck through with a pointer to where the decision now lives.
