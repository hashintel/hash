"""Shared contracts: raw f32 matrices, layout artifacts, provenance, kNN."""

from atlas_tools.common.knn import (
    exact_cosine_knn,
    l2_normalize,
    prefix_transform,
)
from atlas_tools.common.layout import (
    LayoutArtifact,
    LayoutDetails,
    LayoutProvenance,
    load_layout,
    write_layout,
)
from atlas_tools.common.matrix import (
    MatrixDetails,
    MatrixProvenance,
    load_matrix,
    write_matrix,
)
from atlas_tools.common.provenance import (
    Provenance,
    canonical_json_bytes,
    make_provenance,
    provenance_block,
    read_sidecar,
    sha256_bytes,
    sha256_file,
    write_sidecar,
)

__all__ = [
    "LayoutArtifact",
    "LayoutDetails",
    "LayoutProvenance",
    "MatrixDetails",
    "MatrixProvenance",
    "Provenance",
    "canonical_json_bytes",
    "exact_cosine_knn",
    "l2_normalize",
    "load_layout",
    "load_matrix",
    "make_provenance",
    "prefix_transform",
    "provenance_block",
    "read_sidecar",
    "sha256_bytes",
    "sha256_file",
    "write_layout",
    "write_matrix",
    "write_sidecar",
]
