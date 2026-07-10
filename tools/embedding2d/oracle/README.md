# Atlas projection oracle

This package pins the Python and numerical dependencies used as the executable
reference for Atlas's focused Rust UMAP implementation. It is a development
tool only: production and normal Rust CI read the committed `.npy` fixtures and
do not invoke Python.

The baseline fixture covers:

- smooth k-NN `sigma` and `rho` calibration, including zero-distance duplicates;
- directed memberships and canonical fuzzy-union CSR;
- relation deduplication, hub removal, degree normalization, and hop-two diffusion;
- deterministic capped structure features, coherence, and degree scaling;
- semantic/relation fusion and UMAP local-connectivity reset;
- `a`/`b` fitting, weak-edge filtering, edge schedules, and learning-rate decay;
- deterministic serial optimizer coordinates after 1, 2, and 5 epochs and at 20 epochs.

## Regenerate the committed fixture

From this directory:

```sh
uv sync --locked
uv run python generate.py
```

`generate.py` replaces `fixtures/v1` and writes a deterministic
`manifest.json` containing the exact package versions, parameters, array dtypes,
and shapes. Review both the manifest and array changes when updating the pinned
versions or generator behavior.

To generate only one stage while developing, provide a separate output
directory so the committed all-stage fixture is not replaced by a partial one:

```sh
uv run python generate.py semantic --output /tmp/atlas-semantic-oracle
uv run python generate.py relation --output /tmp/atlas-relation-oracle
uv run python generate.py features --output /tmp/atlas-features-oracle
uv run python generate.py fusion --output /tmp/atlas-fusion-oracle
uv run python generate.py optimizer --output /tmp/atlas-optimizer-oracle
```

The fixture inputs are intentionally small and hand-defined. They exercise
important edge cases without involving PostgreSQL, HNSW approximation, or the
production sample cache; those components have separate integration and recall
tests.
