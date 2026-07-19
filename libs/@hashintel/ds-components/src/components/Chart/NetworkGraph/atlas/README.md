# SALTILE client companion

Client-side contract notes for the `atlas/` modules. The normative
sources are `SPEC-ADDENDUM-WIRE.md` (envelope, slots, HEAD schemas)
and `SPEC-ADDENDUM-API.md` (routes, manifest, errors) in
`libs/@local/graph/atlas`; this document states what a consumer of
these modules needs in client vocabulary, and pins the conventions
that are deliberately absent from the wire.

## Module map

| Module                | Role                                                                                           |
| --------------------- | ---------------------------------------------------------------------------------------------- |
| `saltile-wire.ts`     | Envelope reader: prefix, kind dispatch, offset directory, payload extents.                     |
| `saltile-cbor.ts`     | RFC 8949 deterministic-subset reader for HEAD and trailer maps.                                |
| `saltile-schema.ts`   | Shared HEAD guards (echo checks, typed accessors).                                             |
| `saltile-tile.ts`     | Tile decoder: HEAD validation, zero-copy column views.                                         |
| `saltile-edges.ts`    | Edges decoder.                                                                                 |
| `saltile-client.ts`   | `AtlasClient`: bootstrap, session, POST + decode, app-layer cache, manifest limit enforcement. |
| `saltile-frontier.ts` | `AtlasFrontier`: delta-accumulation session state, `children`-guided descent.                  |

Decoded columns are typed-array views over the response
`ArrayBuffer` - never copies. `POSITIONS` is interleaved xy with
stride 8, directly usable as a vec2 vertex attribute.

## Coordinate frame

Positions arrive in the wire frame: each axis spans `[-1, 1]`, as
`f32`. The server fits a world frame over the generation's canonical
coordinates and normalizes each axis onto `[-1, 1]` in `f64` with one
final rounding to `f32` (`salt/lod/stage.rs`), so the wire column is
within one `f32` ULP of exact everywhere.

The world frame is not exposed: the manifest carries nothing
corpus-derived (auth post-intersection contract), and clients never
need it - positions are already wire-frame. The camera framing datum
is per-request instead: the root tile's HEAD `global.bounds` is the
tight wire-frame extent `[minX, minY, maxX, maxY]` of the visible
(post-auth, post-filter) set, `null` iff that set is empty.

## Y-orientation

The wire deliberately carries no y-orientation. The map is a fitted
semantic layout with no inherent "up"; wire y increases in the same
direction as the projector's second axis, which has no meaning a
client must preserve.

What must stay consistent is internal: tile row `y` indexes the wire
y axis (row 0 starts at wire `y = -1`), so tile addressing, HEAD
`global.bounds`, and position values all speak the same axis. A
renderer may map wire y to screen y either way (a +y-down mapping
mirrors the layout - legal), but any viewport-to-tile math must be
done in the wire frame, not in screen coordinates.

## Tile grid

A tile coordinate `(z, x, y)` names one cell of the `2^z` by `2^z`
grid over the wire frame; `maxZoom` (the deepest requestable `z`)
comes from the manifest's `bucketSchedule`, never a constant. Each
axis cell spans `2 / 2^z` wire units, half-open except at the +1.0
edge:

```
tile x covers wireX in [-1 + 2 * x / 2^z, -1 + 2 * (x + 1) / 2^z)
tile y covers wireY in [-1 + 2 * y / 2^z, -1 + 2 * (y + 1) / 2^z)
```

Points exactly on the `+1.0` frame edge belong to the last cell (see
the quantizer below).

### Morton child convention

The server interleaves x into the even bits and y into the odd bits
of its Morton keys (`src/morton`), so the four children of a cell are
ordered with x in the low bit:

```
child i of (z, x, y)  =  (z + 1, 2 * x + i % 2, 2 * y + floor(i / 2))

i = 0: (2x,     2y)         i = 1: (2x + 1, 2y)
i = 2: (2x,     2y + 1)     i = 3: (2x + 1, 2y + 1)
```

The tile HEAD's `children` bitmask uses these indexes: bit `i` set
means Morton child `i` holds points below the tile's cut; `0` means
nothing deeper exists (the completeness signal, both modes). A
descending client walks exactly the set bits - `AtlasFrontier`
implements this walk.

## Quantizer

The server quantizes each wire axis onto a 32-bit grid to build its
Morton keys (`salt/lod/key.rs`): the axis maps affinely onto
`[0, 2^32)` in `f64` and floors, with out-of-range values clamping
onto the boundary cells. For the fixed `[-1, 1]` wire frame the exact
map, reproducible in JavaScript because every step is `f64`:

```js
const AXIS_CELLS = 2 ** 32;
const quantize = (value) =>
  Math.min(
    AXIS_CELLS - 1,
    Math.max(0, Math.floor(((value + 1) / 2) * AXIS_CELLS)),
  );
```

JavaScript numbers are IEEE 754 `f64` and this is the server's own
operation sequence (`value - min`, divide by the extent, scale by
`2^32`, floor-with-clamp), so the results are bit-identical - not
because each step is exact, but because both sides round identically.
The server built its keys from the same `f32` wire column it serves,
so a client recomputes the server's cells loss-free from delivered
positions. The `+1.0` edge clamps into the last cell. Points closer
than one `f32` coordinate ULP share cells; nothing else does.

Derived cells:

```
axis cell at depth d  =  floor(quantize(value) / 2^(32 - d))
```

Tile membership at zoom `z` uses depth `z`; the bucket-schedule cut
grid at zoom `z` uses depth `z + m` (see below). Client-side cell
recomputation is what the enshrined-deferred MASS channel's
recurrence consumes at revival (WIRE section 10); nothing in v1
requires it.

## Bucket schedule and delivery modes

The manifest's `bucketSchedule.span` is the per-tile sample grid
width, a power of two; `m = log2(span)` (the `AtlasSession` exposes
it as `spanLog2`). A tile at zoom `z` delivers points bucketed at or
below its cut `z + m`.

- `delta` (the default): a tile carries only its own cut's points.
  The root carries buckets `0..=m` (`m + 1` runs); a deeper tile
  carries exactly one run, its own cut's. The full set for a cell is
  the union along its ancestor chain, and each point arrives exactly
  once per accumulation identity. An arriving point's bucket is the
  response's cut (root: `firstBucket` plus its run index).
- `total`: self-contained through the cut - `cut + 1` runs from
  bucket 0, repeating what ancestors would have delivered. A point's
  bucket is `firstBucket` plus its run index.

`AtlasFrontier` accumulates delta responses only and rejects a
total-shaped decode structurally. One frontier is valid for exactly
one accumulation identity - `(generation, variant, filter,
coloredTypeIds)`; any change means a fresh frontier.

## Point identity

`ROW_IDS` entries are generation-local row numbers (`u32`);
`0xFFFFFFFF` is a reserved sentinel and is never delivered. Row ids
are stable within a generation and meaningless across generations.

## TYPE_MASK

Present iff the request sent `coloredTypeIds`. Point `p`'s bitmask
occupies `ceil(n / 8)` bytes at byte offset `p * ceil(n / 8)`; bit
`i` lives in byte `floor(i / 8)` at in-byte position `i % 8`,
least-significant first, and means the point carries the request's
type `i`. The zero mask is "no match". Requested ids that resolve to
nothing in the generation are legal and read 0 everywhere, so a
stale client survives generation rotation. Multi-match is native:
which color paints, blends, or badges is the client's policy.

## Caching and identity

Responses are `private, no-store`; the app-layer cache in
`AtlasClient` keys on `(generation, route, canonical request body)`
via `stableStringify`. The manifest is immutable per generation.
There is no invalidation in v1 - the bound is generation rotation,
which a client observes through `GET /v1/atlas/current`.

## Validation split

Decoders validate structure and the request echo (byte extents, runs
arithmetic, HEAD schema, generation/coordinate/mode echoes) and throw
named errors carrying byte offsets. Per-point semantic validation is
publish evidence on the server side - by contract, not omission
(WIRE section 7). Cross-language correctness is proven by shared
golden fixture bytes (G1-G10) pinned against the Rust encoder, never
asserted by eye.
