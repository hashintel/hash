# Actual Mode

Actual mode is used when Petrinaut is opened by a host that can provide a live execution stream. In the demo website, the first supported host is Brunch.

When Actual mode is available, the top-bar mode selector enables **Actual** and Petrinaut opens on that tab by default. The canvas shows the Petri net from the live source. The document is read-only: you can pan, zoom, select items, inspect properties, export the net, and switch to the other global modes, but you cannot change places, transitions, arcs, parameters, types, or dynamic behaviour.

## Brunch live runs

The demo website enables Actual mode on the `/brunch` route when the URL includes a Brunch stream endpoint:

```text
/brunch?sse=<Brunch stream URL>
```

Petrinaut connects to the stream, waits for the Petri net definition and initial state, lays out the net if the stream did not include node positions, and then shows the net in Actual mode.

If the stream connection is interrupted, Petrinaut keeps any loaded Actual mode data visible and waits for the browser to reconnect. If the stream sends invalid data, Petrinaut shows an error page with a link back to the normal demo site.

## Timeline and events

Actual mode opens the bottom panel with an Actual timeline once execution data is available. The timeline can be scrubbed to inspect the net state at earlier points in the received stream. Use the searchable series selector below the chart to show, hide, or focus individual traces.

The bottom panel also includes an **Events** tab. It shows the received transition stream in order, including each event timestamp, transition id, input tokens, and output tokens. Use the **Export** dropdown in this tab to download either the received event stream or the current Petri net.

Choose **Export Stream** to download the received event stream. Brunch stream exports preserve the raw JSON payloads received from the SSE endpoint instead of the normalized SDCPN used internally for rendering.

Choose **Export Net** to download a normal Petrinaut JSON net file. This file contains the read-only Petri net currently shown in Actual mode and can be imported back into Petrinaut like other net exports.

For Brunch, the export is a JSON object with an `events` array. Each item stores the SSE event name and the parsed JSON payload exactly as Petrinaut received it. Transition payloads store the firing effect rather than a full before/after snapshot. The `input` and `output` fields are numeric count maps keyed by place id:

```json
{
  "transitionId": "start_implementation",
  "input": { "queued": 1 },
  "output": { "implementing": 1 },
  "ts": "2026-06-05T17:17:27.866Z"
}
```

The stream export is an event-stream artifact for tooling that can serve the Brunch SSE protocol. The demo website does not replay the file directly.

## Current limits

The Brunch route opens a basic Petri net view with Petrinaut extensions disabled: no colours, stochasticity, dynamics, or parameters.
