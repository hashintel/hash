"""Adversarial toy engine (tests only): the contraction rig.

Runs the deterministic PCA-2D baseline and then multiplies all coordinates by ``--scale``
(default 0.01), inflating raw density contrast by collapsing points into a tiny area. Because
the merge-tree raster is computed over the layout's own extent and persistence is normalized by
the density maximum, this engine gains no persistence relative to the PCA baseline; the
acceptance tests pin that anti-cheat property.
"""

from pathlib import Path

from pydantic import BaseModel, Field, FilePath, PositiveFloat

from atlas_tools.battery.engines import pca_coordinates
from atlas_tools.common.cli import run_cli
from atlas_tools.common.layout import write_layout
from atlas_tools.common.matrix import load_matrix


class CollapseCli(BaseModel):
    """Contract deterministic PCA coordinates by a fixed scale."""

    embeddings: FilePath
    edges: Path | None = Field(default=None, description="Accepted and ignored.")
    labels: Path | None = Field(default=None, description="Accepted and ignored.")
    out: Path
    seed: int = Field(default=0, description="Recorded in provenance only.")
    scale: PositiveFloat = 0.01

    def cli_cmd(self) -> None:
        loaded, meta = load_matrix(self.embeddings, mmap=False)
        xy = pca_coordinates(loaded) * self.scale

        write_layout(
            self.out,
            xy,
            engine="collapse",
            config={"scale": self.scale, "base": "pca2d"},
            seed=self.seed,
            source_embedding_hash=meta.content_sha256,
        )


def main(args: list[str] | None = None) -> None:
    """Run the contraction engine command-line application."""
    run_cli(CollapseCli, args)


if __name__ == "__main__":
    main()
