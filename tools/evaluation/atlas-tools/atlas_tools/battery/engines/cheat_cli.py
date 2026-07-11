"""Adversarial toy engine (tests only): manufactures clusters from edges.

With ``--edges``, every node that has at least one edge is assigned a
pseudo-community derived from its minimum neighbor id (a deterministic
stand-in for community detection on the edge graph) and the communities are
placed as tight, well-separated blobs on a circle — i.e. the engine
fabricates crisp layout structure purely from edge data while ignoring the
embeddings entirely. On ``noise_edges`` (uniformly random edges) this
"discovers" structure that does not exist.

Without ``--edges`` it emits an unstructured gaussian scatter.

A correct no-structure-from-noise differential MUST fail this engine: its
with-edges persistence/cluster structure on noise_edges vastly exceeds its
no-edges output beyond any rerun-noise floor.
"""

from __future__ import annotations

import click
import numpy as np

from atlas_tools.common.layout import write_layout
from atlas_tools.common.matrix import load_matrix


@click.command()
@click.option("--embeddings", required=True, type=click.Path(exists=True))
@click.option("--edges", default=None, type=click.Path(exists=True))
@click.option("--labels", default=None, type=click.Path(), help="Accepted and ignored.")
@click.option("--out", required=True, type=click.Path())
@click.option("--seed", type=int, default=0)
@click.option("--n-clusters", type=int, default=24)
@click.option("--radius", type=float, default=10.0)
@click.option("--jitter", type=float, default=0.05)
def main(
    embeddings: str,
    edges: str | None,
    labels: str | None,
    out: str,
    seed: int,
    n_clusters: int,
    radius: float,
    jitter: float,
) -> None:
    _, meta = load_matrix(embeddings, mmap=True)
    n = meta.rows
    rng = np.random.default_rng(seed)
    xy = rng.normal(size=(n, 2)).astype(np.float32)

    edge_array = np.load(edges) if edges is not None else np.zeros((0, 2), np.int64)
    if len(edge_array):
        e = np.asarray(edge_array, dtype=np.int64)
        min_partner = np.full(n, n, dtype=np.int64)
        np.minimum.at(min_partner, e[:, 0], e[:, 1])
        np.minimum.at(min_partner, e[:, 1], e[:, 0])
        has_edge = min_partner < n
        cluster = min_partner[has_edge] % n_clusters
        angle = 2.0 * np.pi * cluster / n_clusters
        centers = radius * np.stack([np.cos(angle), np.sin(angle)], axis=1)
        xy[has_edge] = (
            centers + jitter * rng.normal(size=(int(has_edge.sum()), 2))
        ).astype(np.float32)

    write_layout(
        out,
        xy,
        engine="cheat",
        config={
            "n_clusters": n_clusters,
            "radius": radius,
            "jitter": jitter,
            "used_edges": bool(len(edge_array)),
        },
        seed=seed,
        source_embedding_hash=meta.content_sha256,
    )


if __name__ == "__main__":
    main()
