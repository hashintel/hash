"""Adversarial toy engine (tests only): the row-shuffle rig.

Runs the deterministic PCA-2D baseline and then permutes the rows of ``xy`` while leaving
``row_id`` untouched, so every node receives some other node's coordinates. The multiset of
positions, and therefore any identity-blind statistic such as merge-tree persistence, is
unchanged, but every neighbor-identity metric (kNN recall, trustworthiness/continuity,
silhouette, pendant diffusion, edge binding) collapses to chance. The acceptance tests assert
that this engine fails every structure gate.
"""

from pathlib import Path

import click
import numpy as np

from atlas_tools.battery.engines import pca_coordinates
from atlas_tools.common.layout import write_layout
from atlas_tools.common.matrix import load_matrix


@click.command()
@click.option("--embeddings", required=True, type=click.Path(exists=True))
@click.option("--edges", "_edges", default=None, type=click.Path(), help="Accepted and ignored.")
@click.option("--labels", "_labels", default=None, type=click.Path(), help="Accepted and ignored.")
@click.option("--out", required=True, type=click.Path())
@click.option("--seed", type=int, default=0)
def main(
    embeddings: str,
    out: str,
    seed: int,
    _edges: str | None,
    _labels: str | None,
) -> None:
    loaded, meta = load_matrix(Path(embeddings), mmap=False)
    xy = pca_coordinates(loaded)
    permutation = np.random.default_rng(seed).permutation(len(xy))

    write_layout(
        out,
        xy[permutation],  # row_id defaults to arange(n): coordinates decoupled from identity
        engine="shuffle",
        config={"base": "pca2d"},
        seed=seed,
        source_embedding_hash=meta.content_sha256,
    )


if __name__ == "__main__":
    main()
