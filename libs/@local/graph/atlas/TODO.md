# Atlas TODO

## Tile wire: follow-ups to the fair-delivery fix

**Done (2026-07-16), in `src/salt/materialize/tile.rs`.** `encode_tile` no
longer cuts a Morton prefix when the point budget lands mid-bucket:

- the cut bucket's tile range is midpoint-stride sampled across its full
  extent (fair delivered _set_);
- each bucket's selection is emitted in progressive order — ascending
  bit-reversed tile-local Morton suffix — so every client-side _prefix_ of a
  response is spatially stratified too (`docs/tile-wire-v2.md` documents
  both guarantees).

This removed the staircase/blocky artifacts in `tools/atlas-demo`, whose
uniform `visible / delivered` mass weighting and prefix-based mark capping
assume exactly these properties. No retraining, re-ranking, or artifact
change was involved: Morton keys, buckets, and the canonical base are
untouched; only tile response selection and ordering changed. Per-response
`content_hash`/ETag values changed by construction.

Worth folding into the SALT rework:

- **Wire v3 with an explicit per-bucket count table.** The response no
  longer exposes bucket boundaries implicitly (Morton keys are not ascending
  within a bucket), so a client cannot tell which importance rungs it
  received. A small header table (`bucket_count`, then per-bucket delivered
  counts) would let clients weight rungs differently, and would make the
  `complete` flag ambiguity (budget ending exactly on a bucket boundary)
  irrelevant.
- **Spec text.** SPEC 5.2 still says the server "backfills until
  `tile_point_budget` records have been selected" without describing the
  in-bucket sampling or ordering; align it with `docs/tile-wire-v2.md` when
  the spec is next revised.
- **Density-proportional mass (client model).** Complete buckets are
  one-representative-per-occupied-cell, i.e. support-uniform rather than
  density-proportional. The demo compensates with `visible / delivered`
  mass. If rung-aware weighting lands (needs the wire v3 table above),
  per-bucket masses could reflect true local density more faithfully.
