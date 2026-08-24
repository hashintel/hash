# @hashintel/petrinaut

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
