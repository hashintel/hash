## Problem Statement

Petrinaut currently gives development tooling too little isolation between the editor shell and optional heavy subsystems. Mounting the editor reaches the language worker, Monaco setup, simulation worker, full panel registry, layout engine, charting code, examples, font CSS, and package CSS in one broad graph. CSS and small UI changes can therefore cause bundlers and transforms to revisit code that is unrelated to the edited feature.

The attached analysis is broadly correct. The highest-confidence findings are the inline worker imports, broad React Compiler/Babel transform, static layout and visualizer compiler imports, eager provider initialization, static timeline chart registration, incomplete peer subpath externalization, missing explicit package exports, HASH frontend transpilation of Petrinaut, and broad Panda scanning. The main adjustment is sequencing: keep the current Vite/Rolldown build initially, fix graph topology first, and treat a `tsdown` migration as a later spike with separate acceptance criteria.

## Solution

Make Petrinaut cheaper to import and cheaper to rebuild by adding measurement first, then carving stable boundaries around workers, package metadata, heavy feature code, runtime initialization, and CSS generation.

The target state is:

- Worker internals are emitted as separate assets or chunks, not as huge inline worker string modules.
- React Compiler/Babel does not process worker modules or other non-React code unnecessarily.
- Heavy optional dependencies enter the graph only when their feature is used.
- Mounting Petrinaut does not immediately initialize Monaco, the language server worker, or the simulation worker.
- Package metadata and externalization express an intentional reusable-library boundary.
- HASH frontend can be tested against precompiled Petrinaut instead of transpiling it as app source.
- CSS and Panda scanning are narrowed enough that style edits do not wake unrelated editor internals.

## Commits

Status legend: `[x]` landed, `[ ]` pending.

1. [x] Add a bundle graph characterization report that records emitted imports, worker artifact shape, main asset sizes, CSS size, and the presence of known heavy packages without introducing failing thresholds. Landed in `47a4e37a6d`.
2. [x] Add provider lifecycle characterization coverage for the public behavior of language services, Monaco-backed editors, and simulation controls so later lazy-initialization changes can preserve user-visible behavior. Landed in `c253325572`.
3. [x] Encode an explicit package-boundary policy with exports for the main module and stylesheet, complete dependency declarations for emitted bare imports, and subpath-aware externalization for peer packages. Landed in `2b91696058`.
4. [x] Stop inlining Petrinaut's application workers while preserving their existing message protocols and consumer URL compatibility. Landed in `28950117a3`.
5. [x] Narrow the React Compiler/Babel transform so worker modules and obvious non-React modules are outside the transform surface. Landed in `7542b42d89`.
6. [x] Lazy-load graph layout at the import and manual-layout call sites while keeping the same layout result and read-only behavior. Landed in `4215c86eaf`.
7. [x] Lazy-load visualizer compilation so the Babel standalone dependency is pulled only when previewing visualizer code. Landed in `b550252c97`.
8. [x] Refactor the bottom-panel registry so the timeline chart is loaded only when the simulation timeline tab is active. Landed in `40204300fa`.
9. [x] Defer simulation worker creation until the first simulation initialization while keeping reset, teardown, error, and backpressure behavior intact. Landed in `ea1faf95d5`.
10. [x] Defer language worker creation until diagnostics or editor language features are actually requested while preserving queued document updates and diagnostics publication. Landed in `4d13fdec9f`.
11. [x] Defer Monaco initialization until the first code editor renders, with the sync helpers subscribing only after Monaco and language services are available. Landed in `5ed3f914e2`.
12. Move examples behind a lazy menu boundary so the editor shell does not statically import every example net.
13. Reduce library CSS coupling by removing full font package imports from the component entry or moving them behind an explicit opt-in style contract.
14. Split library and Storybook Panda scanning, and remove source-runtime constants from Panda config evaluation.
15. Test HASH frontend without transpiling Petrinaut and either remove Petrinaut from transpilation or document the remaining blockers with the bundle report.
16. Turn the bundle graph characterization report into a regression guard with agreed thresholds once the new topology has landed.

## Progress Notes

Current branch: `ln/petrinaut-imports`.

Latest verified slice: Monaco lazy initialization (`5ed3f914e2`).

Verification used for landed implementation slices:

- `yarn workspace @hashintel/petrinaut lint:eslint`
- `yarn workspace @hashintel/petrinaut lint:tsc`
- `yarn workspace @hashintel/petrinaut test:unit run`
- `yarn workspace @hashintel/petrinaut build`

Latest full Petrinaut verification passed with 35 Vitest files and 483 tests.

Current build signals after item 11:

- `main.js`: approximately `638.8 KiB`, `165.1 KiB gzip`.
- CSS: approximately `1.47 MiB`, `685 KiB gzip`; font/CSS work remains pending.
- Worker internals emit as separate `dist/assets/*worker*.js` files with tiny URL wrapper modules.
- `calculate-graph-layout`, `compile-visualizer`, and `simulation-timeline` now emit as lazy chunks.
- The simulation worker is not created when the worker hook mounts; it is created on first simulation initialization.
- The language worker is not created by provider mount or structural initialization; diagnostics/document sync and language feature requests activate it and drain queued messages.
- Monaco is not initialized when `MonacoProvider` mounts; the first rendered `CodeEditor` asks for Monaco, and sync helpers subscribe after that promise exists.
- Babel deoptimization warnings for inline worker modules are gone.

Observed improvement from the original characterization baseline:

- Baseline `main.js`: approximately `1.4 MiB`, `313 KiB gzip`.
- Current `main.js`: approximately `638.8 KiB`, `165.1 KiB gzip`.
- Baseline build time: `6.46s`; latest observed build: `5.02s`.

Next slice: item 12, move examples behind a lazy menu boundary.

## Decision Document

- Modules built or modified: Petrinaut package build configuration, package metadata, worker factories, language service provider, Monaco provider, simulation worker hook, editor shell, mutation provider, bottom-panel subview registry, visualizer preview, example loading, CSS/font entrypoints, Panda configuration, HASH frontend package consumption.
- Interface changes: add explicit package exports for the main entry and stylesheet; keep the current React component API stable; keep worker message protocols stable; keep editor mutation, simulation, playback, diagnostics, and code-editor context APIs source-compatible unless a later scoped commit proves a smaller API is needed.
- Architectural decisions: prioritize topology fixes over a bundler replacement; treat externalization and lazy-loading as separate concerns; bundle worker internals if necessary but keep them outside the main-thread module graph; prefer feature-level lazy boundaries over a broad editor rewrite; use measurement before thresholds.
- Schema changes, API contracts: no SDCPN schema changes; no persisted user setting changes planned; no public Petrinaut prop changes planned; package import contract gains an explicit stylesheet export.

## Testing Decisions

- Good tests here should verify behavior and build artifacts, not implementation details. For example, user-facing simulation controls still initialize, run, pause, reset, and report errors; code editors still provide diagnostics/completion/hover/signature help; graph layout still produces positions for imports and manual layout; visualizer previews still compile valid code and show errors for invalid code.
- Existing coverage is useful for simulation internals, playback behavior, mutation behavior, validation, import/export, LSP helpers, and the simulation worker hook. Some current worker-hook tests assert eager worker creation and should be rewritten around observable behavior when the lazy boundary lands.
- Coverage gaps to close before risky changes: language client provider lifecycle, Monaco provider lazy initialization, emitted bundle import auditing, worker asset shape, package export consumption, and HASH frontend consumption of prebuilt Petrinaut.
- Verification stack for each implementation commit: Petrinaut eslint, Petrinaut type check, Petrinaut unit tests, Petrinaut build, then HASH frontend build or targeted Next compilation checks when package exports, worker URLs, CSS imports, or transpilation settings change.
- Bundle verification should inspect emitted assets for inline worker wrappers, top-level imports of known heavy dependencies, undeclared bare imports, CSS size, and worker asset sizes.

## Out of Scope

- Replacing Vite/Rolldown with `tsdown` in this refactor.
- Rewriting the editor shell, state model, or SDCPN schema.
- Changing user-visible editor workflows beyond loading delays for optional systems.
- Replacing React Flow, Monaco, Babel standalone, TypeScript LSP, or uPlot with different libraries.
- A broad icon-system migration.
- Full performance-budget enforcement before the graph has been reshaped and measured.
