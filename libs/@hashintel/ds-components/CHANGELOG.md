# @hashintel/ds-components

## 0.5.1

### Patch Changes

- Export rehype-markdown-class for mdx doc consumers ([#10265](https://github.com/hashintel/hash/pull/10265))

## 0.5.0

### Minor Changes

- Clear optional single `Select` and `Combobox` values with the clear button instead of an empty first option. A single select that is not `required` is always clearable. A `required` one can opt in with `clearable`, which lets `onChange` receive `null`. The `Select` clear button now sits beside the dropdown arrow at a size per select size, drawn with the same stroke width as the arrow. ([#9982](https://github.com/hashintel/hash/pull/9982))

### Patch Changes

- Add a `circleClose` icon ([#10162](https://github.com/hashintel/hash/pull/10162))

- Give the `HelpTooltip` trigger an accessible name: it is now exposed as `role="img"` named "Information", overridable via a new `aria-label` prop. `Tooltip` accepts `aria-label` and `role` for icon-only triggers whose wrapper is the focusable element. ([#10205](https://github.com/hashintel/hash/pull/10205))

- Publish mdx docs for components

## 0.4.0

### Minor Changes

- `clearable` on `Select`, `TextInput` and `NumberInput` is now `boolean | { onClear }`, and `searchable` on `Select` is `boolean | { onSearch?, hideCount?, hideSelectAllToggle? }`. `Banner`'s `dismissible` is now `false | { onDismiss }`, and `removeable` on `Chip` and `Filter` is `false | { onRemove }`. These replace the previous object shapes with an inner enabled flag. ([#9646](https://github.com/hashintel/hash/pull/9646))

- Per-component subpaths (`@hashintel/ds-components/<name>`) export only components: import `iconNames`, `ChipSize` and `useFieldId` from the root, and `FieldIdProvider` from `/field-id-provider` instead of `/field-id-context`. ([#9966](https://github.com/hashintel/hash/pull/9966))

- `renderSelectedItem` now renders one selected value inside the multi select's trigger, and a string result also supplies that value's summary text. The new `renderSelectedAll` renders the whole selection, as `renderSelectedItem` did before, and `Filter` multi-select inputs accept both. ([#9684](https://github.com/hashintel/hash/pull/9684))

- `Button` no longer shows a pressed state for `aria-expanded` or emits `aria-pressed`: the `pressed` prop is visual-only, and `Menu` passes pressed state to `Button` through context. ([#10024](https://github.com/hashintel/hash/pull/10024))

- Remove the `style` prop from `TextInput` and `NumberInput`. ([#10031](https://github.com/hashintel/hash/pull/10031))

### Patch Changes

- Fix `OverflowRow` measurement inside fit-content containers, so `Filter` and the naked and multi variants of `Select` and `Combobox` show summary views more consistently. ([#10040](https://github.com/hashintel/hash/pull/10040))

- Add `Combobox` component ([#9806](https://github.com/hashintel/hash/pull/9806))

- Add `multiple` support to `Combobox` ([#9866](https://github.com/hashintel/hash/pull/9866))

- Add `IconProvider`, which overrides named icons within a component tree and keeps the defaults for icons it omits. ([#9695](https://github.com/hashintel/hash/pull/9695))

- `Dialog` accepts content refs and inline styles, for movable and resizable layouts.

- `Drawer` accepts `initialFocusRef` and `returnFocusRef` refs that start `null`, as `Popover` does. ([#9607](https://github.com/hashintel/hash/pull/9607))

- `Filter` operators can declare select inputs, Select + Inputs handles overflowing content better, and `Select` keyboard navigation follows the APG guidelines more closely. ([#9646](https://github.com/hashintel/hash/pull/9646))

- `Menu` and `SelectableList` items with `subItems` accept a `menuClassName`. ([#9739](https://github.com/hashintel/hash/pull/9739))

- `Slider` accepts `disabled`, which dims the control and turns its input off. ([#9516](https://github.com/hashintel/hash/pull/9516))

- `Slider` gains a `plain` variant with a small fixed-size thumb for dense rows, and its rail spans the slider's root however the root aligns its children. ([#9607](https://github.com/hashintel/hash/pull/9607))

- `Slider` treats 0 as a value, and `useElementSize` tracks an element that mounts after the first render. ([#9421](https://github.com/hashintel/hash/pull/9421))

- `Slider` accepts `step` and `onChangeEnd`. ([#9398](https://github.com/hashintel/hash/pull/9398))

- Add `resolvePandaBuildInfoPath` to `@hashintel/ds-components/preset`, which turns a shipped `panda.buildinfo.json` into a path Panda's `include` accepts on every platform. ([#9834](https://github.com/hashintel/hash/pull/9834))

- Add header and footer options to `SelectableList`, with minor UI improvements. ([#9584](https://github.com/hashintel/hash/pull/9584))

- Add a `Breadcrumb` component. ([#9502](https://github.com/hashintel/hash/pull/9502))

## 0.3.1

### Patch Changes

- Updated dependencies:
  - @hashintel/ds-helpers@0.2.2

## 0.3.0

### Minor Changes

- Breaking change: Refactor SegmentedControl api and ui ([#9275](https://github.com/hashintel/hash/pull/9275))

- Breaking change: refactor Avatar component to new api + UI ([#9123](https://github.com/hashintel/hash/pull/9123))

- Breaking change: new UI and api for Checkbox component ([#8912](https://github.com/hashintel/hash/pull/8912))

- Breaking change: new Badge api + UI ([#9155](https://github.com/hashintel/hash/pull/9155))

### Patch Changes

- Add Popover component ([#9019](https://github.com/hashintel/hash/pull/9019))

- Add AvatarGroup component ([#9156](https://github.com/hashintel/hash/pull/9156))

- Add `useScrollLock` hook ([#8995](https://github.com/hashintel/hash/pull/8995))

- Add SortMenu component ([#9251](https://github.com/hashintel/hash/pull/9251))

- Added gripVertical icon ([#9026](https://github.com/hashintel/hash/pull/9026))

- New icons: trend arrows, file lines, grid, print, puzzle piece, truck ([#8865](https://github.com/hashintel/hash/pull/8865))

- Add Menu component ([#8833](https://github.com/hashintel/hash/pull/8833))

- Add Banner component ([#9163](https://github.com/hashintel/hash/pull/9163))

- Add Filter component ([#9238](https://github.com/hashintel/hash/pull/9238))

- Add Select component ([#8842](https://github.com/hashintel/hash/pull/8842))

- Add CheckboxGroup and RadioGroup components ([#8923](https://github.com/hashintel/hash/pull/8923))

- Fix popover point positioning, improve autofocus for dialogs, drawers + tooltips, and export BaseTooltip ([#9189](https://github.com/hashintel/hash/pull/9189))

- Add Toggle component ([#8871](https://github.com/hashintel/hash/pull/8871))

- Add Chip component ([#9130](https://github.com/hashintel/hash/pull/9130))

- Add ButtonGroup component ([#9164](https://github.com/hashintel/hash/pull/9164))

## 0.2.2

### Patch Changes

- Add arrow-right-arrow-left icon ([#8750](https://github.com/hashintel/hash/pull/8750))

- Adds a Dialog component ([#8802](https://github.com/hashintel/hash/pull/8802))

- Adds Form.Field component ([#8777](https://github.com/hashintel/hash/pull/8777))

## 0.2.1

### Patch Changes

- Add NumberInput component ([#8727](https://github.com/hashintel/hash/pull/8727))

- Updated dependencies:
  - @hashintel/ds-helpers@0.2.1

## 0.2.0

### Minor Changes

- Expose preset-owned `tokens` and `semanticTokens` from `@hashintel/ds-components/tokens` in place of the old `./theme` export, and add generated `@hashintel/ds-helpers/recipes` exports for recipe consumers. ([#8670](https://github.com/hashintel/hash/pull/8670))

### Patch Changes

- New Button component added to design system ([#8687](https://github.com/hashintel/hash/pull/8687))

- Add tooltip component to DS ([#8699](https://github.com/hashintel/hash/pull/8699))

- Added TextInput component to DS ([#8710](https://github.com/hashintel/hash/pull/8710))

- Adds the Icon component ([#8661](https://github.com/hashintel/hash/pull/8661))

- Updated dependencies:
  - @hashintel/ds-helpers@0.2.0

## 0.1.2

### Patch Changes

- Updated dependencies:
  - @hashintel/refractive@0.0.3
  - @hashintel/ds-helpers@0.1.2

## 0.1.1

### Patch Changes

- Fix dependency references ([#8570](https://github.com/hashintel/hash/pull/8570))

- Updated dependencies:
  - @hashintel/ds-helpers@0.1.1

## 0.1.0

### Minor Changes

- Revamp design token system: Radix-based color generation with semantic bg/fg/bd token structure, expanded 00–120 color scales with OKLCH interpolation, runtime-scalable spacing/radii/line-height via CSS variable factors, and extended conditions. ([#8360](https://github.com/hashintel/hash/pull/8360))

### Patch Changes

- Update Button and Switch components ([#8472](https://github.com/hashintel/hash/pull/8472))

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

- Use @hashintel/refractive ([#8137](https://github.com/hashintel/hash/pull/8137))

- Updated dependencies:
  - @hashintel/refractive@0.0.1
  - @hashintel/ds-helpers@0.0.2
