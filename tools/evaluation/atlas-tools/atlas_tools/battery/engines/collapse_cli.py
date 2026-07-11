"""Adversarial toy engine (tests only): the contraction rig.

Runs the deterministic PCA-2D baseline and then multiplies all coordinates
by ``--scale`` (default 0.01), inflating raw density contrast by collapsing
points into a tiny area. Because the merge-tree raster is computed over the
layout's own extent and persistence is normalized by the density max, this
engine must NOT gain persistence relative to the PCA baseline — that is the
anti-cheat acceptance test.
"""

from __future__ import annotations

import click

from atlas_tools.battery.engines import pca_coords
from atlas_tools.common.layout import write_layout
from atlas_tools.common.matrix import load_matrix


@click.command()
@click.option("--embeddings", required=True, type=click.Path(exists=True))
@click.option("--edges", default=None, type=click.Path(), help="Accepted and ignored.")
@click.option("--labels", default=None, type=click.Path(), help="Accepted and ignored.")
@click.option("--out", required=True, type=click.Path())
@click.option("--seed", type=int, default=0, help="Recorded in provenance only.")
@click.option("--scale", type=float, default=0.01)
def main(
    embeddings: str,
    edges: str | None,
    labels: str | None,
    out: str,
    seed: int,
    scale: float,
) -> None:
    emb, meta = load_matrix(embeddings, mmap=False)
    xy = pca_coords(emb) * scale
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
