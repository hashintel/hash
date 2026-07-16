# Atlas tile wire v2

The tile API exposes bounded spatial slices of the active SALT generation:

```text
GET /v1/atlas/tile/{generation}/{variant}/{z}/{x}/{y}
```

`generation` must equal the active generation ID. `variant` must name a
published materialized variant; the current server exposes the canonical
variant. Zoom is in `0..=16`, and both `x` and `y` must be below `2^z`.

## Quadrants and delivery order

Coordinates are quantized independently to unsigned 16-bit axes. Their bits are
interleaved into a 32-bit Morton key, with x in even bits and y in odd bits.
The tile coordinate selects the leading `z` bits of each axis. Equivalently,
the server computes:

```text
axis_shift = 16 - z
prefix = morton(x << axis_shift, y << axis_shift) >> (2 * axis_shift)
range = [prefix << (2 * axis_shift), (prefix + 1) << (2 * axis_shift))
```

The canonical base stores points in importance-bucket order and Morton order
within each bucket. The server binary-searches that range independently in
every bucket, scans buckets from highest to lowest delivery priority, and
backfills until `tile_point_budget` records have been selected. It always
computes `visible_subtree_count` across every bucket, even when the delivery
is truncated.

Two guarantees keep truncated and partially consumed responses spatially
fair rather than biased toward the Z-curve prefix (a staircase-shaped region
of the tile):

- **Fair truncation.** When the budget lands inside a bucket, the server
  midpoint-stride samples that bucket's full Morton range (one pick per equal
  stratum) instead of cutting a Morton prefix, so the delivered set covers
  the whole tile.
- **Progressive order.** Within each bucket, delivered records are ordered by
  the ascending bit-reversed tile-local Morton suffix (van der Corput order).
  Coarse quadrant bits become the least significant rank bits, so every
  client-side prefix of the response is a spatially stratified subset:
  clients may render or subsample any prefix without introducing spatial
  bias. Records are therefore _not_ in ascending Morton order within a
  bucket.

## Binary layout

All scalar values are little-endian. The fixed header is 160 bytes:

| Offset | Bytes | Field                                                |
| -----: | ----: | ---------------------------------------------------- |
|      0 |     8 | ASCII magic `ATLTILE2`                               |
|      8 |     2 | wire version, `2`                                    |
|     10 |     2 | header length, `160`                                 |
|     12 |     2 | variant ID                                           |
|     14 |     1 | zoom                                                 |
|     15 |     1 | flags; bit 0 means every visible point was delivered |
|     16 |     4 | tile x                                               |
|     20 |     4 | tile y                                               |
|     24 |     4 | complete visible subtree count                       |
|     28 |     4 | delivered record count                               |
|     32 |    32 | generation content identity                          |
|     64 |    32 | store snapshot identity                              |
|     96 |    32 | manifest content identity                            |
|    128 |    32 | signed release-report identity                       |

Exactly `delivered_count` point records follow. Each record is 8 bytes:

| Offset | Bytes | Field               |
| -----: | ----: | ------------------- |
|      0 |     4 | generation `row_id` |
|      4 |     2 | quantized x         |
|      6 |     2 | quantized y         |

Rows are not an index-query surface. Their purpose is stable identity lookup
inside the named generation.

## HTTP behavior

Successful responses use
`Content-Type: application/vnd.hash.atlas.tile-v2`. `ETag` is the quoted
SHA-256 identity of the exact response bytes. The immutable route identity and
body allow `Cache-Control: public, max-age=31536000, immutable`.

The response also includes `X-Atlas-Visible-Subtree-Count` and
`X-Atlas-Delivered-Count` for diagnostics; the binary header remains the wire
source of truth. Invalid coordinates return 400. Stale generation IDs,
unpublished variants, and variants without a materialized base return 404.
The former unrestricted artifact-stream endpoint is intentionally absent.
