"""PCA-2D baseline engine CLI.

Reads embeddings (common.matrix contract), L2-normalizes rows by default so euclidean PCA
geometry matches the battery's cosine neighbor truth, projects to 2-D with a deterministic
full-SVD PCA, and writes layout.npz (common.layout contract).

``--edges`` and ``--labels`` are accepted and ignored: PCA is an embeddings-only baseline. Its
behavior with and without edges is identical, so the no-structure-from-noise differential
passes trivially, which is the correct outcome for an engine that does not consume edges.
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
@click.option("--normalize/--no-normalize", default=True)
def main(
    embeddings: str,
    out: str,
    seed: int,
    *,
    _edges: str | None,
    _labels: str | None,
    normalize: bool,
) -> None:
    loaded, meta = load_matrix(Path(embeddings), mmap=False)
    xy = pca_coordinates(loaded, normalize=normalize)

    write_layout(
        out,
        xy,
        engine="pca2d",
        config={"normalize": normalize, "svd_solver": "full"},
        seed=seed,
        source_embedding_hash=meta.content_sha256,
    )


if __name__ == "__main__":
    main()
