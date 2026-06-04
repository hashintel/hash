# Actual Mode

Actual mode is used when Petrinaut is opened by a host that can provide a live execution stream. In the demo website, the first supported host is Brunch.

When Actual mode is available, the top-bar mode selector enables **Actual** and Petrinaut opens on that tab by default. The canvas shows the Petri net from the live source. The document is read-only: you can pan, zoom, select items, inspect properties, export the net, and switch to the other global modes, but you cannot change places, transitions, arcs, parameters, types, or dynamic behaviour.

## Brunch live runs

The demo website enables Actual mode on the `/brunch` route when the URL includes a Brunch stream endpoint:

```text
/brunch?brunch_endpoint=<Brunch stream URL>
```

The route also accepts Brunch launcher URLs that use:

```text
/brunch?mode=actual&sse=<Brunch stream URL>&runId=<run id>
```

Petrinaut connects to the stream, waits for the Petri net definition and initial state, lays out the net if the stream did not include node positions, and then shows the net in Actual mode.

While the stream is open, Petrinaut opens the bottom **Actual Timeline** panel. The timeline plots the current marking over time and advances once per second even between transition events. When a new transition event arrives, the timeline adds the event frame and updates the place token counts on the canvas.

Click or drag in the Actual Timeline to scrub through the streamed history. The canvas follows the selected timeline frame so you can inspect the state after each event or at each elapsed-time tick. When you scrub back to the latest frame, the timeline resumes following the live end of the stream.

If the stream cannot be reached or sends invalid data, Petrinaut shows an error page with a link back to the normal demo site.

## Current limits

Actual mode currently renders the marking timeline, but it does not render a separate event list yet.

The Brunch route opens a basic Petri net view with Petrinaut extensions disabled: no colours, stochasticity, dynamics, or parameters.
