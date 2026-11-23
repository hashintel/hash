---
layer: ui.plugins.built-in
role: The plugins the editor always runs, the FPS counter and the Document view, written against the public plugin API
---

`<Petrinaut>` passes these plugins to the runtime before the host's own, so
every editor runs them. Each is written the way a host writes one: it imports
the plugin API from `ui/plugin.ts` and nothing of the runtime.
[Writing a plugin](doc:ui.plugins/writing-a-plugin) is the manual.

## Interface

| File                       | Plugin                                   | What it adds                                                                                                                    |
| -------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `fps-counter-plugin.tsx`   | `fpsCounterPlugin`, id `hash.fps`        | A setting and a command that show a draggable counter of the browser's frame rate.                                              |
| `document-view-plugin.tsx` | `documentViewPlugin`, id `hash.document` | A setting that adds the Document data tab to the bottom panel: the net as the document's handle holds it, and its last changes. |

The parts of a plugin are in the folder of its name.

## Rules

- **The id of a plugin does not change.** Its settings are stored under
  `petrinaut:plugin:<id>`, so a new id reads every setting as its default.
  Held by the tests of each plugin, which read the stored settings under
  `petrinaut:plugin:hash.fps` and `petrinaut:plugin:hash.document`.
- **A plugin shows nothing until its setting is on.** Both settings start
  off, so an editor that never opens them pays for neither. Held by the tests
  "samples only while visible and stops when closed" in
  `fps-counter-plugin.test.tsx` and "adds no tab until its setting is switched
  on" in `document-view-plugin.test.tsx`.
- **A built-in plugin imports the plugin API through `ui/plugin.ts`.** A
  plugin that needed more than a host gets would hide a gap in the API. No
  check holds it.
