# Atlas TODO

## Tile wire: follow-ups to the fair-delivery fix

**Done (2026-07-16), in `src/salt/materialize/tile.rs`.** `encode_tile` no
longer cuts a Morton prefix when the point budget lands mid-bucket:

- the cut bucket's tile range is midpoint-stride sampled across its full
  extent (fair delivered _set_);
- each bucket's selection is emitted in progressive order — ascending
  bit-reversed tile-local Morton suffix — so every client-side _prefix_ of a
  response is spatially stratified too (`docs/tile-wire-v4.md` documents
  both guarantees).

This removed the staircase/blocky artifacts in `tools/atlas-demo`, whose
uniform `visible / delivered` mass weighting and prefix-based mark capping
assume exactly these properties. No retraining, re-ranking, or artifact
change was involved: Morton keys, buckets, and the canonical base are
untouched; only tile response selection and ordering changed. Per-response
`content_hash`/ETag values changed by construction.

**Also done (2026-07-16): wire v3 per-bucket count table.** The tile
response now carries `bucket_count` + per-bucket delivered counts after the
160-byte header, assigning every bucket-major record its importance rung.

**Also done (2026-07-17): wire v4 per-record represented counts.** The
client-side weighting derived from the v3 bucket table (weight 1 plus the
remainder dumped on the final delivered rung) could not reconstruct density:
rungs are first-occupant occupancy samples, so delivered positions are
near-uniform over occupied space and the remainder smear erased density
contrast while over-weighting a few rung points into saturated blobs. The
server now attributes every undelivered visible point to the delivered
record sharing its deepest Morton cell (longest common key prefix via the
Morton predecessor/successor of the sorted delivered set) and ships one u32
represented count per record after the record stream; counts are >= 1 and
sum to `visible_subtree_count` (`docs/tile-wire-v4.md`). The demo renders
the counts as linear mass in the float field pass and tone-maps afterwards,
which is the only composition where regional brightness stays proportional
to true point density. `atlasPointWeights` was deleted with the v3 decode
path. Serve-time only, as before: no artifact or ranking changes.

Worth folding into the SALT rework:

- **Publish the importance grid schedule in the manifest.** `grid_depths`
  exists only in generation config (hashed into `runtime_config_hash`, never
  published). With it, clients could map each rung to its cell size -
  nominal spacing `world_span / 2^depth` - for principled kernel radii and
  per-rung density models, instead of tile-zoom heuristics.
- **Spec text.** SPEC 5.2 still says the server "backfills until
  `tile_point_budget` records have been selected" without describing the
  in-bucket sampling, ordering, count table, or represented counts; align
  it with `docs/tile-wire-v4.md` when the spec is next revised.
- **Per-record priority rank.** Rung membership is now on the wire, but
  within-rung importance (`priority_rank`) still is not; adding it (8 -> 12
  bytes per record) would allow truthful per-entity mark sizing.
