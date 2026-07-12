"""Wikidata miner.

Two pipelines share this package:

- the API-based relation-card miner: relation cards for the
  relation-policy classifier, mined via the SPARQL and wbgetentities APIs
  with an on-disk response cache;
- the streaming dump miner: a per-entity manifest for vec2slug retraining
  plus a P31-stratified sampling plan. The dump is never written to disk;
  the extractor reads a (seekable file or stdin) stream and persists only
  part files, checkpoints, and the final parquet.
"""

CARD_FORMAT_VERSION = 5
