"""umap-learn baseline engine CLI.

Reads embeddings (common.matrix contract) and writes layout.npz (common.layout contract).
``random_state`` is set to ``--seed``, which puts umap-learn on its deterministic
single-threaded path. Making umap deterministic under parallelism is a non-goal: the battery's
rerun-noise floor machinery absorbs spread across seeds instead.

``--edges`` and ``--labels`` are accepted and ignored; this baseline embeds the vectors only.
Consequently an engines.yaml entry that passes ``{edges}`` here has identical with-edges and
no-edges behavior, and the no-structure-from-noise differential trivially (and correctly)
passes for it.

Tuning grid behind the ``umap_tuned`` default-engine config: n_neighbors in {15, 30, 50} x
min_dist in {0.05, 0.1, 0.25} x metric in {cosine}; n_neighbors=30, min_dist=0.1, metric=cosine
was selected on the smoke shapes for the best recall/persistence balance. The grid is
config-driven: any cell is reachable through the CLI flags below.
"""

from pathlib import Path

import numpy as np
from pydantic import BaseModel, Field, FilePath, NonNegativeFloat, NonNegativeInt, PositiveInt

from atlas_tools.common.cli import run_cli
from atlas_tools.common.layout import write_layout
from atlas_tools.common.matrix import load_matrix


class UmapCli(BaseModel):
    """Project embeddings to two dimensions with umap-learn."""

    embeddings: FilePath
    edges: Path | None = Field(default=None, description="Accepted and ignored.")
    labels: Path | None = Field(default=None, description="Accepted and ignored.")
    out: Path
    seed: NonNegativeInt = 0
    n_neighbors: PositiveInt = 15
    min_dist: NonNegativeFloat = 0.1
    metric: str = "cosine"

    def cli_cmd(self) -> None:
        # umap pulls in numba and pays JIT compilation on import; keep it out of --help.
        import umap

        matrix, meta = load_matrix(self.embeddings, mmap=False)
        reducer = umap.UMAP(
            n_components=2,
            n_neighbors=self.n_neighbors,
            min_dist=self.min_dist,
            metric=self.metric,
            random_state=self.seed,
        )
        xy = np.asarray(reducer.fit_transform(np.asarray(matrix)), dtype=np.float32)

        write_layout(
            self.out,
            xy,
            engine="umap",
            config={
                "n_neighbors": self.n_neighbors,
                "min_dist": self.min_dist,
                "metric": self.metric,
            },
            seed=self.seed,
            source_embedding_hash=meta.content_sha256,
        )


def main(args: list[str] | None = None) -> None:
    """Run the UMAP engine command-line application."""
    run_cli(UmapCli, args)


if __name__ == "__main__":
    main()
