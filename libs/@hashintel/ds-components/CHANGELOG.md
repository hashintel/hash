# @hashintel/ds-components

## 0.5.1

### Patch Changes

- Export rehype-markdown-class for mdx doc consumers ([@alex-e-leon](https://github.com/alex-e-leon), [#10265](https://github.com/hashintel/hash/pull/10265))

## 0.5.0

### Minor Changes

- Clear optional single `Select` and `Combobox` values with the clear button instead of an empty first option. A single select that is not `required` is always clearable. A `required` one can opt in with `clearable`, which lets `onChange` receive `null`. The `Select` clear button now sits beside the dropdown arrow at a size per select size, drawn with the same stroke width as the arrow. ([@aacarcrash](https://github.com/aacarcrash), [#9982](https://github.com/hashintel/hash/pull/9982))

### Patch Changes

- Add a `circleClose` icon ([@alex-e-leon](https://github.com/alex-e-leon), [#10162](https://github.com/hashintel/hash/pull/10162))

- Give the `HelpTooltip` trigger an accessible name: it is now exposed as `role="img"` named "Information", overridable via a new `aria-label` prop. `Tooltip` accepts `aria-label` and `role` for icon-only triggers whose wrapper is the focusable element. ([@alex-e-leon](https://github.com/alex-e-leon), [#10205](https://github.com/hashintel/hash/pull/10205))

- Publish mdx docs for components ([@alex-e-leon](https://github.com/alex-e-leon))

## 0.4.0

### Minor Changes

- `clearable` on `Select`, `TextInput` and `NumberInput` is now `boolean | { onClear }`, and `searchable` on `Select` is `boolean | { onSearch?, hideCount?, hideSelectAllToggle? }`. `Banner`'s `dismissible` is now `false | { onDismiss }`, and `removeable` on `Chip` and `Filter` is `false | { onRemove }`. These replace the previous object shapes with an inner enabled flag. ([@alex-e-leon](https://github.com/alex-e-leon), [#9646](https://github.com/hashintel/hash/pull/9646))

- Per-component subpaths (`@hashintel/ds-components/<name>`) export only components: import `iconNames`, `ChipSize` and `useFieldId` from the root, and `FieldIdProvider` from `/field-id-provider` instead of `/field-id-context`. ([@CiaranMn](https://github.com/CiaranMn), [#9966](https://github.com/hashintel/hash/pull/9966))

- `renderSelectedItem` now renders one selected value inside the multi select's trigger, and a string result also supplies that value's summary text. The new `renderSelectedAll` renders the whole selection, as `renderSelectedItem` did before, and `Filter` multi-select inputs accept both. ([@alex-e-leon](https://github.com/alex-e-leon), [#9684](https://github.com/hashintel/hash/pull/9684))

- `Button` no longer shows a pressed state for `aria-expanded` or emits `aria-pressed`: the `pressed` prop is visual-only, and `Menu` passes pressed state to `Button` through context. ([@alex-e-leon](https://github.com/alex-e-leon), [#10024](https://github.com/hashintel/hash/pull/10024))

- Remove the `style` prop from `TextInput` and `NumberInput`. ([@alex-e-leon](https://github.com/alex-e-leon), [#10031](https://github.com/hashintel/hash/pull/10031))

### Patch Changes

- Fix `OverflowRow` measurement inside fit-content containers, so `Filter` and the naked and multi variants of `Select` and `Combobox` show summary views more consistently. ([@alex-e-leon](https://github.com/alex-e-leon), [#10040](https://github.com/hashintel/hash/pull/10040))

- Add `Combobox` component ([@alex-e-leon](https://github.com/alex-e-leon), [#9806](https://github.com/hashintel/hash/pull/9806))

- Add `multiple` support to `Combobox` ([@alex-e-leon](https://github.com/alex-e-leon), [#9866](https://github.com/hashintel/hash/pull/9866))

- Add `IconProvider`, which overrides named icons within a component tree and keeps the defaults for icons it omits. ([@kube](https://github.com/kube), [#9695](https://github.com/hashintel/hash/pull/9695))

- `Dialog` accepts content refs and inline styles, for movable and resizable layouts. ([@kube](https://github.com/kube))

- `Drawer` accepts `initialFocusRef` and `returnFocusRef` refs that start `null`, as `Popover` does. ([@kube](https://github.com/kube), [#9607](https://github.com/hashintel/hash/pull/9607))

- `Filter` operators can declare select inputs, Select + Inputs handles overflowing content better, and `Select` keyboard navigation follows the APG guidelines more closely. ([@alex-e-leon](https://github.com/alex-e-leon), [#9646](https://github.com/hashintel/hash/pull/9646))

- `Menu` and `SelectableList` items with `subItems` accept a `menuClassName`. ([@CiaranMn](https://github.com/CiaranMn), [#9739](https://github.com/hashintel/hash/pull/9739))

- `Slider` accepts `disabled`, which dims the control and turns its input off. ([@kube](https://github.com/kube), [#9516](https://github.com/hashintel/hash/pull/9516))

- `Slider` gains a `plain` variant with a small fixed-size thumb for dense rows, and its rail spans the slider's root however the root aligns its children. ([@kube](https://github.com/kube), [#9607](https://github.com/hashintel/hash/pull/9607))

- `Slider` treats 0 as a value, and `useElementSize` tracks an element that mounts after the first render. ([@kube](https://github.com/kube), [#9421](https://github.com/hashintel/hash/pull/9421))

- `Slider` accepts `step` and `onChangeEnd`. ([@kube](https://github.com/kube), [#9398](https://github.com/hashintel/hash/pull/9398))

- Add `resolvePandaBuildInfoPath` to `@hashintel/ds-components/preset`, which turns a shipped `panda.buildinfo.json` into a path Panda's `include` accepts on every platform. ([@aacarcrash](https://github.com/aacarcrash), [#9834](https://github.com/hashintel/hash/pull/9834))

- Add header and footer options to `SelectableList`, with minor UI improvements. ([@alex-e-leon](https://github.com/alex-e-leon), [#9584](https://github.com/hashintel/hash/pull/9584))

- Add a `Breadcrumb` component. ([@alex-e-leon](https://github.com/alex-e-leon), [#9502](https://github.com/hashintel/hash/pull/9502))

## 0.3.1

### Patch Changes

- Updated dependencies:
  - @hashintel/ds-helpers@0.2.2

## 0.3.0

### Minor Changes

- Breaking change: Refactor SegmentedControl api and ui ([@alex-e-leon](https://github.com/alex-e-leon), [#9275](https://github.com/hashintel/hash/pull/9275))

- Breaking change: refactor Avatar component to new api + UI ([@alex-e-leon](https://github.com/alex-e-leon), [#9123](https://github.com/hashintel/hash/pull/9123))

- Breaking change: new UI and api for Checkbox component ([@alex-e-leon](https://github.com/alex-e-leon), [#8912](https://github.com/hashintel/hash/pull/8912))

- Breaking change: new Badge api + UI ([@alex-e-leon](https://github.com/alex-e-leon), [#9155](https://github.com/hashintel/hash/pull/9155))

### Patch Changes

- Add Popover component ([@alex-e-leon](https://github.com/alex-e-leon), [#9019](https://github.com/hashintel/hash/pull/9019))

- Add AvatarGroup component ([@alex-e-leon](https://github.com/alex-e-leon), [#9156](https://github.com/hashintel/hash/pull/9156))

- Add `useScrollLock` hook ([@alex-e-leon](https://github.com/alex-e-leon), [#8995](https://github.com/hashintel/hash/pull/8995))

- Add SortMenu component ([@alex-e-leon](https://github.com/alex-e-leon), [#9251](https://github.com/hashintel/hash/pull/9251))

- Added gripVertical icon ([@CiaranMn](https://github.com/CiaranMn), [#9026](https://github.com/hashintel/hash/pull/9026))

- New icons: trend arrows, file lines, grid, print, puzzle piece, truck ([@CiaranMn](https://github.com/CiaranMn), [#8865](https://github.com/hashintel/hash/pull/8865))

- Add Menu component ([@alex-e-leon](https://github.com/alex-e-leon), [#8833](https://github.com/hashintel/hash/pull/8833))

- Add Banner component ([@alex-e-leon](https://github.com/alex-e-leon), [#9163](https://github.com/hashintel/hash/pull/9163))

- Add Filter component ([@alex-e-leon](https://github.com/alex-e-leon), [#9238](https://github.com/hashintel/hash/pull/9238))

- Add Select component ([@alex-e-leon](https://github.com/alex-e-leon), [#8842](https://github.com/hashintel/hash/pull/8842))

- Add CheckboxGroup and RadioGroup components ([@alex-e-leon](https://github.com/alex-e-leon), [#8923](https://github.com/hashintel/hash/pull/8923))

- Fix popover point positioning, improve autofocus for dialogs, drawers + tooltips, and export BaseTooltip ([@alex-e-leon](https://github.com/alex-e-leon), [#9189](https://github.com/hashintel/hash/pull/9189))

- Add Toggle component ([@alex-e-leon](https://github.com/alex-e-leon), [#8871](https://github.com/hashintel/hash/pull/8871))

- Add Chip component ([@alex-e-leon](https://github.com/alex-e-leon), [#9130](https://github.com/hashintel/hash/pull/9130))

- Add ButtonGroup component ([@alex-e-leon](https://github.com/alex-e-leon), [#9164](https://github.com/hashintel/hash/pull/9164))

## 0.2.2

### Patch Changes

- add arrow-right-arrow-left icon ([@CiaranMn](https://github.com/CiaranMn), [#8750](https://github.com/hashintel/hash/pull/8750))

- Adds a Dialog component ([@alex-e-leon](https://github.com/alex-e-leon), [#8802](https://github.com/hashintel/hash/pull/8802))

- Adds Form.Field component ([@alex-e-leon](https://github.com/alex-e-leon), [#8777](https://github.com/hashintel/hash/pull/8777))

## 0.2.1

### Patch Changes

- Add NumberInput component ([@alex-e-leon](https://github.com/alex-e-leon), [#8727](https://github.com/hashintel/hash/pull/8727))

- Updated dependencies:
  - @hashintel/ds-helpers@0.2.1

## 0.2.0

### Minor Changes

- Expose preset-owned `tokens` and `semanticTokens` from `@hashintel/ds-components/tokens` in place of the old `./theme` export, and add generated `@hashintel/ds-helpers/recipes` exports for recipe consumers. ([@lunelson](https://github.com/lunelson), [#8670](https://github.com/hashintel/hash/pull/8670))

### Patch Changes

- New Button component added to design system ([@alex-e-leon](https://github.com/alex-e-leon), [#8687](https://github.com/hashintel/hash/pull/8687))

- Add tooltip component to DS ([@alex-e-leon](https://github.com/alex-e-leon), [#8699](https://github.com/hashintel/hash/pull/8699))

- Added TextInput component to DS ([@alex-e-leon](https://github.com/alex-e-leon), [#8710](https://github.com/hashintel/hash/pull/8710))

- Adds the Icon component ([@alex-e-leon](https://github.com/alex-e-leon), [#8661](https://github.com/hashintel/hash/pull/8661))

- Updated dependencies:
  - @hashintel/ds-helpers@0.2.0

## 0.1.2

### Patch Changes

- Updated dependencies:
  - @hashintel/refractive@0.0.3
  - @hashintel/ds-helpers@0.1.2

## 0.1.1

### Patch Changes

- Fix dependency references ([@CiaranMn](https://github.com/CiaranMn), [#8570](https://github.com/hashintel/hash/pull/8570))

- Updated dependencies:
  - @hashintel/ds-helpers@0.1.1

## 0.1.0

### Minor Changes

- Revamp design token system: Radix-based color generation with semantic bg/fg/bd token structure, expanded 00–120 color scales with OKLCH interpolation, runtime-scalable spacing/radii/line-height via CSS variable factors, and extended conditions. ([@lunelson](https://github.com/lunelson), [#8360](https://github.com/hashintel/hash/pull/8360))

### Patch Changes

- Update Button and Switch components ([@kube](https://github.com/kube), [#8472](https://github.com/hashintel/hash/pull/8472))

- Updated dependencies:
  - @hashintel/ds-helpers@0.1.0

## 0.0.4

### Patch Changes

- Updated dependencies:
  - @hashintel/refractive@0.0.2
  - @hashintel/ds-helpers@0.0.4

## 0.0.3

### Patch Changes

- Updated dependencies:
  - @hashintel/ds-helpers@0.0.3

## 0.0.2

### Patch Changes

- Use @hashintel/refractive ([@kube](https://github.com/kube), [#8137](https://github.com/hashintel/hash/pull/8137))

- Updated dependencies:
  - @hashintel/refractive@0.0.1
  - @hashintel/ds-helpers@0.0.2
