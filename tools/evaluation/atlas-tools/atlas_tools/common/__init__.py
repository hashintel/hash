"""Shared contracts: raw f32 matrices, layout artifacts, provenance, kNN."""

from atlas_tools.common.knn import (
    exact_cosine_knn,
    l2_normalize,
    prefix_transform,
)
from atlas_tools.common.layout import (
    LayoutArtifact,
    load_layout,
    write_layout,
)
from atlas_tools.common.matrix import (
    MatrixDetails,
    load_matrix,
    write_sidecar,
)
from atlas_tools.common.provenance import (
    canonical_json_bytes,
    make_provenance,
    sha256_bytes,
    sha256_file,
    write_sidecar,
)

__all__ = [
    "LayoutArtifact",
    "MatrixMeta",
    "canonical_json_bytes",
    "exact_cosine_knn",
    "l2_normalize",
    "load_layout",
    "load_matrix",
    "prefix_transform",
    "provenance_block",
    "sha256_bytes",
    "sha256_file",
    "write_layout",
    "write_matrix",
    "write_sidecar",
]
