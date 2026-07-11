"""Planted-shape dataset artifact contract (W3.1).

A dataset directory written by :func:`write_dataset` contains::

    <dir>/embeddings.f32            raw row-major little-endian f32 matrix
    <dir>/embeddings.f32.meta.json  matrix sidecar (common.matrix contract)
    <dir>/edges.npy                 int64 (m, 2) undirected relation edges
    <dir>/labels.npy                int64 (n,); -1 marks "no label"
    <dir>/truth.json                ground-truth descriptor + provenance

``truth.json`` carries the resolved generator config (hashed to
``config_hash``), the generator seed, the planted-structure descriptor
(community count, chain/type structure, ...), and content hashes of the
sibling files, so a dataset directory is fully self-describing and every
derived number is reproducible from it.

``embeddings.f32``/``edges.npy``/``labels.npy`` bytes are deterministic
functions of (config, seed); only sidecar ``created_at`` fields carry
wall-clock time, and those are excluded from all hashes.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np

from atlas_tools.common.matrix import load_matrix, write_sidecar
from atlas_tools.common.provenance import (
    make_provenance,
    read_sidecar,
    sha256_file,
    write_sidecar,
)

EMBEDDINGS_FILE = "embeddings.f32"
EDGES_FILE = "edges.npy"
LABELS_FILE = "labels.npy"
TRUTH_FILE = "truth.json"


@dataclass
class Dataset:
    """In-memory planted-shape dataset. See module docstring for on-disk form."""

    shape: str
    embeddings: np.ndarray  # (n, dim) float32
    edges: np.ndarray  # (m, 2) int64
    labels: np.ndarray  # (n,) int64; -1 = unlabeled
    truth: dict[str, Any]
    config: dict[str, Any]
    seed: int

    def __post_init__(self) -> None:
        if self.embeddings.ndim != 2 or self.embeddings.dtype != np.float32:
            raise ValueError(
                f"embeddings must be 2-d float32, got shape"
                f" {self.embeddings.shape} dtype {self.embeddings.dtype}"
            )
        n = self.embeddings.shape[0]
        if self.edges.ndim != 2 or self.edges.shape[1] != 2:
            raise ValueError(f"edges must have shape (m, 2), got {self.edges.shape}")
        if self.edges.dtype != np.int64:
            raise ValueError(f"edges must be int64, got {self.edges.dtype}")
        if len(self.edges) and (self.edges.min() < 0 or self.edges.max() >= n):
            raise ValueError("edges reference node ids outside [0, n)")
        if self.labels.shape != (n,) or self.labels.dtype != np.int64:
            raise ValueError(
                f"labels must be int64 with shape ({n},),"
                f" got shape {self.labels.shape} dtype {self.labels.dtype}"
            )

    @property
    def n(self) -> int:
        return int(self.embeddings.shape[0])


def write_dataset(dataset: Dataset, out_dir: Path | str) -> dict[str, str]:
    """Write the dataset artifact directory; return its content hashes."""
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    producer = f"battery.generators.{dataset.shape}"
    meta = write_sidecar(
        out_dir / EMBEDDINGS_FILE, dataset.embeddings, producer=producer
    )
    np.save(out_dir / EDGES_FILE, dataset.edges)
    np.save(out_dir / LABELS_FILE, dataset.labels)

    hashes = {
        "embeddings_sha256": meta.content_sha256,
        "edges_sha256": sha256_file(out_dir / EDGES_FILE),
        "labels_sha256": sha256_file(out_dir / LABELS_FILE),
    }
    truth_payload = make_provenance(
        producer=producer,
        input_hashes=hashes,
        config=dataset.config,
        seed=dataset.seed,
        extra={
            "shape": dataset.shape,
            "n": dataset.n,
            "dim": int(dataset.embeddings.shape[1]),
            "n_edges": int(len(dataset.edges)),
            "truth": dataset.truth,
        },
    )
    write_sidecar(out_dir / TRUTH_FILE, truth_payload)
    return {**hashes, "truth_config_hash": truth_payload["config_hash"]}


def load_dataset(directory: Path | str) -> Dataset:
    """Load a dataset artifact directory written by :func:`write_dataset`."""
    directory = Path(directory)
    embeddings, _ = load_matrix(directory / EMBEDDINGS_FILE, mmap=False)
    edges = np.load(directory / EDGES_FILE)
    labels = np.load(directory / LABELS_FILE)
    truth_payload = read_sidecar(directory / TRUTH_FILE)
    return Dataset(
        shape=truth_payload["shape"],
        embeddings=np.ascontiguousarray(embeddings, dtype=np.float32),
        edges=np.ascontiguousarray(edges, dtype=np.int64),
        labels=np.ascontiguousarray(labels, dtype=np.int64),
        truth=truth_payload["truth"],
        config=truth_payload.get("config", {}),
        seed=int(truth_payload.get("seed", -1)),
    )
