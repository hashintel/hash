# The properties panel

The panel on the right of the editor shows and edits the properties of what is selected. `panel.tsx` declares its layer, `ui.views.editor.properties`.

## Interface

Other blocks import these files:

- `panel.tsx` exports `PropertiesPanel`, the docked panel that the editor shell mounts.
- `selected-item-properties.tsx` exports `SelectedItemProperties`, which picks the component for a `PanelTarget`. The preview renders it too, so the editor and the preview show the same properties.

## The folder of an item kind

Each kind of item has a folder named `<kind>-properties`, and a selection of several items has `multi-selection-properties`. Every such folder has the same parts:

| Part           | What it holds                                                                                                                                                          |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `main.tsx`     | The component of the kind. It resolves what the sections need, provides it through the context and renders the sections that apply in one `VerticalSubViewsContainer`. |
| `context.ts`   | A required context with the item and what `main.tsx` resolved for it. A section reads the context and takes no props.                                                  |
| `sub-views.ts` | One `SubView` descriptor per section. A `.tsx` file exports components only, so the descriptors have a file of their own.                                              |
| `subviews/`    | The component of each section. `subviews/main.tsx` is the first section, the one that names the item.                                                                  |

The context of `multi-selection-properties` differs: it is a plain context that holds the selected items and defaults to an empty list.

The other files at the top level are what several kinds share. The guide of `ui/sub-view` describes a descriptor and the container.

## Adding an item kind

1. Add the kind to `SelectionItem` in Core, so that a `PanelTarget` can carry it.
2. Create `<kind>-properties/` with the parts above. Give the container a `name` of its own: the user's settings store the state of its sections under that name.
3. Add a case to the switch in `selected-item-properties.tsx` that finds the item in the active net and renders the component. A kind without a case renders nothing.
4. If a section holds code, add it to `editor-view/code-navigation-provider.tsx`, which opens a section by the `name` of its container and the `id` of its descriptor. Both are strings, so search for them before a rename.
