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
concurrency. Exact visible bounds and padded request bounds are tracked
separately: overscan warms the cache for an approaching pan but cannot force a
visible cell back to a coarser ancestor. An active parent remains visible until
its relevant direct children are ready, at which point they replace it
atomically. Active cells are disjoint, and each delivered representative
receives:

```text
mass = visible_subtree_count / delivered_count
```

The initial complete-square frontier is used once to discover the delivered
content extent. The camera then fits that extent rather than leaving a compact
generation tiny inside its 16-bit quantization envelope.

Rendering separates context from identity. An `Effect.preRender` pass splats
mass additively into a blendable `rg16float` target (`rgba16float` fallback),
with total density in R and G reserved for a future matched-density field.
Coarser delivering tiles use wider kernels, but these kernels appear only in a
restrained neutral glow. A threshold-free, log-exposed fullscreen composite
keeps low density continuous instead of cutting tile-shaped coastlines into the
image. A throttled 128 by 128 GPU downsample and float readback derives exposure
from the positive-density 95th percentile.

A binary `ScatterplotLayer` then draws small antialiased screen-space marks
above the glow. Because the server caps every tile independently, rendering
every delivered record would make all saturated tiles look equally dense.
Packing instead chooses a deterministic prefix from each tile against the
largest active representative mass, so mark counts remain proportional to
`visible_subtree_count` while preserving the server's spatial first-occupant
order. The particle frontier stays four tile levels coarser than the density
frontier, keeping independently capped tile edges several viewports away
instead of exposing them as rectangles in the overview. Generation row IDs and
a fixed neutral RGB remain attached to the selected marks. Parent
representatives that survive in a refined child union therefore keep the same
mark identity and radius while new child-only rows can appear. The UI reports
an unsupported-GPU state when neither half-float format can be blended.

## Deliberate limits

The current API exposes the total field only. This demo does not invent:

- filter or comparison fields;
- per-point colors;
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

The scalar density texture is deliberately color-agnostic. When the wire format
adds designated point colors, they can populate the packed mark RGB plane while
retaining mass-derived alpha; the neutral density glow remains beneath those
marks and does not wash out their hue.

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
visible/prefetch isolation, request cancellation, atomic replacement, LRU
behavior, row continuity, mark attributes, exposure, and mass preservation.
