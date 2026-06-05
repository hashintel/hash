# Actual Mode

Actual mode is used when Petrinaut is opened by a host that can provide a live execution stream. In the demo website, the first supported host is Brunch.

When Actual mode is available, the top-bar mode selector enables **Actual** and Petrinaut opens on that tab by default. The canvas shows the Petri net from the live source. The document is read-only: you can pan, zoom, select items, inspect properties, export the net, and switch to the other global modes, but you cannot change places, transitions, arcs, parameters, types, or dynamic behaviour.

## Brunch live runs

The demo website enables Actual mode on the `/brunch` route when the URL includes a Brunch stream endpoint:

```text
/brunch?brunch_endpoint=<Brunch stream URL>
```

Petrinaut connects to the stream, waits for the Petri net definition and initial state, lays out the net if the stream did not include node positions, and then shows the net in Actual mode.

If the stream cannot be reached or sends invalid data, Petrinaut shows an error page with a link back to the normal demo site.

## Timeline and events

Actual mode opens the bottom panel with an Actual timeline once execution data is available. The timeline can be scrubbed to inspect the net state at earlier points in the received stream.

The bottom panel also includes an **Events** tab. It shows the received transition stream in order, including each event timestamp, transition id, input tokens, and output tokens. Use **Export JSON** in this tab to download an Actual-mode recording containing the net definition, initial state, and all received transition events.

Each exported transition event stores the firing effect rather than a full before/after snapshot. The `input` and `output` fields are numeric count maps keyed by place id:

```json
{
  "transitionId": "start_implementation",
  "input": { "queued": 1 },
  "output": { "implementing": 1 },
  "ts": "2026-06-05T17:17:27.866Z"
}
```

The exported JSON can be replayed with the Petrinaut CLI:

```sh
yarn workspace @hashintel/petrinaut-cli replay ./recording.petrinaut-actual.json
```

The replay server prints a `/brunch?brunch_endpoint=...` URL that can be opened in the demo website. During replay, the first recorded event is shifted to the current launch time and every later event keeps its original relative delay.

## Current limits

The Brunch route opens a basic Petri net view with Petrinaut extensions disabled: no colours, stochasticity, dynamics, or parameters.
