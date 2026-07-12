"""Adversarial toy engine (tests only): the contraction rig.

Runs the deterministic PCA-2D baseline and then multiplies all coordinates by ``--scale``
(default 0.01), inflating raw density contrast by collapsing points into a tiny area. Because
the merge-tree raster is computed over the layout's own extent and persistence is normalized by
the density maximum, this engine gains no persistence relative to the PCA baseline; the
acceptance tests pin that anti-cheat property.
"""

from pathlib import Path

import click

from atlas_tools.battery.engines import pca_coordinates
from atlas_tools.common.layout import write_layout
from atlas_tools.common.matrix import load_matrix


@click.command()
@click.option("--embeddings", required=True, type=click.Path(exists=True))
@click.option("--edges", "_edges", default=None, type=click.Path(), help="Accepted and ignored.")
@click.option("--labels", "_labels", default=None, type=click.Path(), help="Accepted and ignored.")
@click.option("--out", required=True, type=click.Path())
@click.option("--seed", type=int, default=0, help="Recorded in provenance only.")
@click.option("--scale", type=float, default=0.01)
def main(
    embeddings: str,
    out: str,
    seed: int,
    scale: float,
    _edges: str | None,
    _labels: str | None,
) -> None:
    loaded, meta = load_matrix(Path(embeddings), mmap=False)
    xy = pca_coordinates(loaded) * scale

    write_layout(
        out,
        xy,
        engine="collapse",
        config={"scale": scale, "base": "pca2d"},
        seed=seed,
        source_embedding_hash=meta.content_sha256,
    )


if __name__ == "__main__":
    main()
