# Petrinaut architecture

Generated from annotations in the source. Do not edit — change the `@layerRoot`/`@boundary`/`@invariant` annotations or the declaring README frontmatter instead.

## Packages

- `@hashintel/petrinaut-core` (`libs/@hashintel/petrinaut-core`) — Headless SDCPN engine: document model, HIR compiler, simulation runtimes, LSP. No React, no DOM.
- `@hashintel/petrinaut` (`libs/@hashintel/petrinaut`) — React editor built on the headless core: providers, canvas, panels, Monaco integration.

## Enforced rules

- `core` must not depend on `react` — the headless core is published without React and must stay usable from Node and workers
- `core` must not depend on `ui` — the headless core must not reach into editor components
- `core` must not depend on `petrinaut` — the core is the lower package of the pair and cannot depend on its consumer
- `react` must not depend on `ui` — state providers must not depend on the components that render them, so the React layer stays testable without mounting the editor

## Layers

### Headless core (`core`)

SDCPN document model, compiler, simulation runtimes and LSP, with no UI framework

- Package: `@hashintel/petrinaut-core`
- Declared in: `libs/@hashintel/petrinaut-core/src/index.ts`
- Size: 23 files, 4979 lines
- Public seams: `@hashintel/petrinaut-core`
- Boundary (`package`): everything re exported here is public API covered by semver [libs/@hashintel/petrinaut-core/src/index.ts:11]
- Invariant: No React, no DOM and no Monaco imports, so the core runs unchanged in Node and in workers [libs/@hashintel/petrinaut-core/src/index.ts:12]
- Depends on: `core.types` (15), `core.hir` (13), `core.simulation.engine` (8), `core.clipboard` (6), `core.file-format` (5), `core.simulation` (4), `core.layout` (3), `core.lsp` (3), `core.schemas` (3), `core.validation` (3), `core.actual-mode` (2), `core.handle` (2), `core.playback` (2), `core.store` (2), `core.examples` (1), `core.simulation.authoring` (1), `core.simulation.frames` (1)

### Actual mode (`core.actual-mode`)

Renders an execution supplied by an external source rather than by simulation

- Package: `@hashintel/petrinaut-core`
- Declared in: `libs/@hashintel/petrinaut-core/src/actual-mode/README.md`
- Size: 9 files, 748 lines
- Boundary (`network`): Execution events arrive from a host-supplied transport; this layer stays transport-neutral [libs/@hashintel/petrinaut-core/src/actual-mode/README.md:1]
- Invariant: Experimental — not a stable Petrinaut protocol, so no external consumer may depend on its shape [libs/@hashintel/petrinaut-core/src/actual-mode/README.md:1]
- Depends on: `core.types` (4), `core.simulation.engine` (2), `core.file-format` (1), `core.simulation` (1)

### Clipboard (`core.clipboard`)

Serialises a selection and pastes it back, resolving name collisions

- Package: `@hashintel/petrinaut-core`
- Declared in: `libs/@hashintel/petrinaut-core/src/clipboard/README.md`
- Size: 4 files, 353 lines
- Invariant: Pasted elements are renamed rather than overwriting an existing element of the same name [libs/@hashintel/petrinaut-core/src/clipboard/README.md:1]
- Depends on: `core.types` (3), `core` (2), `core.schemas` (1)

### Example models (`core.examples`)

Ready-made SDCPN documents shipped for onboarding and demos

- Package: `@hashintel/petrinaut-core`
- Declared in: `libs/@hashintel/petrinaut-core/src/examples/index.ts`
- Size: 7 files, 4608 lines
- Public seams: `@hashintel/petrinaut-core/examples`
- Depends on: `core.types` (6), `core` (3)

### File format (`core.file-format`)

Reads and writes the on-disk SDCPN document format, plus export converters

- Package: `@hashintel/petrinaut-core`
- Declared in: `libs/@hashintel/petrinaut-core/src/file-format/README.md`
- Size: 5 files, 576 lines
- Invariant: Parsing is the only entry point for untrusted document input, so it validates rather than trusting shape [libs/@hashintel/petrinaut-core/src/file-format/README.md:1]
- Depends on: `core.types` (4), `core.schemas` (3), `core` (2)

### Document handle (`core.handle`)

Stateful handle wrapping a document, emitting change events to subscribers

- Package: `@hashintel/petrinaut-core`
- Declared in: `libs/@hashintel/petrinaut-core/src/handle/index.ts`
- Size: 4 files, 318 lines
- Depends on: `core` (2), `core.store` (2), `core.types` (2)

### HIR compiler (`core.hir`)

Lowers user-authored TypeScript to a source-spanned IR, then typechecks, lints and emits it

- Package: `@hashintel/petrinaut-core`
- Declared in: `libs/@hashintel/petrinaut-core/src/hir/README.md`
- Size: 11 files, 6078 lines
- Public seams: `@hashintel/petrinaut-core/hir`, `@hashintel/petrinaut-core/hir-runtime`
- Boundary (`sandbox`): Emitted user code runs against a fixed buffer ABI, not against arbitrary host globals [libs/@hashintel/petrinaut-core/src/hir/README.md:1]
- Invariant: HIR nodes carry no inferred types inline; types live in a side table keyed by node id [libs/@hashintel/petrinaut-core/src/hir/README.md:1]
- Invariant: This pipeline is the only runtime path for dynamics, transition lambdas, kernels and expression metrics [libs/@hashintel/petrinaut-core/src/hir/README.md:1]
- Depends on: `core` (4), `core.types` (3), `core.simulation.authoring` (1), `core.simulation.engine` (1)
- Further reading: `libs/@hashintel/petrinaut-core/src/hir/BUFFER_ABI.md`

### Graph layout (`core.layout`)

Computes node positions for a net, so auto-layout does not require the canvas

- Package: `@hashintel/petrinaut-core`
- Declared in: `libs/@hashintel/petrinaut-core/src/layout/index.ts`
- Size: 3 files, 159 lines
- Depends on: `core` (1), `core.types` (1)

### LSP client (`core.lsp`)

Language-server client and transport for editing user code in the net

- Package: `@hashintel/petrinaut-core`
- Declared in: `libs/@hashintel/petrinaut-core/src/lsp/index.ts`
- Size: 13 files, 2260 lines
- Public seams: `@hashintel/petrinaut-core/workers/lsp`
- Boundary (`thread`): requests reach the language server over a worker transport, so every call is async [libs/@hashintel/petrinaut-core/src/lsp/index.ts:6]
- Depends on: `core` (11), `core.types` (5), `core.lsp.worker` (2), `core.simulation.engine` (1), `core.store` (1)

### LSP worker (`core.lsp.worker`)

Hosts the TypeScript language server off the main thread

- Package: `@hashintel/petrinaut-core`
- Declared in: `libs/@hashintel/petrinaut-core/src/lsp/worker/README.md`
- Size: 3 files, 664 lines
- Public seams: `@hashintel/petrinaut-core/workers/lsp`
- Boundary (`worker`): The language server runs in its own thread; the client reaches it only over the documented protocol [libs/@hashintel/petrinaut-core/src/lsp/worker/README.md:1]
- Depends on: `core.lsp` (7), `core` (6), `core.types` (2)

### Playback (`core.playback`)

Picks the viewed frame over time and defines the per-play-mode backpressure profiles

- Package: `@hashintel/petrinaut-core`
- Declared in: `libs/@hashintel/petrinaut-core/src/playback/index.ts`
- Size: 2 files, 287 lines
- Invariant: Pure state machine — it decides which frame should be shown but never fetches one [libs/@hashintel/petrinaut-core/src/playback/index.ts:5]
- Depends on: `core.store` (1)

### Schemas (`core.schemas`)

Zod schemas for document entities, metrics and scenarios, and the descriptions the AI tools read

- Package: `@hashintel/petrinaut-core`
- Declared in: `libs/@hashintel/petrinaut-core/src/schemas/README.md`
- Size: 3 files, 553 lines
- Invariant: Every entity schema ends in `satisfies z.ZodType<T>` against the canonical type, so a schema cannot drift from the type it validates [libs/@hashintel/petrinaut-core/src/schemas/README.md:1]
- Depends on: `core.validation` (5), `core.types` (3), `core` (1), `core.simulation.engine` (1)

### Simulation (`core.simulation`)

Executes SDCPN nets — stepping, frames, workers and batch statistics

- Package: `@hashintel/petrinaut-core`
- Declared in: `libs/@hashintel/petrinaut-core/src/simulation/README.md`
- Size: 3 files, 728 lines
- Public seams: `@hashintel/petrinaut-core`
- Invariant: No UI-framework dependency, so the runtime is usable from Node and from workers [libs/@hashintel/petrinaut-core/src/simulation/README.md:1]
- Depends on: `core` (10), `core.simulation.engine` (4), `core.simulation.frames` (3), `core.simulation.monte-carlo` (2), `core.simulation.runtime` (2), `core.types` (2), `core.store` (1)
- Further reading: `libs/@hashintel/petrinaut-core/src/simulation/ARCHITECTURE.md`

### User-code authoring (`core.simulation.authoring`)

Compiles and sandboxes the code users write inside a net

- Package: `@hashintel/petrinaut-core`
- Declared in: `libs/@hashintel/petrinaut-core/src/simulation/authoring/README.md`
- Size: 3 files, 576 lines
- Boundary (`sandbox`): User code is evaluated with restricted globals; it never receives the host scope [libs/@hashintel/petrinaut-core/src/simulation/authoring/README.md:1]
- Depends on: `core.simulation.engine` (2), `core` (1), `core.simulation` (1), `core.types` (1)

### Simulation engine (`core.simulation.engine`)

Builds an SDCPN definition into a runnable instance and computes frames

- Package: `@hashintel/petrinaut-core`
- Declared in: `libs/@hashintel/petrinaut-core/src/simulation/engine/README.md`
- Size: 20 files, 3720 lines
- Invariant: Owns the runtime stepping state and frame layout; user-code compilation is delegated to the authoring layer [libs/@hashintel/petrinaut-core/src/simulation/engine/README.md:1]
- Depends on: `core` (14), `core.types` (10), `core.simulation.frames` (9), `core.simulation` (2), `core.simulation.authoring` (2)

### Frames & metrics (`core.simulation.frames`)

The frame layout and the readers hosts use to inspect one frame

- Package: `@hashintel/petrinaut-core`
- Declared in: `libs/@hashintel/petrinaut-core/src/simulation/frames/README.md`
- Size: 4 files, 678 lines
- Invariant: Readers are views over an existing buffer, not copies, so reading a frame does not allocate per place or per transition [libs/@hashintel/petrinaut-core/src/simulation/frames/README.md:1]
- Depends on: `core.simulation.engine` (3), `core.types` (3), `core.simulation` (2), `core.hir` (1)

### Monte Carlo runtime (`core.simulation.monte-carlo`)

Runs many independent simulations with bounded frame memory, reporting metric aggregates

- Package: `@hashintel/petrinaut-core`
- Declared in: `libs/@hashintel/petrinaut-core/src/simulation/monte-carlo/README.md`
- Size: 21 files, 3048 lines
- Public seams: `@hashintel/petrinaut-core/workers/monte-carlo`
- Boundary (`worker`): Frame buffers stay inside the worker; only metric aggregates are posted to the host [libs/@hashintel/petrinaut-core/src/simulation/monte-carlo/README.md:1]
- Invariant: Frame memory is bounded regardless of run length — no frame history is retained [libs/@hashintel/petrinaut-core/src/simulation/monte-carlo/README.md:1]
- Invariant: Uses the same extension-aware SDCPN sanitization as the interactive simulator, so disabled surfaces are not compiled here either [libs/@hashintel/petrinaut-core/src/simulation/monte-carlo/README.md:1]
- Depends on: `core` (18), `core.simulation.engine` (14), `core.simulation` (6), `core.types` (5), `core.simulation.frames` (4), `core.simulation.runtime` (1), `core.store` (1)

### Simulation controller (`core.simulation.runtime`)

Host-side controller for a run — owns the transport, the frame store and the status streams

- Package: `@hashintel/petrinaut-core`
- Declared in: `libs/@hashintel/petrinaut-core/src/simulation/runtime/README.md`
- Size: 3 files, 388 lines
- Public seams: `@hashintel/petrinaut-core`
- Boundary (`thread`): Talks to the worker only through the transport; it holds no reference to engine state [libs/@hashintel/petrinaut-core/src/simulation/runtime/README.md:1]
- Depends on: `core` (4), `core.simulation` (3), `core.simulation.worker` (3), `core.simulation.engine` (1), `core.simulation.frames` (1), `core.store` (1), `core.types` (1)

### Simulation worker (`core.simulation.worker`)

Computes simulation frames off the main thread under host backpressure

- Package: `@hashintel/petrinaut-core`
- Declared in: `libs/@hashintel/petrinaut-core/src/simulation/worker/README.md`
- Size: 4 files, 465 lines
- Public seams: `@hashintel/petrinaut-core/workers/simulation`
- Boundary (`worker`): Host and worker communicate only by the documented message protocol [libs/@hashintel/petrinaut-core/src/simulation/worker/README.md:1]
- Invariant: Frames are computed in batches gated by host backpressure, so a fast worker cannot outrun its consumer [libs/@hashintel/petrinaut-core/src/simulation/worker/README.md:1]
- Depends on: `core` (5), `core.simulation.engine` (3), `core.simulation` (1), `core.simulation.frames` (1), `core.types` (1)

### Readable store (`core.store`)

Minimal subscribable store primitive the core exposes instead of a framework dependency

- Package: `@hashintel/petrinaut-core`
- Declared in: `libs/@hashintel/petrinaut-core/src/store/index.ts`
- Size: 2 files, 43 lines
- Invariant: Framework-agnostic — consumers adapt it (for example via `useStore`) rather than the core importing React [libs/@hashintel/petrinaut-core/src/store/index.ts:5]

### Document types (`core.types`)

The canonical TypeScript types describing an SDCPN document

- Package: `@hashintel/petrinaut-core`
- Declared in: `libs/@hashintel/petrinaut-core/src/types/README.md`
- Size: 2 files, 250 lines
- Invariant: Authoritative over the Zod schemas — schemas are checked against these types, never the reverse [libs/@hashintel/petrinaut-core/src/types/README.md:1]
- Depends on: `core` (1)

### Validation (`core.validation`)

Structural integrity validators for SDCPN entities, enforcing naming conventions

- Package: `@hashintel/petrinaut-core`
- Declared in: `libs/@hashintel/petrinaut-core/src/validation/README.md`
- Size: 3 files, 130 lines
- Invariant: Pure-function wrappers over Zod schemas, so validators are callable from any layer without side effects [libs/@hashintel/petrinaut-core/src/validation/README.md:1]

### Worker entry points (`core.workers`)

The module entry points hosts instantiate as Web Workers

- Package: `@hashintel/petrinaut-core`
- Declared in: `libs/@hashintel/petrinaut-core/src/workers/README.md`
- Size: 3 files, 41 lines
- Public seams: `@hashintel/petrinaut-core/workers/lsp`, `@hashintel/petrinaut-core/workers/monte-carlo`, `@hashintel/petrinaut-core/workers/simulation`
- Boundary (`worker`): Each file here is the top of a separate thread; only structured-cloneable messages cross [libs/@hashintel/petrinaut-core/src/workers/README.md:1]
- Depends on: `core.lsp.worker` (2), `core.simulation.monte-carlo` (2), `core.simulation.worker` (2)

### Package surface (`petrinaut`)

The host-facing entry point: the contexts and types an embedder wires up

- Package: `@hashintel/petrinaut`
- Declared in: `libs/@hashintel/petrinaut/src/main.ts`
- Size: 2 files, 179 lines
- Public seams: `@hashintel/petrinaut`
- Boundary (`package`): everything re exported here is public API covered by semver [libs/@hashintel/petrinaut/src/main.ts:13]
- Depends on: `ui` (5), `react` (4), `core` (1)

### React bindings (`react`)

Contexts, hooks and providers that mirror core state into React

- Package: `@hashintel/petrinaut`
- Declared in: `libs/@hashintel/petrinaut/src/react/index.ts`
- Size: 17 files, 1485 lines
- Public seams: `@hashintel/petrinaut/react`
- Invariant: No imports from `ui/` — this layer must be mountable without rendering the editor, which is what makes the providers testable in isolation [libs/@hashintel/petrinaut/src/react/index.ts:11]
- Depends on: `core` (13), `react.state` (6), `react.experiments` (3), `react.hooks` (2), `react.execution-frame` (1), `react.lsp` (1), `react.playback` (1), `react.simulation` (1)

### Execution frame source (`react.execution-frame`)

Abstracts where frames come from, so canvas and timeline work for live runs and recordings alike

- Package: `@hashintel/petrinaut`
- Declared in: `libs/@hashintel/petrinaut/src/react/execution-frame/README.md`
- Size: 2 files, 216 lines
- Invariant: Consumers depend only on this interface, never on whether the frames are live or replayed [libs/@hashintel/petrinaut/src/react/execution-frame/README.md:1]
- Depends on: `core` (3), `react.state` (2), `react` (1), `react.playback` (1), `react.simulation` (1)

### Experiments provider (`react.experiments`)

Tracks Monte Carlo experiment handles and their streamed metric results

- Package: `@hashintel/petrinaut`
- Declared in: `libs/@hashintel/petrinaut/src/react/experiments/README.md`
- Size: 2 files, 535 lines
- Boundary (`worker`): Only metric aggregates arrive from the experiment worker; frame buffers never reach this layer [libs/@hashintel/petrinaut/src/react/experiments/README.md:1]
- Depends on: `react.hooks` (3), `core` (2), `core.workers` (1), `react` (1), `react.lsp` (1), `react.state` (1)

### Shared hooks (`react.hooks`)

Cross-cutting hooks over the providers — documents, parameters, window lifecycle

- Package: `@hashintel/petrinaut`
- Declared in: `libs/@hashintel/petrinaut/src/react/hooks/index.ts`
- Size: 12 files, 723 lines
- Invariant: Each hook reads from an existing context; none creates state of its own, so hook order never affects ownership [libs/@hashintel/petrinaut/src/react/hooks/index.ts:5]
- Depends on: `react.state` (10), `core` (8), `react` (6), `react.lsp` (1), `react.playback` (1), `react.simulation` (1)

### LSP provider (`react.lsp`)

Exposes the core language client to the editor as React context

- Package: `@hashintel/petrinaut`
- Declared in: `libs/@hashintel/petrinaut/src/react/lsp/README.md`
- Size: 2 files, 200 lines
- Boundary (`thread`): Every completion, hover and diagnostic is an async round trip to the language-server worker [libs/@hashintel/petrinaut/src/react/lsp/README.md:1]
- Depends on: `core` (2), `core.workers` (2), `react` (2), `react.state` (1)

### Playback provider (`react.playback`)

Drives the viewed frame with a requestAnimationFrame loop and applies the per-mode ack policy

- Package: `@hashintel/petrinaut`
- Declared in: `libs/@hashintel/petrinaut/src/react/playback/README.md`
- Size: 2 files, 440 lines
- Invariant: Owns the ack/backpressure decision for the whole app — view-only never acks, so nothing is computed while merely scrubbing [libs/@hashintel/petrinaut/src/react/playback/README.md:1]
- Depends on: `core` (2), `react.hooks` (2), `react.simulation` (2), `react` (1)

### Simulation provider (`react.simulation`)

Owns the run configuration and mirrors the core simulation handle into React

- Package: `@hashintel/petrinaut`
- Declared in: `libs/@hashintel/petrinaut/src/react/simulation/README.md`
- Size: 3 files, 934 lines
- Boundary (`thread`): Wraps the core's worker transport; every frame the UI reads has crossed a thread boundary [libs/@hashintel/petrinaut/src/react/simulation/README.md:1]
- Invariant: The initial marking is session state, configuration for the next run, and survives a reset [libs/@hashintel/petrinaut/src/react/simulation/README.md:1]
- Depends on: `core` (3), `react.hooks` (3), `react` (2), `core.workers` (1), `react.lsp` (1), `react.state` (1)

### Editor state (`react.state`)

Contexts owning editor-session state — active net, selection, settings, undo/redo, read-only mode

- Package: `@hashintel/petrinaut`
- Declared in: `libs/@hashintel/petrinaut/src/react/state/README.md`
- Size: 15 files, 1212 lines
- Invariant: Read-only mode is derived here and consumed everywhere, so no component decides for itself whether editing is allowed [libs/@hashintel/petrinaut/src/react/state/README.md:1]
- Depends on: `core` (7), `react` (1), `react.simulation` (1)

### Editor UI (`ui`)

The visual editor: canvas, panels, dialogs and the Monaco integration

- Package: `@hashintel/petrinaut`
- Declared in: `libs/@hashintel/petrinaut/src/ui/index.ts`
- Size: 49 files, 5764 lines
- Public seams: `@hashintel/petrinaut/ui`
- Invariant: Consumes the React layer's contexts rather than reaching into the core directly, so state ownership stays in one place [libs/@hashintel/petrinaut/src/ui/index.ts:12]
- Depends on: `core` (16), `ui.views.editor` (14), `react` (3), `ui.monaco` (3), `react.state` (2), `react.hooks` (1), `ui.views.canvas` (1)

### Monaco integration (`ui.monaco`)

Wires the Monaco editor to the language server for authoring user code

- Package: `@hashintel/petrinaut`
- Declared in: `libs/@hashintel/petrinaut/src/ui/monaco/README.md`
- Size: 8 files, 711 lines
- Boundary (`thread`): Each sync component bridges a Monaco provider to an async worker request [libs/@hashintel/petrinaut/src/ui/monaco/README.md:1]
- Depends on: `core` (5), `react.lsp` (4), `ui` (1)

### Views (`ui.views`)

The top-level screens the editor composes — the editor shell and the net canvas

- Package: `@hashintel/petrinaut`
- Declared in: `libs/@hashintel/petrinaut/src/ui/views/README.md`
- Size: 1 files, 103 lines
- Depends on: `core` (2), `react.execution-frame` (1), `react.hooks` (1), `react.simulation` (1), `ui` (1), `ui.views.editor` (1)

### Canvas (`ui.views.canvas`)

Renders the net as an interactive graph, with node and arc interaction

- Package: `@hashintel/petrinaut`
- Declared in: `libs/@hashintel/petrinaut/src/ui/views/SDCPN/README.md`
- Size: 22 files, 3270 lines
- Invariant: Reads frame state through the execution-frame interface, so the same canvas renders live runs and recordings [libs/@hashintel/petrinaut/src/ui/views/SDCPN/README.md:1]
- Depends on: `react.state` (27), `ui` (13), `core` (5), `react.execution-frame` (3), `react.simulation` (3), `react.hooks` (2), `react` (1), `ui.views` (1)

### Editor shell (`ui.views.editor`)

Arranges the panels, toolbars and dialogs around the canvas

- Package: `@hashintel/petrinaut`
- Declared in: `libs/@hashintel/petrinaut/src/ui/views/Editor/README.md`
- Size: 120 files, 23586 lines
- Depends on: `ui` (140), `react.state` (107), `core` (68), `react` (32), `ui.monaco` (16), `react.lsp` (14), `react.hooks` (9), `react.experiments` (8), `react.simulation` (8), `react.execution-frame` (4), `react.playback` (4), `core.examples` (2), `ui.views.canvas` (2), `ui.views` (1)

