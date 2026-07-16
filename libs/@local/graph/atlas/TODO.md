# Atlas TODO

## Tile wire: spatially fair delivery under budget truncation

**Problem.** `encode_tile` (`src/salt/materialize/tile.rs`) backfills buckets
in order and, within each bucket, delivers rows in ascending Morton order.
When the point budget lands mid-bucket, that bucket contributes only the
Morton-order prefix of its tile range. A Morton prefix is not a uniform
spatial sample: it is a Z-curve prefix, i.e. a staircase-shaped region biased
toward the low-key corner (top-left, since y occupies the odd/high interleaved
bits). Clients that weight delivered points by `visible / delivered` mass
concentrate the subtree's density into that staircase, which renders as sharp
horizontal cuts and blocky staircase artifacts.

**Interim client mitigation (shipped in `tools/atlas-demo`).** Bucket
boundaries are recovered client-side as the positions where the delivered
Morton key sequence decreases (`src/atlas-client/atlas-delivery-order.ts`).
The renderer drops the truncated trailing bucket, re-spreads the tile's
visible mass over the remaining fair prefix, and stride-samples (rather than
prefix-cuts) buckets when capping marks. Two limitations are inherent to the
current wire:

- A budget that ends exactly on a bucket boundary is indistinguishable from a
  mid-bucket cut, so one complete bucket may be dropped needlessly.
- If the budget lands inside the _first_ delivered bucket there is no fair
  fallback; the biased delivery is rendered until refinement replaces it.

**Server-side fix to fold into the SALT rework.** Within the bucket where the
budget runs out, deliver a stratified sample of the bucket's tile range
(e.g. every k-th record, `k = range / remaining_budget`) instead of the
Morton prefix. Notes:

- This changes the wire-v2/spec contract ("backfills until
  `tile_point_budget` records have been selected", `docs/tile-wire-v2.md`,
  SPEC 5.2), so it needs a wire/spec version note. Consider bumping to a
  wire v3 that also carries an explicit per-bucket count table in the header,
  removing the client's need to infer boundaries from key decreases and
  resolving both ambiguities above.
- Delivery within the sampled bucket should stay in Morton order so
  `visible_subtree_count` binary searches and client ordering assumptions
  hold.
- No retraining or re-ranking is required: Morton keys, buckets, and the
  canonical base artifact are unchanged; only tile response encoding differs.
  Published artifact hashes (`bucket_index_hash`, `morton_index_hash`) are
  unaffected; per-response `content_hash` values change by construction.
- Once the server samples fairly, the demo's `atlasFairDeliveryCount`
  trailing-bucket drop becomes unnecessary (delivered points are then a fair
  sample end-to-end) and can be reduced to the stride-based mark capping.
