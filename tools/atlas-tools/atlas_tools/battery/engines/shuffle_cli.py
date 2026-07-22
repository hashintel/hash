"""Adversarial toy engine (tests only): the row-shuffle rig.

Runs the deterministic PCA-2D baseline and then permutes the rows of ``xy`` while leaving
``row_id`` untouched, so every node receives some other node's coordinates. The multiset of
positions, and therefore any identity-blind statistic such as merge-tree persistence, is
unchanged, but every neighbor-identity metric (kNN recall, trustworthiness/continuity,
silhouette, pendant diffusion, edge binding) collapses to chance. The acceptance tests assert
that this engine fails every structure gate.
"""

from pathlib import Path

import numpy as np
from pydantic import BaseModel, Field, FilePath, NonNegativeInt

from atlas_tools.battery.engines import pca_coordinates
from atlas_tools.common.cli import run_cli
from atlas_tools.common.layout import write_layout
from atlas_tools.common.matrix import load_matrix


class ShuffleCli(BaseModel):
    """Permute deterministic PCA coordinates relative to node identity."""

    embeddings: FilePath
    edges: Path | None = Field(default=None, description="Accepted and ignored.")
    labels: Path | None = Field(default=None, description="Accepted and ignored.")
    out: Path
    seed: NonNegativeInt = 0

    def cli_cmd(self) -> None:
        loaded, meta = load_matrix(self.embeddings, mmap=False)
        xy = pca_coordinates(loaded)
        permutation = np.random.default_rng(self.seed).permutation(len(xy))

        write_layout(
            self.out,
            xy[permutation],  # row_id defaults to arange(n): coordinates decoupled from identity
            engine="shuffle",
            config={"base": "pca2d"},
            seed=self.seed,
            source_embedding_hash=meta.content_sha256,
        )


def main(args: list[str] | None = None) -> None:
    """Run the row-shuffle engine command-line application."""
    run_cli(ShuffleCli, args)


if __name__ == "__main__":
    main()
