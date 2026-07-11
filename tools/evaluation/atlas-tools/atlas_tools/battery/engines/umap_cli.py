"""umap-learn baseline engine CLI.

Reads embeddings (common.matrix contract) and writes layout.npz
(common.layout contract). ``random_state`` is set to ``--seed``, which puts
umap-learn on its deterministic single-threaded path; we deliberately do
NOT try to make umap deterministic under parallelism — the battery's
rerun-noise floor machinery handles spread across seeds.

``--edges`` / ``--labels`` are accepted and IGNORED: this baseline embeds
the vectors only. Consequently an engines.yaml entry that passes
``{edges}`` here has identical with-edges and no-edges behavior, and the
no-structure-from-noise differential trivially (and correctly) passes for
it.

Tuning grid for the ``umap_tuned`` default-engine config (documented per
W3.3): n_neighbors in {15, 30, 50} x min_dist in {0.05, 0.1, 0.25} x
metric in {cosine}; n_neighbors=30, min_dist=0.1, metric=cosine was
selected on the smoke shapes for the best recall/persistence balance. The
grid is config-driven: any cell is reachable through the CLI flags below.
"""

from __future__ import annotations

import click

from atlas_tools.common.layout import write_layout
from atlas_tools.common.matrix import load_matrix


@click.command()
@click.option("--embeddings", required=True, type=click.Path(exists=True))
@click.option("--edges", default=None, type=click.Path(), help="Accepted and ignored.")
@click.option("--labels", default=None, type=click.Path(), help="Accepted and ignored.")
@click.option("--out", required=True, type=click.Path())
@click.option("--seed", type=int, default=0)
@click.option("--n-neighbors", type=int, default=15)
@click.option("--min-dist", type=float, default=0.1)
@click.option("--metric", type=str, default="cosine")
def main(
    embeddings: str,
    edges: str | None,
    labels: str | None,
    out: str,
    seed: int,
    n_neighbors: int,
    min_dist: float,
    metric: str,
) -> None:
    import numpy as np
    import umap  # heavy import (numba); keep local to the command

    emb, meta = load_matrix(embeddings, mmap=False)
    reducer = umap.UMAP(
        n_components=2,
        n_neighbors=n_neighbors,
        min_dist=min_dist,
        metric=metric,
        random_state=seed,
    )
    xy = np.asarray(reducer.fit_transform(np.asarray(emb)), dtype=np.float32)
    write_layout(
        out,
        xy,
        engine="umap",
        config={
            "n_neighbors": n_neighbors,
            "min_dist": min_dist,
            "metric": metric,
        },
        seed=seed,
        source_embedding_hash=meta.content_sha256,
    )


if __name__ == "__main__":
    main()
