# embedding2d

Fits a 2D map of HASH's entity embeddings, and distills the mapping into
a tiny MLP encoder so that _any_ embedding — including entities created
after the fit — can be placed on the same map with a couple of matmuls,
no UMAP required.

```
graph DB ──sample──▶ sample.f32 ──hnswlib──▶ kNN graph ──UMAP──▶ layout.npz
                                                                    │
                                              embeddings ──distill──┘
                                                    │
                                                    ▼
                                          encoder.safetensors
```

1. **Sample** entity embeddings from the graph database
   (`entity_embeddings` where `property IS NULL`, i.e. whole-entity
   embeddings). Vectors are Matryoshka-truncated to `--dim` dimensions
   and re-normalized in SQL, then streamed to a raw float32 file that is
   memmapped from then on.
2. **kNN graph** via hnswlib (approximate, cosine), shaped for UMAP's
   `precomputed_knn`.
3. **UMAP** to 2D. Warm-starts from the previous run's layout when one
   exists, so successive maps stay visually stable.
4. **Distill**: train an MLP (`dim → 512 → 512 → 2`, ReLU) to reproduce
   the layout from the embeddings, and export it as safetensors. The
   de-standardization is folded into the last layer, so consumers get
   layout units directly.

## Prerequisites

- The HASH graph database running locally (e.g. via the repo's compose
  stack). Connection is configured through `HASH_GRAPH_PG_HOST` /
  `_PORT` / `_USER` / `_PASSWORD` / `_DATABASE`, defaulting to
  `localhost:5432`, `graph`/`graph`/`graph`.
- [`uv`](https://docs.astral.sh/uv/) (Python 3.14 is pinned; deps
  include torch, umap-learn, hnswlib, psycopg).

## Usage

The intended production fit — 256 dimensions, up to 1.5M entities
(currently more than the table holds, so effectively the full dataset):

```sh
uv run python main.py --out-dir run --dim 256
```

`--sample-size` defaults to 1,500,000. When it meets or exceeds the
number of matching rows, the sampling percentage clamps to 100% and you
simply get every whole-entity embedding. Below that, the row count
jitters binomially around the target (~0.1% at 1M) rather than being
capped exactly -- a `LIMIT` on a `TABLESAMPLE` scan would preferentially
drop the most recently inserted entities, biasing the map against
exactly the rows a refit exists to incorporate.

Epoch counts default to sane values: UMAP picks its own (`200` for
datasets this size) unless you pass `--n-epochs`, and the MLP trains for
`--mlp-epochs 30` with early stopping (patience 5) on a 2% validation
split.

Expect the HNSW build + UMAP to take tens of minutes at ~1M points; the
MLP distillation is comparatively quick (runs on CUDA/MPS when
available).

### Incremental runs

Everything lands in `--out-dir`, and each artifact doubles as the
warm-start input for the next run:

| artifact                  | contents                                    | reused as                                |
| ------------------------- | ------------------------------------------- | ---------------------------------------- |
| `sample.f32` + `.ids.npy` | raw float32 embeddings + aligned entity ids | cache; reused as-is until refreshed      |
| `layout.npz`              | `ids`, `xy` — the fitted 2D positions       | UMAP init (carried-over points stay put) |
| `encoder.safetensors`     | MLP weights, layout-unit output             | fine-tuning start for the next distill   |

- `--refresh-sample` drops the cached sample and re-samples the
  database (new entities enter the map; departed ones leave). Ids are
  matched across runs, so surviving entities keep their positions as
  the UMAP init and the map only drifts where the data did.
- `--cold` ignores the previous layout and encoder for a from-scratch
  fit.
- `--seed` (default 42) makes sampling, kNN, and the training split
  deterministic for a given database state. The UMAP layout itself is
  deliberately _not_ seeded: fixing its `random_state` would force
  umap-learn onto a single-threaded optimization path (hours instead of
  minutes at ~1M points). Run-to-run layout stability comes from the
  warm start instead.

### All flags

```
--out-dir PATH        artifact directory (default: run)
--seed INT            master seed (default: 42)
--dim INT             Matryoshka truncation, must be <= stored dim (default: 512)
--sample-size INT     max rows to sample (default: 1500000)
--k INT               kNN neighbours, must be >= --n-neighbors (default: 15)
--n-neighbors INT     UMAP neighbourhood size (default: 15)
--min-dist FLOAT      UMAP min_dist (default: 0.1)
--n-epochs INT        UMAP epochs (default: let umap-learn choose)
--init CHOICE         cold-start init: pca|spectral|tswspectral|random
                      (default: pca; ignored once a previous layout exists --
                      spectral is minutes-to-hours of silent single-core
                      ARPACK at 1M points, pca is seconds for near-par quality)
--mlp-epochs INT      distillation epochs (default: 30)
--refresh-sample      drop the cached sample and re-sample the DB
--cold                ignore previous layout/encoder
```

## Consuming the encoder

`encoder.safetensors` holds `w1,b1,w2,b2,w3,b3` (plus `scale`/`center`,
which only the fitting tool itself needs). The forward pass is:

```python
import numpy as np
from safetensors.numpy import load_file

t = load_file("run/encoder.safetensors")

def to_xy(embedding: np.ndarray) -> np.ndarray:
    """L2-normalized, dim-truncated embedding(s) -> layout coordinates."""
    h = np.maximum(embedding @ t["w1"].T + t["b1"], 0)
    h = np.maximum(h @ t["w2"].T + t["b2"], 0)
    return h @ t["w3"].T + t["b3"]
```

Inputs must be prepared exactly like the training data: truncate the
stored embedding to `--dim` dimensions, then L2-normalize. Metadata on
the file (`dim`, `n_points`, `fitted_at`, `umap`) records what the
encoder was fitted on.

## Implementation notes

See `app/fit.py` for the details worth knowing before changing things:
the `TABLESAMPLE` percentage math (sampling happens _before_ the
`WHERE` filter), why `dim` is spliced into the SQL as a literal, the
hnswlib self-neighbour fix-up UMAP depends on, and the id-matching that
makes warm starts work. `app/mlp.py` documents the scale/center
folding contract between `export` and `import_`.
