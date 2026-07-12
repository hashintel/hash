"""Wikidata miner (W2).

W2a (no dump): relation cards for the relation-policy classifier, mined via
the SPARQL and wbgetentities APIs with an on-disk response cache.

W2b (dump-shaped, last milestone): a streamed entity manifest for vec2slug
retraining plus a P31-stratified sampling plan. The dump is never written to
disk; the extractor reads a (seekable file or stdin) stream and persists only
part files, checkpoints, and the final parquet.
"""

CARD_FORMAT_VERSION = 2
