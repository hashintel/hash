---
layer: ui.shared
role: Presentation pieces that several views use and that know no panel, no plugin and no view
---

These are the pieces more than one block of the UI draws with. Each file holds
one piece, and a caller imports the file by its path. A file that one block
alone uses sits beside that block and not here.

## Interface

| Piece              | Files                                                                              | What it gives                                                                                                                                               |
| ------------------ | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sections           | `section.tsx`, `stacked-sections.tsx`                                              | `Section` and `SectionList` show a part of a form or a drawer under a header that collapses it. `StackedSections` keeps the headers scrolled past in view.  |
| Scroll area        | `overlay-scroll-area.tsx`, `scroll-fade.tsx`, `use-scroll-overflow.ts`             | A scroll container whose scrollbars lie over the content, and the fades that mark an edge with more to scroll to.                                           |
| Kept state         | `kept-state.tsx`, `use-kept-state.ts`                                              | `KeptState` goes around what unmounts. Below it, `useKeptState` and `useKeptScroll` find their value again on the next mount.                               |
| Readings           | `readings.ts`, `use-canvas-insets.ts`                                              | `useReading`, `styleRef` and `watch` follow a value on every frame without React state. The canvas insets say how much of the canvas the open panels cover. |
| Glyphs             | `component-glyph.tsx`, `icon-mask.ts`, `entity-icons.tsx`, `ai-assistant-icon.tsx` | The icon of a component, drawn from its SVG markup as a mask, and the icons of the entity kinds and of the assistant.                                       |
| Layout             | `stack.tsx`, `glass-panel.tsx`, `overlay-host.tsx`, `pointer-help-tooltip.tsx`     | A row or a column, the box of a panel beside the canvas, the element the overlays mount in, and a help tooltip that takes no place in the Tab order.        |
| Fields             | `color-select.tsx`, `use-draft-field.ts`                                           | The colour picker, and a draft of a value that another source owns.                                                                                         |
| Measuring          | `use-element-size.ts`, `use-element-on-screen.ts`                                  | The size of an element, and whether it overlaps the viewport.                                                                                               |
| Values and helpers | `ui-constants.ts`, `fonts.ts`, `problem-severity.ts`, `required-context.ts`        | The sizes of the panels and bars, the code font, the colours of a problem by severity, and a context that throws outside its provider.                      |

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

- **No file here imports a view or the plugin runtime.** Several views draw
  with a piece, and the preview draws with them where no plugin runs. Two
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
- **`fonts.ts` and `ui-constants.ts` import nothing from React or the
  browser.** The Panda preset reads `fonts.ts` when the stylesheet is built,
  in Node. No test holds it: the stylesheet build fails.
