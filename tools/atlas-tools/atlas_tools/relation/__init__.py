"""Operations over relation-card sets: combining, verifying, and loading them."""

from atlas_tools.relation.concat import (
    ConcatCardRow,
    ConcatPaths,
    ConcatProvenance,
    VerifiedConcatArtifact,
    concat_relations,
    verify_concat_artifact,
)

__all__ = [
    "ConcatCardRow",
    "ConcatPaths",
    "ConcatProvenance",
    "VerifiedConcatArtifact",
    "concat_relations",
    "verify_concat_artifact",
]
