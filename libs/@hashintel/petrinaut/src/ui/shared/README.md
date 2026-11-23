---
layer: ui.shared
role: Components, hooks and constants that views, kits and the preview share, and that import no view and no plugin
---

These are the pieces more than one layer of the UI uses. Each file holds one
piece, and a caller imports the file by its path. A file that a single layer
imports sits in that layer's folder and not here.

Views, kits, the preview and the entry import pieces from here.
`ui/views/shared` is the other shared folder. It holds what the screens under
`ui/views` must agree on, and only they and the preview import it.
[The UI layer](doc:ui/ui-layer) says where a new file goes.

## Interface

| Piece              | Files                                                                                              | What it gives                                                                                                                                                  |
| ------------------ | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sections           | `section.tsx`, `stacked-sections.tsx`                                                              | `Section` and `SectionList` show a part of a form or a drawer under a header that collapses it. `StackedSections` keeps the headers scrolled past in view.     |
| Scroll area        | `overlay-scroll-area.tsx`, `scroll-fade.tsx`, `use-scroll-overflow.ts`                             | A scroll container whose scrollbars lie over the content, and the fades that mark an edge with more to scroll to.                                              |
| Kept state         | `kept-state.tsx`, `use-kept-state.ts`                                                              | `KeptState` goes around what unmounts. Below it, `useKeptState` and `useKeptScroll` find their value again on the next mount.                                  |
| Readings           | `readings.ts`, `use-canvas-insets.ts`                                                              | `useReading`, `styleRef` and `watch` follow a value on every frame without React state. The canvas insets say how much of the canvas the open panels cover.    |
| Glyphs             | `component-glyph.tsx`, `icon-mask.ts`, `entity-icons.tsx`                                          | The icon of a component, drawn from its SVG markup as a mask, and the icons of the entity kinds.                                                               |
| Layout             | `stack.tsx`, `glass-panel.tsx`, `overlay-host.tsx`, `pointer-help-tooltip.tsx`                     | A row or a column, the box of a panel beside the canvas, the element the overlays mount in, and a help tooltip that takes no place in the Tab order.           |
| Fields             | `color-select.tsx`, `use-draft-field.ts`                                                           | The colour picker, and a draft of a value that another source owns.                                                                                            |
| Keyboard shortcuts | `keyboard-shortcut.tsx`                                                                            | `KeyboardShortcut` draws the keys of a shortcut, and `ShortcutTooltip` is a tooltip that shows them after its label.                                           |
| Values and helpers | `ui-constants.ts`, `fonts.ts`, `problem-severity.ts`, `required-context.ts`, `use-element-size.ts` | The sizes of the panels and bars, the code font, the colours of a problem by severity, a context that throws outside its provider, and the size of an element. |

## A section and a sub-view

Both collapse. `Section` is one part of a form or a drawer: it holds its open
state itself and is as tall as its content. A
[sub-view](doc:ui.sub-view/sub-views) is a section of a panel. The panel lists
it as a descriptor, and the container saves whether it is collapsed and how
tall it is in the user settings.

## Protocols

`KeptStateContext` is a map by key. A key belongs to one caller, which gives
the value its type. [The editor shell](doc:ui.views.editor/editor-shell) says
which panels mount a `KeptState` and what they keep.

A reading is a Motion value, or a function computed from the Motion values it
reads. A computed reading is followed through the values it reads on its
first run, so it reads each of them before any condition.
[Panel geometry outside React state](doc:react.state/panel-sizes) says when
to use one.

## Rules

- **No file here imports a view or the plugin runtime.** The views import
  the kits and the kits import pieces, so a piece that imported a view would
  close a cycle. The preview draws with the pieces where no plugin runs. Two
  rules of `archinaut check` hold it.
- **What a `KeptState` holds is dropped when its `scope` changes.** The
  scope names what the values belong to, such as the tab of the bottom panel,
  and a value kept for one tab must not reach another. Held by the test "drops
  what it keeps when its scope changes" in `kept-state.test.tsx`.
- **A reading is followed without rendering the component.** A panel that is
  dragged changes its reading on every pointer move. Held by the test "follows
  a value and a computed reading without rendering the component" in
  `readings.test.tsx`.
- **The scroll area writes a thumb's size and place on the thumb.** A custom
  property on the root is inherited, so each write would restyle all the
  content. Held by the test "sizes and places the thumb on the thumb, and
  writes nothing the content inherits" in `overlay-scroll-area.test.tsx`.
- **`fonts.ts` imports nothing.** The Panda preset imports it, and Panda
  loads the preset in Node when it builds a stylesheet, here and in a host. No
  test holds it: an import that needs the browser fails the stylesheet build.
