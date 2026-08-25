# @hashintel/petrinaut

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
