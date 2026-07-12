"""Planted-shape dataset artifact contract.

A dataset directory written by :func:`write_dataset` contains::

    <dir>/embeddings.f32            raw row-major little-endian f32 matrix
    <dir>/embeddings.f32.meta.json  matrix sidecar (common.matrix contract)
    <dir>/edges.npy                 int64 (m, 2) undirected relation edges
    <dir>/labels.npy                int64 (n,); -1 marks "no label"
    <dir>/truth.json                ground-truth descriptor + provenance

``truth.json`` carries the resolved generator config (hashed to ``config_hash``), the generator
seed, the planted-structure descriptor (community count, chain/type structure, ...), and content
hashes of the sibling files, so a dataset directory is fully self-describing and every derived
number is reproducible from it.

``embeddings.f32``, ``edges.npy``, and ``labels.npy`` bytes are deterministic functions of
(config, seed); only sidecar ``created_at`` fields carry wall-clock time, and those are excluded
from all hashes.
"""

from dataclasses import dataclass
from os import PathLike
from pathlib import Path
from typing import Final

import numpy as np
from pydantic import BaseModel, NonNegativeInt

from atlas_tools.common.data import JsonDict, Sha256Hex
from atlas_tools.common.matrix import load_matrix, write_matrix
from atlas_tools.common.provenance import (
    Provenance,
    sha256_file,
)

EMBEDDINGS_FILE = "embeddings.f32"
EDGES_FILE = "edges.npy"
LABELS_FILE = "labels.npy"
TRUTH_FILE = "truth.json"

_MATRIX_NDIM: Final = 2
"""Embeddings and edge lists are 2-D arrays."""

_EDGE_ENDPOINTS: Final = 2
"""Undirected relation edges are node-id pairs."""

type StrPath = str | PathLike[str]
"""A filesystem path as accepted at the battery's boundaries.

The CLI passes strings and tests pass :class:`~pathlib.Path` objects.
"""


class TruthDetails(BaseModel):
    """Planted-structure descriptor carried in ``truth.json``."""

    shape: str
    n: NonNegativeInt
    dim: NonNegativeInt
    n_edges: NonNegativeInt
    truth: JsonDict


# Generator configs are shape-specific free-form JSON; the harness only hashes and reproduces
# them.
TruthProvenance = Provenance[TruthDetails, JsonDict]


@dataclass
class Dataset:
    """In-memory planted-shape dataset.

    The on-disk form is described in the module docstring.
    """

    shape: str
    embeddings: np.ndarray  # (n, dim) float32
    edges: np.ndarray  # (m, 2) int64
    labels: np.ndarray  # (n,) int64; -1 = unlabeled
    # Genuinely shape-specific free-form JSON: each generator plants its own descriptor
    # (community counts, chain structure, ...); consumers narrow the keys they read.
    truth: JsonDict
    # The producing generator's resolved config dump ({shape, n, params}).
    config: JsonDict
    seed: int

    def __post_init__(self) -> None:
        if self.embeddings.ndim != _MATRIX_NDIM or self.embeddings.dtype != np.float32:
            raise ValueError(
                f"embeddings must be 2-d float32, got shape"
                f" {self.embeddings.shape} dtype {self.embeddings.dtype}"
            )

        n = self.embeddings.shape[0]
        if self.edges.ndim != _MATRIX_NDIM or self.edges.shape[1] != _EDGE_ENDPOINTS:
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


class DatasetHashes(BaseModel):
    """Content hashes of one dataset artifact directory (manifest currency)."""

    embeddings_sha256: Sha256Hex
    edges_sha256: Sha256Hex
    labels_sha256: Sha256Hex
    truth_config_hash: Sha256Hex


def write_dataset(dataset: Dataset, out_dir: StrPath) -> DatasetHashes:
    """Write the dataset artifact directory; return its content hashes."""
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    producer = f"battery.generators.{dataset.shape}"
    provenance = write_matrix(out_dir / EMBEDDINGS_FILE, dataset.embeddings, producer=producer)
    np.save(out_dir / EDGES_FILE, dataset.edges)
    np.save(out_dir / LABELS_FILE, dataset.labels)

    input_hashes = {
        "embeddings_sha256": provenance.details.content_sha256,
        "edges_sha256": sha256_file(out_dir / EDGES_FILE),
        "labels_sha256": sha256_file(out_dir / LABELS_FILE),
    }

    truth_payload = TruthProvenance.make(
        producer=producer,
        input_hashes=input_hashes,
        config=dataset.config,
        seed=dataset.seed,
        details=TruthDetails(
            shape=dataset.shape,
            n=dataset.n,
            dim=int(dataset.embeddings.shape[1]),
            n_edges=len(dataset.edges),
            truth=dataset.truth,
        ),
    )
    truth_payload.write(out_dir / TRUTH_FILE)

    if truth_payload.config_hash is None:
        # Unreachable: Provenance.make hashes every non-None config, and dataset.config is a
        # dict. Raising keeps DatasetHashes honest without an assert.
        raise RuntimeError("truth.json provenance is missing its config hash")

    return DatasetHashes(**input_hashes, truth_config_hash=truth_payload.config_hash)


def load_dataset(directory: StrPath) -> Dataset:
    """Load a dataset artifact directory written by :func:`write_dataset`."""
    directory = Path(directory)
    embeddings, _ = load_matrix(directory / EMBEDDINGS_FILE, mmap=False)
    edges = np.load(directory / EDGES_FILE)
    labels = np.load(directory / LABELS_FILE)
    truth_payload = TruthProvenance.load(directory / TRUTH_FILE)

    return Dataset(
        shape=truth_payload.details.shape,
        embeddings=np.ascontiguousarray(embeddings, dtype=np.float32),
        edges=np.ascontiguousarray(edges, dtype=np.int64),
        labels=np.ascontiguousarray(labels, dtype=np.int64),
        truth=dict(truth_payload.details.truth),
        config=dict(truth_payload.config or {}),
        seed=truth_payload.seed if truth_payload.seed is not None else -1,
    )
