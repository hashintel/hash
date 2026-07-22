"""Adversarial toy engine (tests only) that manufactures clusters from edges.

With ``--edges``, every node that has at least one edge is assigned a pseudo-community derived
from its minimum neighbor id (a deterministic stand-in for community detection on the edge
graph) and the communities are placed as tight, well-separated blobs on a circle. The engine
fabricates crisp layout structure purely from edge data while ignoring the embeddings entirely;
on ``noise_edges`` (uniformly random edges) it "discovers" structure that does not exist.

Without ``--edges`` it emits an unstructured gaussian scatter.

A correct no-structure-from-noise differential fails this engine: its with-edges persistence
and cluster structure on noise_edges vastly exceed its no-edges output, beyond any rerun-noise
floor.
"""

from pathlib import Path

import numpy as np
from pydantic import (
    BaseModel,
    Field,
    FilePath,
    NonNegativeFloat,
    NonNegativeInt,
    PositiveFloat,
    PositiveInt,
)

from atlas_tools.common.cli import run_cli
from atlas_tools.common.layout import write_layout
from atlas_tools.common.matrix import load_matrix


class CheatCli(BaseModel):
    """Manufacture layout clusters from edges for an adversarial test rig."""

    embeddings: FilePath
    edges: FilePath | None = None
    labels: Path | None = Field(default=None, description="Accepted and ignored.")
    out: Path
    seed: NonNegativeInt = 0
    n_clusters: PositiveInt = 24
    radius: PositiveFloat = 10.0
    jitter: NonNegativeFloat = 0.05

    def cli_cmd(self) -> None:
        _, meta = load_matrix(self.embeddings, mmap=True)
        n = meta.rows
        rng = np.random.default_rng(self.seed)
        xy = rng.normal(size=(n, 2)).astype(np.float32)

        edge_array = np.load(self.edges) if self.edges is not None else np.zeros((0, 2), np.int64)
        if len(edge_array):
            e = np.asarray(edge_array, dtype=np.int64)
            min_partner = np.full(n, n, dtype=np.int64)
            np.minimum.at(min_partner, e[:, 0], e[:, 1])
            np.minimum.at(min_partner, e[:, 1], e[:, 0])
            has_edge = min_partner < n
            cluster = min_partner[has_edge] % self.n_clusters
            angle = 2.0 * np.pi * cluster / self.n_clusters
            centers = self.radius * np.stack([np.cos(angle), np.sin(angle)], axis=1)
            xy[has_edge] = (
                centers + self.jitter * rng.normal(size=(int(has_edge.sum()), 2))
            ).astype(np.float32)

        write_layout(
            self.out,
            xy,
            engine="cheat",
            config={
                "n_clusters": self.n_clusters,
                "radius": self.radius,
                "jitter": self.jitter,
                "used_edges": bool(len(edge_array)),
            },
            seed=self.seed,
            source_embedding_hash=meta.content_sha256,
        )


def main(args: list[str] | None = None) -> None:
    """Run the adversarial edge-cheating engine CLI."""
    run_cli(CheatCli, args)


if __name__ == "__main__":
    main()
