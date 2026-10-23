# Actual Mode

Actual mode shows an execution that happened, or is happening, outside Petrinaut: the host application supplies a Petri net, its initial state and the transitions that fired, instead of Petrinaut simulating them. Where that execution comes from is up to the host.

When Actual mode is available, the top-bar mode selector enables **Actual** and Petrinaut opens on that tab by default. The canvas shows the Petri net supplied by the host. The document is read-only: you can pan, zoom, select items, inspect properties, export the net, and switch to the other global modes, but you cannot change places, transitions, arcs, parameters, types, or dynamic behaviour.

While the host is still connecting or waiting for the net, and if the host reports an error, what you see is up to the host application.

## Timeline and events

Actual mode opens the bottom panel with an Actual timeline once execution data is available. The timeline can be scrubbed to inspect the net state at earlier points in the execution. Use the series selector below the chart to show, hide, or focus individual traces. Hover a trace and click the eye icon to hide it -- it stays in place, struck through, until the pointer leaves the selector, so a second click undoes the change -- or open the dropdown to search and use **Only**.

The bottom panel also includes an **Events** tab. It shows the transitions that fired, in order, including each event timestamp, transition name, and the input and output tokens by place name. An unnamed transition or place shows its id.

## Exporting

Use the **Export** dropdown in the Events tab:

- **Export Recording** downloads a JSON recording of the execution as Petrinaut shows it: the net, its initial state, every transition firing, and the host's source id and label.
- **Export Net** downloads a normal Petrinaut net file (YAML). This file contains the read-only Petri net currently shown in Actual mode and can be imported back into Petrinaut like other net exports.

In a recording, each transition firing stores its effect rather than a full before/after snapshot. The `input` and `output` fields are numeric count maps keyed by place id:

```json
{
  "transitionId": "start_implementation",
  "input": { "queued": 1 },
  "output": { "implementing": 1 },
  "ts": "2026-06-05T17:17:27.866Z"
}
```

## Current limits

Transition firings carry token counts per place, not the values of coloured tokens.
