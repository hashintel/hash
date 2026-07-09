# embedding2d

Fits an _alpha ladder_ of 2D maps over HASH's entity embeddings — from
purely semantic (what entities mean) to purely relational (how they
connect) — and distills each level into a tiny MLP encoder so that
_any_ entity, including ones created after the fit, can be placed on
the same maps without re-running UMAP.

```
graph DB ──sample──▶ embeddings + metadata + edges
                          │                │
                     semantic set S   relation set R
                          └──────┬─────────┘
                    F(α) = α·S + (1−α)·R   per rung, warm-chained
                                 │
                          layout-aXXX.npz ──distill──▶ encoder-aXXX.safetensors
```

1. **Sample** whole-entity embeddings (`entity_embeddings` where
   `property IS NULL`), Matryoshka-truncated to `--dim` and
   re-normalized in SQL, streamed to a memmappable float32 file with an
   identity sidecar — plus every **relation** (`entity_edge` left/right
   pairs) whose endpoints both landed in the sample, as row-index pairs.
2. **Two graphs** over the sample rows: `S`, UMAP's fuzzy simplicial
   set on the semantic kNN graph (hnswlib, cosine), and `R`, the
   symmetrized, degree-normalized, hub-trimmed relation graph.
3. **The ladder**: for each `--alphas` level (descending), embed the
   convex blend `α·S + (1−α)·R` with UMAP's optimizer, warm-starting
   each rung from the previous one so the ladder reads as one coherent
   deformation (clients can tween between levels). `α=1.0` is the pure
   semantic map; `α=0.0` a pure graph layout.
4. **Distill**: per level, train an MLP over _structure features_
   (embedding ⊕ capped neighbor-mean ⊕ coherence ⊕ degree — see
   `app/features.py` for the frozen train/serve contract) to reproduce
   the layout, exported as safetensors with layout-unit output.

## Prerequisites

- The HASH graph database running locally (e.g. via the repo's compose
  stack). Connection is configured through `HASH_GRAPH_PG_HOST` /
  `_PORT` / `_USER` / `_PASSWORD` / `_DATABASE`, defaulting to
  `localhost:5432`, `graph`/`graph`/`graph`.
- [`uv`](https://docs.astral.sh/uv/) (Python 3.14 is pinned; deps
  include torch, umap-learn, hnswlib, psycopg).

## Usage

```sh
uv run python main.py --out-dir run --dim 256
```

`--sample-size` defaults to 1,500,000; when it meets or exceeds the
matching rows the sampling percentage clamps to 100% and you get every
whole-entity embedding. Below that, the row count jitters binomially
around the target (~0.1% at 1M) rather than being capped exactly — a
`LIMIT` on a `TABLESAMPLE` scan would preferentially drop the most
recently inserted entities.

### Incremental refits

Everything lands in `--out-dir`, and the `α=1.0` artifacts double as
warm-start inputs for the next refit:

| artifact                                      | contents                                         | reused as                                |
| --------------------------------------------- | ------------------------------------------------ | ---------------------------------------- |
| `sample.f32` + `.metadata.npy` + `.edges.npy` | embeddings, identities, relation row-pairs       | cache; reused as-is until refreshed      |
| `layout-aXXX.npz`                             | `metadata`, `xy` per alpha level                 | `a100` seeds the next refit's first rung |
| `encoder-aXXX.safetensors`                    | MLP weights, layout-unit output                  | `a100` is fine-tuned by the next refit   |
| `hubs.json`                                   | entity ids (`web~uuid`) of trimmed relation hubs | serving's frozen feature-exclusion set   |

- `--refresh-sample` drops the cached sample and edges and re-samples
  the database. Entities are matched across refits by identity, so
  survivors keep their positions as the init and the maps only drift
  where the data did.
- `--cold` ignores previous layouts/encoders for a from-scratch fit.
- `--seed` (default 42) fixes sampling, kNN, and training splits. The
  layout optimization itself is deliberately _not_ deterministic
  (seeding it would force umap onto a single-threaded path — hours
  instead of minutes at ~1M points); stability comes from warm starts.

### All flags

```
--out-dir PATH             artifact directory (default: run)
--seed INT                 master seed (default: 42)
--dim INT                  Matryoshka truncation (default: 512)
--sample-size INT          target rows to sample (default: 1500000)
--k INT                    kNN neighbours for the semantic set (default: 15)
--min-dist FLOAT           UMAP min_dist (default: 0.1)
--alphas FLOAT...          ladder levels, e.g. --alphas 1.0 0.75 0.5 0.25
--n-epochs-first INT       epochs for the first (coldest) rung (default: 200)
--n-epochs-chained INT     epochs for warm-chained rungs (default: 100)
--mlp-epochs-first INT     distillation epochs, first encoder (default: 30)
--mlp-epochs-chained INT   distillation epochs, chained encoders (default: 8)
--refresh-sample           drop the cached sample + edges and re-sample
--cold                     ignore previous layouts/encoders
```

Graph-construction and hub-trimming knobs (`ef_construction`, `M`,
`hub_quantile`, `hub_min_ratio`, ...) have sensible defaults on the
params dataclasses in `app/layout.py`, documented inline.

## Demo viewer

A static deck.gl map with an alpha slider, LOD point streaming, and a
vector "far field" first paint (glow texture + region fills traced from
the density merge tree — see `app/farfield.py`'s docstring):

```sh
uv run python -m app.regions --run run --source layout   # density -> merge tree -> label raster
uv run python -m app.farfield --run run --source layout  # tree cut -> simplified ring vectors
uv run python prepare_demo.py --run run                  # aligns + ships everything to demo/data/
python -m http.server -d demo 8000                       # then open localhost:8000
```

`prepare_demo.py` chain-Procrustes-aligns every level into the `α=1.0`
frame (inter-fit scale/rotation is arbitrary and would read as fake
movement on the slider) and pushes the farfield ring geometry through
the same transforms; the glow textures are regenerated from the aligned
positions because an axis-aligned raster can't be rotated. If the
farfield step was skipped, the demo still works — it just falls back to
points-only.

`render_farfield.py` / `render_regions.py` / `render_starfield.py` /
`plot_types.py` produce standalone PNG previews of the same artifacts.

## Consuming an encoder

Each `encoder-aXXX.safetensors` holds `w1,b1,w2,b2,w3,b3` (plus
`scale`/`center`, needed only by the fitting tool). The forward pass is
`x → relu(xW1ᵀ+b1) → relu(·W2ᵀ+b2) → ·W3ᵀ+b3`, yielding layout-unit
coordinates directly.

The input is **not** the raw embedding: it is the `(2d+2)`-wide
structure feature vector — `[embedding ; neighbor_mean ; coherence ;
deg_feat]`. The file's metadata carries the machine-readable
`feature_spec`, plus `deg_norm`, `salt`, `mrl_dim`, and `alpha`; the
authoritative serving contract (bottom-k neighbor selection by
splitmix64, coherence semantics, re-projection policy) is the module
docstring of `app/features.py`.

## Implementation notes

- `app/sample.py` — DB access: embeddings subsample (TABLESAMPLE
  percentage math, no-LIMIT rationale), relation fetching, and the
  UUID-pair → row-index lookup.
- `app/layout.py` — the two graphs, the convex `fuse`, and the
  `simplicial_set_embedding` wrapper with per-knob guidance comments.
- `app/features.py` — structure features; frozen train/serve contract.
- `app/mlp.py` — the distillation MLP; scale/center folding contract
  between `export` and `import_`.
- `app/fit.py` — orchestration: warm-start matching, the ladder, and
  the encoder chain.
