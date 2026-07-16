# Atlas tile-field demo

Temporary engineering demo for the current Atlas tile API. It bootstraps the
active immutable generation, maintains a cancellable quadtree frontier, and
reconstructs the total-density field in a deck.gl/luma.gl multipass renderer.

## Prerequisites

1. Fit and activate an Atlas generation.
2. Start the Atlas server on its default loopback address:

   ```sh
   cargo run -p hash-graph-atlas --bin hash-graph-atlas -- \
     serve --config ./atlas-server.json
   ```

   See `libs/@local/graph/atlas/COOKBOOK.md` for generation, activation, trust,
   and serving configuration. An evidence-deferred generation requires
   `allow_evidence_deferred: true` in a server intentionally configured for
   that assurance mode.

3. Use Node.js 22.21 or newer with Corepack enabled.

## Run

This directory is a standalone Yarn project. Run commands from
`tools/atlas-demo`; it is intentionally not part of the root workspace.

```sh
corepack yarn install
yarn dev
```

Vite proxies `/v1/atlas` to `http://127.0.0.1:4010` by default. Point it at a
different Atlas server with:

```sh
ATLAS_API_ORIGIN=http://127.0.0.1:8080 yarn dev
```

The backend currently has no CORS layer. A deployed production build must
therefore serve the static files and reverse-proxy `/v1/atlas` from the same
origin.

## Controls

- Drag to pan and scroll to zoom.
- Focus the field and use arrow keys to pan, `+`/`-` to zoom, or `Home` to
  restore the fitted generation extent.
- **Tile frames** overlays scheduler cells. Labels make the states
  color-independent: `A` active, `L` loading, `Q` queued, and `E` failed.
- **Reset view** fits the delivered generation extent with viewport padding.
- **Reload** bootstraps the current generation and manifest again.
- **Retry tiles** appears when a frontier request fails without discarding its
  ready parent.

## Architecture

The client validates `/v1/atlas/current` against
`/v1/atlas/current/manifest`, selects the canonical variant, and accepts only
the `u32` row encoding used by `ATLTILE2`.

Every binary response is checked before rendering: media type, 160-byte header,
magic, version, route coordinates, exact length, generation identity, store
snapshot identity, manifest identity, release-report identity, counts, flags,
and point bounds. Empty tiles are valid cached responses.

The scheduler requests the root first and then visible levels with bounded
concurrency. An active parent remains visible until all relevant direct
children are ready, at which point the children replace it atomically. Active
cells are disjoint, and each delivered representative receives:

```text
mass = visible_subtree_count / delivered_count
```

The initial complete-square frontier is used once to discover the delivered
content extent. The camera then fits that extent rather than leaving a compact
generation tiny inside its 16-bit quantization envelope.

An `Effect.preRender` pass splats that mass additively into a blendable
`rg16float` target (`rgba16float` fallback). A normal custom layer composites
sea level, logarithmic relief, coastline, hillshade, and derivative-based
isolines. Coarser delivering tiles use wider kernels according to the companion
field-band formula. A throttled 128 by 128 GPU downsample and float readback
targets the reference field's 53% void fraction and supplies a stable relief
scale. The UI reports an unsupported-GPU state when neither half-float format
can be blended.

## Deliberate limits

The current API exposes the total field only. This demo does not invent:

- filter or comparison fields;
- alpha/rung transitions;
- region or class labels;
- entity identity lookup;
- selection or product navigation.

Coordinates remain in native Morton space. The serving manifest does not
publish content bounds, so the fitted extent is inferred from the settled
initial frontier and padded.

`ATLTILE2` also does not carry a per-representative support mass. The demo uses
the specified tile-wide `visible_subtree_count / delivered_count` weight. A
server whose importance-first prefix is not spatially representative can still
show residual tile-shaped density bias; eliminating that requires a wire plane
for support mass or a representative sampling contract, not a client-side
color adjustment.

## Verify

```sh
yarn lint:format
yarn lint:eslint
yarn lint:tsc
yarn test:unit
yarn build
```

`yarn verify` runs all of the checks above. The unit fixtures mirror the Rust
wire layout and cover bootstrap validation, binary corruption, coordinates,
viewport selection, request cancellation, atomic replacement, LRU behavior,
and mass preservation.
