"""Shared contracts: scalar aliases and provenance envelopes."""

from atlas_tools.common.data import (
    Dim,
    Fraction,
    JsonDict,
    K,
    Sha256Hex,
)
from atlas_tools.common.provenance import (
    Provenance,
    canonical_json_bytes,
    read_sidecar,
    sha256_bytes,
    sha256_file,
    write_sidecar,
)

__all__ = [
    "Dim",
    "Fraction",
    "JsonDict",
    "K",
    "Provenance",
    "Sha256Hex",
    "canonical_json_bytes",
    "read_sidecar",
    "sha256_bytes",
    "sha256_file",
    "write_sidecar",
]
