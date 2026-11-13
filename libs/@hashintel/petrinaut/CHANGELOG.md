# @hashintel/petrinaut

## 0.0.23

### Patch Changes

- Updated dependencies:
  - @hashintel/ds-components@0.5.1

## 0.0.22

### Patch Changes

- Add `renderComposerStatus` for host-owned status above the composer or expanded Voice dock, without changing the collapsed dock's height. Pass the current `inputMode` to composer controls and keep composer controls available in the live Voice dock. With `presentation: "brunch"`, system messages display as visible notes in Chat and Voice, `renderSystemMessage` renders their content, and composer controls sit at the leading edge of the composer and Voice dock, separate from submission and session actions. ([#10053](https://github.com/hashintel/hash/pull/10053))

- Plugins can provide the AI assistant panel's content and title bar, and the `aiAssistant` prop with its built-in chat is deprecated. ([#10103](https://github.com/hashintel/hash/pull/10103))

- Fix the code editor's web worker failing to load in apps that bundle Petrinaut with Vite. Petrinaut now emits the worker's URL in a form the app's bundler recognises, so the bundler copies the worker into the app's build. ([#10081](https://github.com/hashintel/hash/pull/10081))

- `PetrinautPreview` takes an `actualMode` prop to show an execution from outside Petrinaut, as the editor's Actual mode does: it opens on the latest frame, with a timeline to scrub back through it. ([#10157](https://github.com/hashintel/hash/pull/10157))

- The Visualizer editor checks JavaScript with JSX as you type, lists errors in the Diagnostics tab without blocking a run, and draws the picture by interpreting the code safely, so nothing from a net runs as JavaScript. ([#10189](https://github.com/hashintel/hash/pull/10189))

- Add optional assistant header controls with an input-mode restriction for voice-only controls, preserving Chat and Ledger state. ([#10054](https://github.com/hashintel/hash/pull/10054))
- Updated dependencies:
  - @hashintel/petrinaut-core@0.0.6
  - @hashintel/ds-components@0.5.0
  - @hashintel/ds-icons@0.0.3

## 0.0.21

### Patch Changes

- Updated dependencies:
  - @hashintel/ds-icons@0.0.2

## 0.0.20

### Patch Changes

- Scenarios are written in one form that defines initial state, parameters and variables inline, with type-checked expression editors. Experiments, optimizations and quick simulation can run an ad-hoc scenario defined inline when no saved scenario is selected.

- Hosts can register validated AI tools that run automatically against the editor. `ErrorTrackerContext.captureException` accepts an optional `{ source, tags }` context, and the assistant reports its failures there. ([#9649](https://github.com/hashintel/hash/pull/9649))

- Transition kernels, lambdas and differential equations can be written as a bare function body ending in `return`. The `export default` module form still works. ([#9370](https://github.com/hashintel/hash/pull/9370))

- The bottom toolbar moves aside when a side panel would cover it, and collapses to its essential controls when space is narrow. ([#9533](https://github.com/hashintel/hash/pull/9533))

- `ExperimentHostContext.runExperiment` runs a validated experiment of up to 100,000 runs, with progress callbacks, cancellation and captured results. ([#9676](https://github.com/hashintel/hash/pull/9676))

- Hosts can inspect or refuse AI edits through `aiAssistant.executeMutation`, add their own assistant tab, and follow the canonical conversation history. ([#9562](https://github.com/hashintel/hash/pull/9562))

- Hosts can run AI tool calls themselves while the response streams, through `aiAssistant.inBandBrowserTools`, and apply one AI edit with `executePetrinautAiMutation`. ([#9811](https://github.com/hashintel/hash/pull/9811))

- Host assistant tools can read editor commands, current diagnostics, optimizer availability and user-guide content. ([#9667](https://github.com/hashintel/hash/pull/9667))

- Hosts can label assistant tabs, flag unseen tab activity, show tool results as pending or refused, show approval controls on matching tool calls, and make Stop durable before the stream is cancelled. ([#9722](https://github.com/hashintel/hash/pull/9722))

- Large nets play back and respond to hover faster: only changed nodes re-render, firing animations run only in view, and a closed timeline stops drawing. ([#9592](https://github.com/hashintel/hash/pull/9592))

- Hovering or selecting a node highlights its inputs in blue and its outputs in orange, and the **Highlight on hover** setting turns the hover highlight off. ([#9591](https://github.com/hashintel/hash/pull/9591))

- The canvas opens centred on the net and remembers each net's position and zoom. Component instances grow to fit their ports, and auto-layout on import ignores the compact/classic setting. ([#9352](https://github.com/hashintel/hash/pull/9352))

- Add a command registry for host-rendered command palettes: `createCommandRegistry` and `combineCommandRegistries` in core, and `CommandRegistryProvider`, `useCommand`, `useCommands` and `formatShortcutKeys` in `@hashintel/petrinaut/react`. ([#9457](https://github.com/hashintel/hash/pull/9457))

- Copying notification details shows whether the copy succeeded, with a fallback when the Clipboard API refuses it. ([#9792](https://github.com/hashintel/hash/pull/9792))

- `createExperiment` resolves with the experiment record, which now carries the scenario it compiled (`ExperimentRecord.scenario`), and no longer selects it. ([#9689](https://github.com/hashintel/hash/pull/9689))

- Canvas nodes have a lighter style: places are circles, and transitions are rectangles showing an icon, the wrapped name and the transition type. Arc weight labels sit on the curve. ([#9595](https://github.com/hashintel/hash/pull/9595))

- The left panel always shows the Entities tree, which replaces the separate entity lists and the "Entities tree view" setting. ([#9597](https://github.com/hashintel/hash/pull/9597))

- Hosts can offer retries for failed experiment runs and report experiment activity to the assistant composer. ([#9857](https://github.com/hashintel/hash/pull/9857))

- Experiments can sweep numeric scenario parameters over intervals. A range-slider navigator selects a point or region, metric distributions stream in live, and a Surface plots a contour over two parameters. ([#9093](https://github.com/hashintel/hash/pull/9093))

- Add `aiAssistant.presentation`, which selects the Brunch conversation layout: each turn's reasoning and tool calls group under a collapsible Activity row above the answer. The stock layout stays the default. ([#9829](https://github.com/hashintel/hash/pull/9829))

- `prepareExperiment` is exported from `@hashintel/petrinaut/react`, so a host can resolve an experiment request against the live model without starting a run. ([#9771](https://github.com/hashintel/hash/pull/9771))

- Optimization studies run from a sweep's Parameters card, replacing the Optimizations tab. A study can run in the browser, be stopped and continued with more steps, and keeps its best parameters available through **View best**. ([#9685](https://github.com/hashintel/hash/pull/9685))

- Cmd/Ctrl+click adds a node to the selection or removes it, and a selection box drawn with Cmd/Ctrl held adds to the selection. ([#9895](https://github.com/hashintel/hash/pull/9895))

- Experiments split their runs across Web Workers, one per logical core minus one, with identical results at any worker count. `experimentShardCount` on `ExperimentsProvider` and `shardCount` on `createMonteCarloExperiment` cap the parallelism. ([#9162](https://github.com/hashintel/hash/pull/9162))

- Update the `ai` dependency to 6.0.286 and `@ai-sdk/react` to 3.0.289. ([#9849](https://github.com/hashintel/hash/pull/9849))

- Add a `navigation` prop to `Petrinaut`, a router-neutral controller through which a host reads and drives the editor's location as browser history. `EditorGlobalMode` and `SimulateViewMode` are exported for hosts that encode it. ([#9426](https://github.com/hashintel/hash/pull/9426))

- Editor icons come from `@hashintel/ds-icons`, a new dependency, with animated hover and state effects. Hosts that compile styles from `@hashintel/petrinaut/panda.buildinfo.json` must also include `@hashintel/ds-icons/panda.buildinfo.json`. ([#9981](https://github.com/hashintel/hash/pull/9981))

- New entities get UUID ids. Links, scenarios and subnet references that use older ids still resolve, and `canonicalizePetrinautIds` is re-exported. ([#9957](https://github.com/hashintel/hash/pull/9957))

- Add `PetrinautPreview` to `@hashintel/petrinaut/preview`: a compact read-only embed with optional Quick Simulation from precompiled HIR, and a **Full view** link from `fullViewUrl`. ([#9545](https://github.com/hashintel/hash/pull/9545))

- Allow hosts to render application-specific content in the Labs settings section. ([#9793](https://github.com/hashintel/hash/pull/9793))

- Adds a palette command that starts a blank net when the host manages nets. ([#9946](https://github.com/hashintel/hash/pull/9946))

- Add a plugin API: `<Petrinaut plugins>` takes plugins that add buttons, top-bar items, commands, settings and UI, listed under Plugins in User settings. ([#9904](https://github.com/hashintel/hash/pull/9904))

- Add a `presentationProfile` prop to `Petrinaut` (`editor` or `review`) that hides authoring-only controls in `review`. ([#9425](https://github.com/hashintel/hash/pull/9425))

- Remove `slots.topBarStart`, `slots.topBarEnd`, `slots.titleStyle` and the `viewportActions` prop from `<Petrinaut>`, the `ViewportAction` type, and the built-in welcome guide with its `Walkthrough*` exports and setting. Plugins replace them. ([#9913](https://github.com/hashintel/hash/pull/9913))

- User Settings open in a movable, resizable dialog with keyboard-accessible sections.

- A place's state visualizer opens from the hovered place, with or without a run, and can be pinned while scrubbing the timeline. ([#9601](https://github.com/hashintel/hash/pull/9601))

- Places can declare a maximum token capacity, and a transition cannot fire if it would take an output place over capacity. ([#9177](https://github.com/hashintel/hash/pull/9177))

- The playback readout shows elapsed and total simulated time instead of frame numbers. ([#9598](https://github.com/hashintel/hash/pull/9598))

- Sidebar, toolbar and properties panel styling is more consistent, with clickable checkbox labels and list labels that use the full row width. ([#9728](https://github.com/hashintel/hash/pull/9728))

- Add experimental automatic arc connections, drawn from one hover handle, with curves that follow node outlines. ([#9677](https://github.com/hashintel/hash/pull/9677))

- The AI assistant docks on the right or floats as a movable, resizable panel, and Cmd/Ctrl+Shift+K toggles it. ([#9659](https://github.com/hashintel/hash/pull/9659))

- On read-only nets, property values show as text instead of disabled inputs, and a blocked edit shows a brief notice that a plugin can extend with an action. ([#9596](https://github.com/hashintel/hash/pull/9596))

- An AI edit that leaves the document unchanged is reported as not applied. ([#9537](https://github.com/hashintel/hash/pull/9537))

- Experiment and Scenario panels are resizable, routed and keyboard-selectable, and can open fullscreen. ([#9723](https://github.com/hashintel/hash/pull/9723))

- Net identifiers named after `Object.prototype` members, such as `__proto__`, are rejected at import and before simulation. Place visualizer code runs under the same sandbox as scenario code. ([#9222](https://github.com/hashintel/hash/pull/9222))

- Scenario code runs in an interpreter instead of `new Function`, and is stricter: `==` is strict, conditions take booleans, unknown place names are errors, and only `.map`, `.reduce` and `.concat` array methods are available. ([#9332](https://github.com/hashintel/hash/pull/9332))

- Properties panels show and edit an element's optional `description`. ([#9484](https://github.com/hashintel/hash/pull/9484))

- `ExperimentExecutionCard` is exported from `@hashintel/petrinaut/ui`, so host assistants can show experiment and optimization progress with the built-in UI. ([#9800](https://github.com/hashintel/hash/pull/9800))

- Experiment and optimization drawers share one layout: a condensing header, a Parameters band, and fixed-height metric cards with a Chart options menu, an Enlarge button and faster distribution heatmaps. ([#9607](https://github.com/hashintel/hash/pull/9607))

- The AI assistant can run experiments and optimizations from chat, with progress, cancellation and a link to the results. ([#9678](https://github.com/hashintel/hash/pull/9678))

- Hosts can add a Voice mode to the AI assistant with `renderVoiceMode` and report its state with `reportVoiceSessionState`. `PetrinautAiInputMode` is exported, Voice mode controls gain `setMicrophoneMuted`, and `renderComposerControl` still adds a control beside the message box. ([#9355](https://github.com/hashintel/hash/pull/9355))

- A tool stopped mid-run shows Cancelled, and a message the host has accepted no longer returns to the composer if its stream later fails. ([#9883](https://github.com/hashintel/hash/pull/9883))

- Code sections expand to fill the Properties panel, and Canvas and Definitions are Edit views with browser history navigation. ([#9664](https://github.com/hashintel/hash/pull/9664))

- During a Voice session a compact dock replaces the composer, with a live waveform, microphone mute, interruption by speaking, audio and voice settings, and errors behind a warning icon. ([#9671](https://github.com/hashintel/hash/pull/9671))

- `UserSettingsProvider` is exported from `@hashintel/petrinaut/react`, so hosts can read and change user settings from components above `Petrinaut`. ([#9634](https://github.com/hashintel/hash/pull/9634))

- Hosts can withdraw a pending voice input with an `AbortSignal`, and show original voice transcripts through an optional message display projection. ([#9836](https://github.com/hashintel/hash/pull/9836))

- Add a WebGPU backend for experiments that matches the CPU engine's semantics and falls back to the CPU for nets it cannot run. A Compilation panel shows the compiled conditions, kernels and equations. ([#9179](https://github.com/hashintel/hash/pull/9179))

- Restore design-system component styles in Petrinaut builds on Windows. ([#9808](https://github.com/hashintel/hash/pull/9808))

- Export keyboard-focus primitives for panels built from grids and controls: `FocusStack`, `FocusRoot`, `useFocusGrid` and `useFocusStops`. ([#9411](https://github.com/hashintel/hash/pull/9411))

- Nets and optimization manifests can be imported and exported in YAML and JSON. ([#9379](https://github.com/hashintel/hash/pull/9379))
- Updated dependencies:
  - @hashintel/petrinaut-core@0.0.5
  - @hashintel/ds-components@0.4.0
  - @hashintel/ds-icons@0.0.1
  - @hashintel/refractive@0.0.5

## 0.0.19

### Patch Changes

- Updated dependencies:
  - @hashintel/ds-helpers@0.2.2
  - @hashintel/petrinaut-core@0.0.4
  - @hashintel/ds-components@0.3.1

## 0.0.18

### Patch Changes

- Add an interactive-tool extension point to the AI assistant panel: hosts can register app-level tools whose calls render as interactive widgets in the conversation, including tools that suspend the turn until the user responds. ([#9274](https://github.com/hashintel/hash/pull/9274))

## 0.0.17

### Patch Changes

- Improve narrow-panel layouts and scrolling in Simulation Settings, the timeline, bottom-panel tabs, and sidebar subviews. ([#9074](https://github.com/hashintel/hash/pull/9074))

- Rename the AI assistant tab to "AI", use neutral assistant copy, place `topBarStart` immediately before the net title, and add `slots.titleStyle` for host-defined title styling. ([#9084](https://github.com/hashintel/hash/pull/9084))

- Replace the `optimize` host capability with `createOptimizationRun`, `attachOptimizationRun`, and `cancelOptimizationRun`, enabling resumable runs and automatic reconnection. ([#9066](https://github.com/hashintel/hash/pull/9066))

- Add `uuid` token attributes with automatic generation and `Uuid.generate()` / `Uuid.from()` helpers. ([#8953](https://github.com/hashintel/hash/pull/8953))

- Add `range()` to scenario code, fix common array methods in scenario expressions, and show scenario compilation errors in Simulation Settings. ([#9092](https://github.com/hashintel/hash/pull/9092))

- Clarify that Predicate transitions fire immediately when their guard is true and input tokens are available. ([#9097](https://github.com/hashintel/hash/pull/9097))

- Add the `string` token attribute type, stored via per-run interning. Editing a type's schema now migrates stored initial state (values convert, falling back to the new type's default). ([#8953](https://github.com/hashintel/hash/pull/8953))

- Add a scenario-first optimization interface with flat parameter search spaces, metric objectives, and progressive step results. ([#9051](https://github.com/hashintel/hash/pull/9051))

- Add `integer` and `boolean` token attribute types. ([#8764](https://github.com/hashintel/hash/pull/8764))

- Improve inhibitor arc styling. ([#8846](https://github.com/hashintel/hash/pull/8846))

- Allow metrics to read resolved net parameters through `parameters.<variableName>`; scenario parameters remain unavailable. ([#9043](https://github.com/hashintel/hash/pull/9043))

- Add Actual mode for read-only live execution, including host event streams, a timeline, an event log, and recording exports. ([#8829](https://github.com/hashintel/hash/pull/8829))

- Replace Babel with the HIR compiler for user code. Unsupported TypeScript now produces diagnostics instead of running. ([#8981](https://github.com/hashintel/hash/pull/8981))

- Allow hosts to disable SDCPN extensions and global parameters. ([#8763](https://github.com/hashintel/hash/pull/8763))

- Improve spacing for scenario and parameter controls in Simulation Settings. ([#9078](https://github.com/hashintel/hash/pull/9078))

- Add subnet definitions, component instances, and wiring support to Petrinaut. ([#8662](https://github.com/hashintel/hash/pull/8662))

- Add editor support for read input arcs, including arc controls and distinct canvas rendering. ([#8774](https://github.com/hashintel/hash/pull/8774))

- Add a "Pre-deployed Constellation" scenario to the Probabilistic Satellite Launcher example. ([#9092](https://github.com/hashintel/hash/pull/9092))

- Use a shared fixed seed (`PETRINAUT_DEFAULT_SEED`) for interactive simulation and optimization runs, so playing a simulation reproduces an optimization trial given the same configuration. ([#9073](https://github.com/hashintel/hash/pull/9073))

- Export the token value codec and `compileUserCode` from `@hashintel/petrinaut-core`. ([#8943](https://github.com/hashintel/hash/pull/8943))

- Use a packed token frame layout and simplify the `getPlaceTokens(place)` and `buildMetricState(frame, places)` APIs. ([#8944](https://github.com/hashintel/hash/pull/8944))

- Add Panda build metadata and a shared preset for host style generation, and namespace Petrinaut keyframes to prevent theme collisions. ([#9071](https://github.com/hashintel/hash/pull/9071))

- Updated dependencies:
  - @hashintel/ds-components@0.3.0
  - @hashintel/petrinaut-core@0.0.3

## 0.0.16

### Patch Changes

- Adds an optional product walkthrough that consumers can set ([#8789](https://github.com/hashintel/hash/pull/8789))

- Add experiment metric creation controls, validation, and scalar/distribution visualizations. ([#8751](https://github.com/hashintel/hash/pull/8751))

- Add AI assistant ([#8750](https://github.com/hashintel/hash/pull/8750))

- Updated dependencies:
  - @hashintel/petrinaut-core@0.0.2
  - @hashintel/ds-components@0.2.2

## 0.0.15

### Patch Changes

- Extract the headless Petrinaut core into `@hashintel/petrinaut-core`, expose dedicated core worker entry points, and remove the `@hashintel/petrinaut/core` compatibility entry point. ([#8730](https://github.com/hashintel/hash/pull/8730))

- Add basic MonteCarlo-based experiments ([#8709](https://github.com/hashintel/hash/pull/8709))

- Updated dependencies:
  - @hashintel/ds-helpers@0.2.1
  - @hashintel/petrinaut-core@0.0.1
  - @hashintel/refractive@0.0.4
  - @hashintel/ds-components@0.2.1

## 0.0.14

### Patch Changes

- Add Metrics: user-authored functions over simulation state that produce a single number per frame, plotted via a new metric picker in the simulation timeline header ([#8633](https://github.com/hashintel/hash/pull/8633))

- Updated dependencies:
  - @hashintel/ds-components@0.2.0
  - @hashintel/ds-helpers@0.2.0

## 0.0.13

### Patch Changes

- Add support for inhibitor arcs ([#8618](https://github.com/hashintel/hash/pull/8618))

- Let minZoom be dynamically based on the size of the net ([#8611](https://github.com/hashintel/hash/pull/8611))

- Recenter offscreen selected items when drawer is opened ([#8637](https://github.com/hashintel/hash/pull/8637))

- Improve text wrapping for long text in nodes ([#8623](https://github.com/hashintel/hash/pull/8623))

- Add Scenarios: reusable simulation configurations with parameter overrides and initial state expressions ([#8609](https://github.com/hashintel/hash/pull/8609))

## 0.0.12

### Patch Changes

- Better scoping of styles, font loading ([#8590](https://github.com/hashintel/hash/pull/8590))

## 0.0.11

### Patch Changes

- Updated dependencies:
  - @hashintel/refractive@0.0.3
  - @hashintel/ds-helpers@0.1.2
  - @hashintel/ds-components@0.1.2

## 0.0.10

### Patch Changes

- Fix dependency references ([#8570](https://github.com/hashintel/hash/pull/8570))

- Updated dependencies:
  - @hashintel/ds-components@0.1.1
  - @hashintel/ds-helpers@0.1.1

## 0.0.9

### Patch Changes

- Add LSP-based language service layer for Monaco code editors with diagnostics, completions, hover, and signature help ([#8300](https://github.com/hashintel/hash/pull/8300))

- Add copy/paste, select all, and escape-to-deselect keyboard shortcuts ([#8533](https://github.com/hashintel/hash/pull/8533))

- Add TikZ export format ([#8439](https://github.com/hashintel/hash/pull/8439))

- Fix read-only tooltips to always show during simulation mode ([#8285](https://github.com/hashintel/hash/pull/8285))

- Visual appearance improvements ([#8472](https://github.com/hashintel/hash/pull/8472))

- Add probability distribution support to transition kernels (`Distribution.Gaussian`, `Distribution.Uniform`, `Distribution.Lognormal`) ([#8463](https://github.com/hashintel/hash/pull/8463))

- Add multi-selection support with keyboard shortcuts, and migrate to @xyflow/react v12 ([#8523](https://github.com/hashintel/hash/pull/8523))

- Add configurable simulation playback speed and maximum run time ([#8295](https://github.com/hashintel/hash/pull/8295))

- Add optional undo/redo support with version history UI, keyboard shortcuts (Cmd|Ctrl+Z / Cmd|Ctrl+Shift+Z), and drag debouncing ([#8505](https://github.com/hashintel/hash/pull/8505))

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

- Unify Vite config and update styles configuration ([#8194](https://github.com/hashintel/hash/pull/8194))

- Add Diagnostics Panel using TypeScript Language Service. ([#8171](https://github.com/hashintel/hash/pull/8171))

- Add Simulation Timeline Visualizer ([#8211](https://github.com/hashintel/hash/pull/8211))

- Add Menu option to Export without Visual Information ([#8143](https://github.com/hashintel/hash/pull/8143))

- Better animation of Transitions and flow inside Arcs ([#8262](https://github.com/hashintel/hash/pull/8262))

- Implement SDCPN features, update UI ([#8083](https://github.com/hashintel/hash/pull/8083))

- Quick Simulation in Edit mode, and disable Simulate tab for now. ([#8195](https://github.com/hashintel/hash/pull/8195))

- Updated dependencies:
  - @hashintel/refractive@0.0.1
  - @hashintel/ds-components@0.0.2
  - @hashintel/ds-helpers@0.0.2
