# atlas-tools

Python tooling for the Semantic Atlas pipeline (see
`libs/@local/graph/atlas/SPEC.md` and `tools/evaluation/PRD.md`):

- **`audit/` (W1)** — prefix representation audit. Measures the information
  ceiling of truncated-and-renormalized embedding prefixes against the full
  3072-d vectors (recall@k, intrusion rate, rank displacement, stratified).
- **`wikidata/` (W2)** — Wikidata miner. W2a extracts entity-valued property
  inventories via SPARQL/wbgetentities and emits relation cards (API path, no
  dump). W2b streams the JSON dump (never stored) into a P31-stratified
  entity sampling manifest for vec2slug.
- **`battery/` (W3)** — engine-agnostic layout gate battery. Planted-shape
  generators, structure metrics (merge-tree leaf persistence, kNN recall,
  trustworthiness/continuity, pendant diffusion, edge binding, contraction),
  baselines (PCA-2D, umap-learn), rerun-noise floors, and pass/fail gates
  including the no-structure-from-noise differential.

## Setup

```sh
uv sync --extra dev
uv run pytest -q
```

## Shared contracts

- Raw f32 matrices: headerless row-major little-endian float32 with a
  `<name>.meta.json` sidecar (`atlas_tools.common.matrix`). Loaders validate
  `file size == rows * dim * 4`.
- Layouts: `layout.npz` with `xy` (n, 2) float32 + `row_id` (n,) int64 and a
  `layout.meta.json` sidecar (`atlas_tools.common.layout`). The battery
  consumes only this format and never imports engine code.
- Every artifact carries a provenance sidecar: input hashes, config +
  config hash, seed, tool version (`atlas_tools.common.provenance`).

## CLIs

```sh
uv run audit run --embeddings X.f32 --dims 128,256,512,1024 --k 15,30,50 \
    --sample 20000 --out report/
uv run wikidata extract-properties --config config.yaml --out cards/
uv run wikidata entity-manifest --config config.yaml --out manifest/
uv run battery run --suite suites/phase2.yaml --engines engines.yaml \
    --out runs/dev/
```

Determinism: everything is seeded; tests make no network calls and read no
wall clock (timestamps appear only in provenance sidecars and are excluded
from hashes).
