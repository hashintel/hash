"""PCA-2D baseline engine CLI.

Reads embeddings (common.matrix contract), L2-normalizes rows by default so euclidean PCA
geometry matches the battery's cosine neighbor truth, projects to 2-D with a deterministic
full-SVD PCA, and writes layout.npz (common.layout contract).

``--edges`` and ``--labels`` are accepted and ignored: PCA is an embeddings-only baseline. Its
behavior with and without edges is identical, so the no-structure-from-noise differential
passes trivially, which is the correct outcome for an engine that does not consume edges.
"""

from pathlib import Path

from pydantic import BaseModel, Field, FilePath
from pydantic_settings import CliDualFlag

from atlas_tools.battery.engines import pca_coordinates
from atlas_tools.common.cli import run_cli
from atlas_tools.common.layout import write_layout
from atlas_tools.common.matrix import load_matrix


class PcaCli(BaseModel):
    """Project embeddings to two dimensions with deterministic PCA."""

    embeddings: FilePath
    edges: Path | None = Field(default=None, description="Accepted and ignored.")
    labels: Path | None = Field(default=None, description="Accepted and ignored.")
    out: Path
    seed: int = Field(default=0, description="Recorded in provenance only.")
    normalize: CliDualFlag[bool] = True

    def cli_cmd(self) -> None:
        loaded, meta = load_matrix(self.embeddings, mmap=False)
        xy = pca_coordinates(loaded, normalize=self.normalize)

        write_layout(
            self.out,
            xy,
            engine="pca2d",
            config={"normalize": self.normalize, "svd_solver": "full"},
            seed=self.seed,
            source_embedding_hash=meta.content_sha256,
        )


def main(args: list[str] | None = None) -> None:
    """Run the PCA engine command-line application."""
    run_cli(PcaCli, args)


if __name__ == "__main__":
    main()
