"""Adversarial toy engine (tests only): the row-shuffle rig.

Runs the deterministic PCA-2D baseline and then permutes the rows of ``xy``
while leaving ``row_id`` untouched, so every node receives some other
node's coordinates. The multiset of positions — and therefore any
identity-blind statistic such as merge-tree persistence — is unchanged, but
every neighbor-identity metric (kNN recall, trustworthiness/continuity,
silhouette, pendant diffusion, edge binding) collapses to chance. The
acceptance test asserts this engine fails every structure gate.
"""

from __future__ import annotations

import click
import numpy as np

from atlas_tools.battery.engines import pca_coords
from atlas_tools.common.layout import write_layout
from atlas_tools.common.matrix import load_matrix


@click.command()
@click.option("--embeddings", required=True, type=click.Path(exists=True))
@click.option("--edges", default=None, type=click.Path(), help="Accepted and ignored.")
@click.option("--labels", default=None, type=click.Path(), help="Accepted and ignored.")
@click.option("--out", required=True, type=click.Path())
@click.option("--seed", type=int, default=0)
def main(
    embeddings: str,
    edges: str | None,
    labels: str | None,
    out: str,
    seed: int,
) -> None:
    emb, meta = load_matrix(embeddings, mmap=False)
    xy = pca_coords(emb)
    perm = np.random.default_rng(seed).permutation(len(xy))
    write_layout(
        out,
        xy[perm],  # row_id defaults to arange(n): coordinates decoupled
        engine="shuffle",
        config={"base": "pca2d"},
        seed=seed,
        source_embedding_hash=meta.content_sha256,
    )


if __name__ == "__main__":
    main()
