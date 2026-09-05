# @hashintel/petrinaut

## 0.0.20

### Patch Changes

- Arc weight labels sit on the Adaptive Bezier curve instead of floating at the straight-line midpoint between the arc's endpoints. ([@kube](https://github.com/kube), [#9354](https://github.com/hashintel/hash/pull/9354))

- The create-experiment drawer accepts an ad-hoc scenario when "No scenario" is selected: Initial State + Parameters defined inline compile through a generated, never-persisted scenario at experiment start. ([@kube](https://github.com/kube), [#9288](https://github.com/hashintel/hash/pull/9288))

- Fix three defects in the ad-hoc scenario form: the optimize bounds popover
  ignored every press (Min, Max, Step and Scale were uneditable, and each press
  dismissed it), a focused section painted over the sticky header of the section
  hosting it, and the experiment drawer's computed initial state grew unbounded
  instead of scrolling in its own region. ([@kube](https://github.com/kube), [#9473](https://github.com/hashintel/hash/pull/9473))

- The create-optimization drawer offers "Ad-hoc (define inline)": Initial State + Parameters with Optimize selections compile to a generated, never-persisted scenario whose generated parameters the optimization manifest binds to their optimize domains. ([@kube](https://github.com/kube), [#9289](https://github.com/hashintel/hash/pull/9289))

- Quick simulation runs an ad-hoc scenario when none is selected: a "Define initial state" drawer in the simulation settings panel edits token counts and values that compile through a generated, never-persisted scenario. ([@kube](https://github.com/kube), [#9287](https://github.com/hashintel/hash/pull/9287))

- Behind the new experimental "Ad-hoc scenarios" setting, the scenario creation form authors scenarios through the ad-hoc form: exposed Variables become the saved scenario's tunable parameters, and the definition persists as `initialState.type: "adhoc"`. ([@kube](https://github.com/kube), [#9368](https://github.com/hashintel/hash/pull/9368))

- Add the ad-hoc scenarios user-guide page and register it with the in-app AI assistant's doc reader. ([@kube](https://github.com/kube), [#9290](https://github.com/hashintel/hash/pull/9290))

- The ad-hoc scenario form matches the ratified prototype: gutter-cycled row kinds (fixed → dynamic → count-optimized) with quiet count strips, shared columns with a wash and derived cells, a phantom trailing row, place totals, compact Variables blocks, and Monaco expression editors type-checked live through a new ad-hoc LSP session with diagnostics rendered on closed cells. ([@kube](https://github.com/kube))

- Transition kernels, lambdas, and differential equations can now be written as a bare function body ending in `return`, like metrics and scenario code: `input` (or `tokens` for dynamics) and `parameters` are in scope ambiently, with full editor type checking and completions. The `export default TransitionKernel(...)` / `Lambda(...)` / `Dynamics(...)` module form is still accepted, and the editor picks the right checking mode per form. Default templates, built-in examples, and the AI assistant now use the bare form. Visualizers are unchanged. ([@kube](https://github.com/kube), [#9370](https://github.com/hashintel/hash/pull/9370))

- Keep the bottom toolbar clear of the side panels and the viewport controls: it stays centered on the canvas until a panel would cover it, then shifts aside, and collapses to its essential controls — expanding again on hover or focus — when the space between the panels is too narrow for the full set. ([@kube](https://github.com/kube), [#9533](https://github.com/hashintel/hash/pull/9533))

- The canvas renders centered on the net from its first frame, instead of jumping there after a first paint at the origin. Component instances grow with their port count so their ports have room, and auto-layout on import no longer depends on the compact/classic setting. ([@kube](https://github.com/kube), [#9352](https://github.com/hashintel/hash/pull/9352))

- Remember the canvas viewport per net, so switching between nets or reloading returns to the same position and zoom. ([@kube](https://github.com/kube), [#9510](https://github.com/hashintel/hash/pull/9510))

- Added a command registry for host-rendered command palettes: `createCommandRegistry()` and `combineCommandRegistries()` in core, and `CommandRegistryProvider`, `useCommand(command, { when })`, `useCommands()`, and `formatShortcutKeys()` in `@hashintel/petrinaut/react`. The editor registers its undo/redo, tool, auto-layout, search, and panel commands. Petrinaut ships no palette. ([@kube](https://github.com/kube), [#9457](https://github.com/hashintel/hash/pull/9457))

- The experiment and optimization result drawers keep the summary, navigator and surface still at the top; only the step and metric lists scroll, with the step table's header pinned. ([@kube](https://github.com/kube), [#9422](https://github.com/hashintel/hash/pull/9422))

- Experiments can sweep scenario parameters. A Sweep toggle per numeric parameter defines the values, and the results drawer gains a navigator: only the selected combination computes, in escalating run batches that stream into the charts, and visited combinations keep their results. ([@kube](https://github.com/kube), [#9093](https://github.com/hashintel/hash/pull/9093))

- The WebGPU backend matches the CPU engine's stochastic semantics and frame numbering, streams metric frames per dispatch chunk, and runs range sweeps from a per-run parameter buffer. It sizes and calibrates metric histograms and typed-place buffers from the model and device instead of refusing or warning, and tiles experiments larger than the device's limits with bit-identical results. Sweep batch instantiation no longer blocks the main thread: scenario compilation is prepared once per experiment and per-run values travel as one typed-array plan. ([@kube](https://github.com/kube), [#9454](https://github.com/hashintel/hash/pull/9454))

- Distribution heatmaps in experiment metric charts render as a magma-coloured density image in one draw call, so they stay fast at high run counts. ([@kube](https://github.com/kube), [#9450](https://github.com/hashintel/hash/pull/9450))

- Swept parameters declare an interval instead of a value count, and the navigator becomes a range slider per parameter: the whole interval by default, resizable, collapsible to a point. A range selection samples the region and streams the merged distribution over it. The slider is a two-thumb range control local to the navigator, whose thumbs may coincide. ([@kube](https://github.com/kube), [#9396](https://github.com/hashintel/hash/pull/9396))

- Extract the contour plot into a `ContourSurface` component shared by the sweep and optimization surfaces, decouple `SweepNavigator` from the experiments context, and add Storybook stories for each component's states. Sweep navigation is continuous: a point selection uses a single-thumb slider, slider moves commit during the drag, and charts keep their axes, grid and size while frames stream in. `Slider` treats 0 as a real value, and `useElementSize` follows an element that mounts after the first render. ([@kube](https://github.com/kube), [#9421](https://github.com/hashintel/hash/pull/9421))

- Optimization studies with two or more optimized numeric parameters gain a Surface section: a contour of the objective over two chosen parameters, computed locally against the study's frozen model, with the study's trials as markers. Sliders and clicks move the selected point, which refines with escalating batches. `Slider` accepts `step` and `onChangeEnd`. ([@kube](https://github.com/kube), [#9398](https://github.com/hashintel/hash/pull/9398))

- Run an experiment's runs in parallel across several Web Workers. ([@kube](https://github.com/kube), [#9162](https://github.com/hashintel/hash/pull/9162))

  An experiment used to run every one of its runs in a single worker, using one core however many the machine had. Runs are independent, so they now split across one worker per logical core (minus one, so the editor stays responsive), capped at the run count. Measured at ~4x on 8 shards on a 10-core machine.

  Sharding cannot change what an experiment reports. Per-run seeds derive from the run's **global** index rather than its position within a shard, so run _i_ gets the same seed whichever worker owns it, and each worker's per-frame statistics recombine through the metric accumulator monoids (`empty`/`merge`). Output is byte-identical at every shard count while every shard still has an active run. A frame is only finalised once every still-running shard has reported it, with finished shards dropped from that watermark rather than blocking it — so once a whole shard's runs have ended early (for example by deadlock), that shard's completed runs stop contributing samples to later frames, where a single simulator would keep sampling their frozen state.

  Scalar metric frames now carry their pre-reduction accumulator state, because `frameValue` is already reduced and a mean of means is not a mean.

  Hosts can cap or pin parallelism with `experimentShardCount` on `ExperimentsProvider`, or `shardCount` on `createMonteCarloExperiment`.

- Add a `navigation` prop to `Petrinaut`: a router-neutral controller through
  which the host can read and drive the app location (mode, Simulate section and
  resource, scenario, subnet, selection, and creation drawers), making them real
  browser history destinations. A creation drawer now layers over the record
  already open instead of closing it, and the hamburger menu hides **Layout** on
  a read-only net. ([@kube](https://github.com/kube), [#9426](https://github.com/hashintel/hash/pull/9426))

- Add `PetrinautPreview`, a compact read-only embed surface exported from
  `@hashintel/petrinaut/preview` that reuses the editor's canvas, navigation,
  and property-inspection components. ([@kube](https://github.com/kube), [#9545](https://github.com/hashintel/hash/pull/9545))

- Add a `presentationProfile` prop to `Petrinaut` (`editor` or `review`) that
  gates authoring-only controls, and extract the scenario and playback controls
  into shared components reusable outside the full editor. ([@kube](https://github.com/kube), [#9425](https://github.com/hashintel/hash/pull/9425))

- Add an optional Quick Simulation mode to `PetrinautPreview`: hosts supply
  precompiled HIR artifacts and bounded run settings, and the preview gains
  scenario configuration, compact playback controls, and an expandable timeline
  reusing the editor's simulation components. ([@kube](https://github.com/kube), [#9546](https://github.com/hashintel/hash/pull/9546))

- Add an optional per-place token capacity. ([@kube](https://github.com/kube), [#9177](https://github.com/hashintel/hash/pull/9177))

  A place can now declare a maximum number of tokens it will hold, set from the place properties panel. Useful for supply-chain style models with finite storage. It also converts frames from growable to fixed-size, which is the precondition for a fixed-layout GPU or WASM path.

  Capacity participates in transition enablement, following the standard Petri-net capacity constraint: a transition cannot fire if doing so would take any output place above its capacity. Output tokens are applied at the end of a frame, so the check accounts for what transitions earlier in the same frame have already committed. Several transitions feeding one capped place cannot collectively overflow it.

  Deadlock detection includes the same check, so a net whose only remaining transitions are blocked by full output places is reported as deadlocked rather than stepping to `maxTime` with nothing happening.

  Nets without capacities are unaffected: the constraint tables are empty and the hot path skips them.

- Export the `EditorGlobalMode` and `SimulateViewMode` types, so a host encoding Petrinaut's navigation state into its own router can spell both vocabularies and fail its build when either gains a member. ([@kube](https://github.com/kube), [#9491](https://github.com/hashintel/hash/pull/9491))

- Reject net identifiers that collide with `Object.prototype` member names (`__proto__`, `constructor`, ...) at file import and before simulation, and store user-authored keys in prototype-free records. Place visualizer code now runs under the same sandbox hardening as scenario code. ([@kube](https://github.com/kube), [#9222](https://github.com/hashintel/hash/pull/9222))

- Scenario code (parameter overrides, per-place expressions, code-mode initial state) now compiles through the HIR and runs in an interpreter: no `new Function`, no sandbox. Out-of-subset code fails with positioned errors in the editor and at compile. Stricter than the old evaluator: `==` is strict, conditions and `&&`/`||` take booleans, unknown place names in code mode are errors, and array methods beyond `.map`/`.reduce`/`.concat` are unavailable. `Array.from({ length: n }, fn)` desugars to `range(n).map(fn)`. ([@kube](https://github.com/kube), [#9332](https://github.com/hashintel/hash/pull/9332))

- The place, transition, component-instance, and type properties panels display and allow editing of the element's optional `description`. ([@CiaranMn](https://github.com/CiaranMn), [#9484](https://github.com/hashintel/hash/pull/9484))

- Range sweeps rotate each axis's low-discrepancy parameter draws by a seed-derived shift, so experiments with different seeds explore different value sequences. ([@kube](https://github.com/kube), [#9435](https://github.com/hashintel/hash/pull/9435))

- Sidebar list labels use the full row width and truncate with an ellipsis consistently; the row menu button only takes space while hovering the row or while its menu is open. ([@kube](https://github.com/kube), [#9377](https://github.com/hashintel/hash/pull/9377))

- Add generic host-rendered AI composer controls and a persistent inline Voice session, protected
  active conversations, keyboard fallback, and one-answer buffering while the normal chat stream
  settles. Add the provider-neutral `renderVoiceMode` contract and export `PetrinautAiInputMode`, with
  the selected input mode and mode-change callback available to host-rendered Voice modes. Include
  stable finalized-text submission, conversation identity, stop handling, schema-validated
  interactive-tool text mapping, explicit separate-message targeting for corrections, and a
  queue-aware voice submission path. Present text and voice through one transcript and composer whose
  trailing action switches between waveform, Send, and Stop. `renderComposerControl` remains a
  supported public seam for hosts that only need their own control beside the message box,
  independently of Voice mode. Surface assistant request failures as error toasts instead of
  transcript entries. ([@kostandinang](https://github.com/kostandinang), [#9355](https://github.com/hashintel/hash/pull/9355))

  Render every live Voice surface from a session snapshot the host reports through
  `reportVoiceSessionState`, so hosts describe their session while Petrinaut owns its chrome. Replace
  the composer with a low-profile Voice dock -- a canvas ribbon of three travelling waves, one leading
  and two trailing it more faintly, fading out at both ends, opening with the microphone while
  listening and moving under its own power through the same drawing path while the assistant speaks,
  near flat while neither holds the turn, and naming one phase at a time -- with an announced phase and
  reduced-motion behavior. Curve the raw microphone level before it drives the waves, so an ordinary
  speaking level is plainly visible rather than a flicker above the line and a raised voice still has
  somewhere to go. Sample the level per animation frame rather than through React, so drawing costs no
  re-renders, and ease it against the frame delta so it looks the same at any refresh rate. Hold spoken
  turns out of the transcript until the session ends, then reveal them together under a turn-count
  divider, while typed messages and interactive tools awaiting an answer stay visible throughout. Let a
  per-session Show transcription in chat action write those turns into the conversation as they land
  instead. Keep every session control -- transcription, the microphone toggle, Resume, Reconnect, and
  End -- in the dock, leaving the canvas toolbar untouched. Add `setMicrophoneMuted` to the Voice mode
  controls and a `muted` session phase, so muting stops capture without interrupting what the assistant
  is saying, unlike pausing. Surface voice recovery failures as toasts with privacy-safe diagnostic
  references, and request one-time consent before the host starts the microphone. Mark persisted spoken
  messages and the exact interactive-tool answer completed by Voice with an inline Voice chip ahead of
  the words themselves.

  End Voice mode before submitting typed text exactly once through the shared composer, preserving the
  draft if handoff fails. Pause active media before the AI panel closes and reopen the mounted session
  paused. Provisional transcription and Realtime audio remain ephemeral rather than becoming
  persisted chat history.

- Storybook gains a "With real optimizer" story that runs optimization studies against a local Petrinaut Optimizer service; start it with `turbo run dev --filter @hashintel/petrinaut -- --with-optimizer-service`. ([@kube](https://github.com/kube), [#9395](https://github.com/hashintel/hash/pull/9395))

- A sweep's range selection runs as one stochastic simulation over the ranges: every run draws its own value per ranged parameter, and the metric distribution over the region streams live. `ExperimentRequest` carries optional per-run overrides (`runs`), forwarded by the worker-pool backend and refused by the WebGPU backend. ([@kube](https://github.com/kube), [#9419](https://github.com/hashintel/hash/pull/9419))

- Sweep compute is reused and pipelined: simulation workers persist across batches, surface cells sample in batched chunks in quad-tree order across the CPU pool, the navigator's selection streams first while the ladder pipelines its rungs, and one GPU backend (device, shader, calibration) with a small preview tile serves a session's batches. The surface reads a cell's value from the last sampled frame, so terminating nets fill it; charts mount their axes when the drawer opens and apply data once per animation frame. ([@kube](https://github.com/kube), [#9474](https://github.com/hashintel/hash/pull/9474))

- The frame inspector draws a frame's distribution as a canvas histogram with value and count axes. Distribution frames carry their bins' extent and heatmaps paint each bin across the rows it covers, so mixed strides no longer stripe, and streamed updates ease in instead of snapping. The sweep surface navigates by drag as well as click and marks the navigator's position, and the summary lists every batch computing in parallel. Parameter sweeps and the optimization surface are experimental settings, off by default. ([@kube](https://github.com/kube), [#9478](https://github.com/hashintel/hash/pull/9478))

- Sweeps with two or more swept parameters gain a Surface section: a contour of a metric's final value over two chosen parameters, filled in live on a background lane. Clicking it moves the navigator to the nearest combination. ([@kube](https://github.com/kube), [#9369](https://github.com/hashintel/hash/pull/9369))

- Add an experimental WebGPU compute backend for experiments, chosen per experiment behind a user setting. It runs the net's lowered HIR on the device, declines nets it cannot run so they fall back to the CPU, and agrees with the CPU in distribution rather than seed for seed. A Compilation panel, also behind a setting, shows what the compiler made of each condition, kernel and equation. ([@kube](https://github.com/kube), [#9179](https://github.com/hashintel/hash/pull/9179))

- Add the worksheet keyboard-flow primitives (`FocusStack`, `FocusRoot`, `useFocusGrid`, `useFocusStops`): reusable arrow-key routing, per-group focus memory, and roving tab stops for panels composed of grids and controls. ([@kube](https://github.com/kube), [#9411](https://github.com/hashintel/hash/pull/9411))

- Nets and optimization manifests can be imported and exported in YAML and JSON. ([@kube](https://github.com/kube), [#9379](https://github.com/hashintel/hash/pull/9379))

- Updated dependencies:
  - @hashintel/petrinaut-core@0.0.5
  - @hashintel/ds-components@0.3.2

## Unreleased

### Patch Changes

- Add generic host-rendered AI composer controls and the provider-neutral `renderVoiceMode`
  contract. Export `PetrinautAiInputMode` and expose stable Voice mode state, controls, and
  exactly-once submission through the existing conversation. Text and Voice mode now share one
  transcript and composer; its trailing action shows the waveform when empty, Send for typed text,
  and Stop while the assistant is busy. `renderComposerControl` remains available independently.

- Keep Voice mode mounted inline with the transcript, pause it before the panel closes, and reopen
  it paused. Show provisional speech as an ephemeral user bubble, retain waveform provenance on
  finalized spoken messages and exact interactive-tool answers without duplication, and end Voice
  mode before handing typed text to the shared submission path. The compact state divider includes
  live listening levels, reduced-motion speaking feedback, throttled announcements, overflow
  actions, collapsed technical details, and actionable recovery.

## 0.0.19

### Patch Changes

- Updated dependencies:
  - @hashintel/ds-helpers@0.2.2
  - @hashintel/petrinaut-core@0.0.4
  - @hashintel/ds-components@0.3.1

## 0.0.18

### Patch Changes

- Add an interactive-tool extension point to the AI assistant panel: hosts can register app-level tools whose calls render as interactive widgets in the conversation, including tools that suspend the turn until the user responds. ([@lunelson](https://github.com/lunelson), [#9274](https://github.com/hashintel/hash/pull/9274))

## 0.0.17

### Patch Changes

- Improve narrow-panel layouts and scrolling in Simulation Settings, the timeline, bottom-panel tabs, and sidebar subviews. ([@kube](https://github.com/kube), [#9074](https://github.com/hashintel/hash/pull/9074))

- Rename the AI assistant tab to "AI", use neutral assistant copy, place `topBarStart` immediately before the net title, and add `slots.titleStyle` for host-defined title styling. ([@vilkinsons](https://github.com/vilkinsons), [#9084](https://github.com/hashintel/hash/pull/9084))

- Replace the `optimize` host capability with `createOptimizationRun`, `attachOptimizationRun`, and `cancelOptimizationRun`, enabling resumable runs and automatic reconnection. ([@kube](https://github.com/kube), [#9066](https://github.com/hashintel/hash/pull/9066))

- Add `uuid` token attributes with automatic generation and `Uuid.generate()` / `Uuid.from()` helpers. ([@kube](https://github.com/kube), [#8953](https://github.com/hashintel/hash/pull/8953))

- Add `range()` to scenario code, fix common array methods in scenario expressions, and show scenario compilation errors in Simulation Settings. ([@kube](https://github.com/kube), [#9092](https://github.com/hashintel/hash/pull/9092))

- Clarify that Predicate transitions fire immediately when their guard is true and input tokens are available. ([@YannisZa](https://github.com/YannisZa), [#9097](https://github.com/hashintel/hash/pull/9097))

- Add the `string` token attribute type, stored via per-run interning. Editing a type's schema now migrates stored initial state (values convert, falling back to the new type's default). ([@kube](https://github.com/kube), [#8953](https://github.com/hashintel/hash/pull/8953))

- Add a scenario-first optimization interface with flat parameter search spaces, metric objectives, and progressive step results. ([@kube](https://github.com/kube), [#9051](https://github.com/hashintel/hash/pull/9051))

- Add `integer` and `boolean` token attribute types. ([@kube](https://github.com/kube), [#8764](https://github.com/hashintel/hash/pull/8764))

- Improve inhibitor arc styling. ([@CiaranMn](https://github.com/CiaranMn), [#8846](https://github.com/hashintel/hash/pull/8846))

- Allow metrics to read resolved net parameters through `parameters.<variableName>`; scenario parameters remain unavailable. ([@kube](https://github.com/kube), [#9043](https://github.com/hashintel/hash/pull/9043))

- Add Actual mode for read-only live execution, including host event streams, a timeline, an event log, and recording exports. ([@kube](https://github.com/kube), [#8829](https://github.com/hashintel/hash/pull/8829))

- Replace Babel with the HIR compiler for user code. Unsupported TypeScript now produces diagnostics instead of running. ([@kube](https://github.com/kube), [#8981](https://github.com/hashintel/hash/pull/8981))

- Allow hosts to disable SDCPN extensions and global parameters. ([@kube](https://github.com/kube), [#8763](https://github.com/hashintel/hash/pull/8763))

- Improve spacing for scenario and parameter controls in Simulation Settings. ([@kube](https://github.com/kube), [#9078](https://github.com/hashintel/hash/pull/9078))

- Add subnet definitions, component instances, and wiring support to Petrinaut. ([@kube](https://github.com/kube), [#8662](https://github.com/hashintel/hash/pull/8662))

- Add editor support for read input arcs, including arc controls and distinct canvas rendering. ([@kube](https://github.com/kube), [#8774](https://github.com/hashintel/hash/pull/8774))

- Add a "Pre-deployed Constellation" scenario to the Probabilistic Satellite Launcher example. ([@kube](https://github.com/kube), [#9092](https://github.com/hashintel/hash/pull/9092))

- Use a shared fixed seed (`PETRINAUT_DEFAULT_SEED`) for interactive simulation and optimization runs, so playing a simulation reproduces an optimization trial given the same configuration. ([@kube](https://github.com/kube), [#9073](https://github.com/hashintel/hash/pull/9073))

- Export the token value codec and `compileUserCode` from `@hashintel/petrinaut-core`. ([@kube](https://github.com/kube), [#8943](https://github.com/hashintel/hash/pull/8943))

- Use a packed token frame layout and simplify the `getPlaceTokens(place)` and `buildMetricState(frame, places)` APIs. ([@kube](https://github.com/kube), [#8944](https://github.com/hashintel/hash/pull/8944))

- Add Panda build metadata and a shared preset for host style generation, and namespace Petrinaut keyframes to prevent theme collisions. ([@alex-e-leon](https://github.com/alex-e-leon), [#9071](https://github.com/hashintel/hash/pull/9071))

- Updated dependencies:
  - @hashintel/ds-components@0.3.0
  - @hashintel/petrinaut-core@0.0.3

## 0.0.16

### Patch Changes

- Adds an optional product walkthrough that consumers can set ([@alex-e-leon](https://github.com/alex-e-leon), [#8789](https://github.com/hashintel/hash/pull/8789))

- Add experiment metric creation controls, validation, and scalar/distribution visualizations. ([@kube](https://github.com/kube), [#8751](https://github.com/hashintel/hash/pull/8751))

- add AI assistant ([@CiaranMn](https://github.com/CiaranMn), [#8750](https://github.com/hashintel/hash/pull/8750))

- Updated dependencies:
  - @hashintel/petrinaut-core@0.0.2
  - @hashintel/ds-components@0.2.2

## 0.0.15

### Patch Changes

- Extract the headless Petrinaut core into `@hashintel/petrinaut-core`, expose dedicated core worker entry points, and remove the `@hashintel/petrinaut/core` compatibility entry point. ([@kube](https://github.com/kube), [#8730](https://github.com/hashintel/hash/pull/8730))

- Add basic MonteCarlo-based experiments ([@kube](https://github.com/kube), [#8709](https://github.com/hashintel/hash/pull/8709))

- Updated dependencies:
  - @hashintel/ds-helpers@0.2.1
  - @hashintel/petrinaut-core@0.0.1
  - @hashintel/refractive@0.0.4
  - @hashintel/ds-components@0.2.1

## 0.0.14

### Patch Changes

- Add Metrics: user-authored functions over simulation state that produce a single number per frame, plotted via a new metric picker in the simulation timeline header ([@kube](https://github.com/kube), [#8633](https://github.com/hashintel/hash/pull/8633))

- Updated dependencies:
  - @hashintel/ds-components@0.2.0
  - @hashintel/ds-helpers@0.2.0

## 0.0.13

### Patch Changes

- Add support for inhibitor arcs ([@alex-e-leon](https://github.com/alex-e-leon), [#8618](https://github.com/hashintel/hash/pull/8618))

- Let minZoom be dynamically based on the size of the net ([@alex-e-leon](https://github.com/alex-e-leon), [#8611](https://github.com/hashintel/hash/pull/8611))

- recenter offscreen selected items when drawer is opened ([@alex-e-leon](https://github.com/alex-e-leon), [#8637](https://github.com/hashintel/hash/pull/8637))

- Improve text wrapping for long text in nodes ([@alex-e-leon](https://github.com/alex-e-leon), [#8623](https://github.com/hashintel/hash/pull/8623))

- Add Scenarios: reusable simulation configurations with parameter overrides and initial state expressions ([@kube](https://github.com/kube), [#8609](https://github.com/hashintel/hash/pull/8609))

## 0.0.12

### Patch Changes

- better scoping of styles, font loading ([@CiaranMn](https://github.com/CiaranMn), [#8590](https://github.com/hashintel/hash/pull/8590))

## 0.0.11

### Patch Changes

- Updated dependencies:
  - @hashintel/refractive@0.0.3
  - @hashintel/ds-helpers@0.1.2
  - @hashintel/ds-components@0.1.2

## 0.0.10

### Patch Changes

- Fix dependency references ([@CiaranMn](https://github.com/CiaranMn), [#8570](https://github.com/hashintel/hash/pull/8570))

- Updated dependencies:
  - @hashintel/ds-components@0.1.1
  - @hashintel/ds-helpers@0.1.1

## 0.0.9

### Patch Changes

- Add LSP-based language service layer for Monaco code editors with diagnostics, completions, hover, and signature help ([@kube](https://github.com/kube), [#8300](https://github.com/hashintel/hash/pull/8300))

- Add copy/paste, select all, and escape-to-deselect keyboard shortcuts ([@kube](https://github.com/kube), [#8533](https://github.com/hashintel/hash/pull/8533))

- add TikZ export format ([@CiaranMn](https://github.com/CiaranMn), [#8439](https://github.com/hashintel/hash/pull/8439))

- Fix read-only tooltips to always show during simulation mode ([@kube](https://github.com/kube), [#8285](https://github.com/hashintel/hash/pull/8285))

- Visual appearance improvements ([@kube](https://github.com/kube), [#8472](https://github.com/hashintel/hash/pull/8472))

- Add probability distribution support to transition kernels (`Distribution.Gaussian`, `Distribution.Uniform`, `Distribution.Lognormal`) ([@kube](https://github.com/kube), [#8463](https://github.com/hashintel/hash/pull/8463))

- Add multi-selection support with keyboard shortcuts, and migrate to @xyflow/react v12 ([@kube](https://github.com/kube), [#8523](https://github.com/hashintel/hash/pull/8523))

- Add configurable simulation playback speed and maximum run time ([@kube](https://github.com/kube), [#8295](https://github.com/hashintel/hash/pull/8295))

- Add optional undo/redo support with version history UI, keyboard shortcuts (Cmd|Ctrl+Z / Cmd|Ctrl+Shift+Z), and drag debouncing ([@kube](https://github.com/kube), [#8505](https://github.com/hashintel/hash/pull/8505))

- Updated dependencies:
  - @hashintel/ds-helpers@0.1.0
  - @hashintel/ds-components@0.1.0

## 0.0.8

### Patch Changes

- Updated dependencies:
  - @hashintel/refractive@0.0.2
  - @hashintel/ds-components@0.0.4
  - @hashintel/ds-helpers@0.0.4

## 0.0.7

### Patch Changes

- Updated dependencies:
  - @hashintel/ds-components@0.0.3
  - @hashintel/ds-helpers@0.0.3

## 0.0.6

### Patch Changes

- Unify Vite config and update styles configuration ([@kube](https://github.com/kube), [#8194](https://github.com/hashintel/hash/pull/8194))

- Add Diagnostics Panel using TypeScript Language Service. ([@kube](https://github.com/kube), [#8171](https://github.com/hashintel/hash/pull/8171))

- Add Simulation Timeline Visualizer ([@kube](https://github.com/kube), [#8211](https://github.com/hashintel/hash/pull/8211))

- Add Menu option to Export without Visual Information ([@kube](https://github.com/kube), [#8143](https://github.com/hashintel/hash/pull/8143))

- Better animation of Transitions and flow inside Arcs ([@kube](https://github.com/kube), [#8262](https://github.com/hashintel/hash/pull/8262))

- implement SDCPN features, update UI ([@CiaranMn](https://github.com/CiaranMn), [#8083](https://github.com/hashintel/hash/pull/8083))

- Quick Simulation in Edit mode, and disable Simulate tab for now. ([@kube](https://github.com/kube), [#8195](https://github.com/hashintel/hash/pull/8195))

- Updated dependencies:
  - @hashintel/refractive@0.0.1
  - @hashintel/ds-components@0.0.2
  - @hashintel/ds-helpers@0.0.2
