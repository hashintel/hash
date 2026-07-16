//! Binary schema identities for generation artifacts.
//!
//! An artifact format is the pair `(kind, version)`. Kind identifies its
//! semantic role and section vocabulary; version identifies the exact wire and
//! validation contract for that role. [`ArtifactView`] checks the pair before
//! exposing any typed section, so bytes from two structurally similar roles
//! cannot be reinterpreted accidentally.
//!
//! A version changes whenever section meaning, scalar type, shape, ordering, or
//! cross-section invariant changes. Adding a new artifact role requires a new
//! kind. These constants are deliberately centralized: manifest validation,
//! publication, loading, and golden fixtures must all compile against one
//! registry.
//!
//! [`ArtifactView`]: super::storage::mmap::ArtifactView

use super::storage::mmap::{ArtifactFormat, ArtifactKind, FormatVersion};

pub(crate) const CLASSIFIER_FORMAT: ArtifactFormat = format(1);
pub(crate) const BASE_ARTIFACT_FORMAT: ArtifactFormat = versioned_format(2, 5);
pub(crate) const LANDMARK_FORMAT: ArtifactFormat = format(3);
pub(crate) const SEMANTIC_GRAPH_FORMAT: ArtifactFormat = format(4);
pub(crate) const ANALYTIC_FORMAT: ArtifactFormat = versioned_format(5, 2);
pub(crate) const RELATION_FORMAT: ArtifactFormat = versioned_format(6, 4);
pub(crate) const STRENGTH_CLASSIFIER_FORMAT: ArtifactFormat = format(7);
pub(crate) const REPRESENTATION_FORMAT: ArtifactFormat = format(8);
pub(crate) const PERSISTENCE_REFERENCE_FORMAT: ArtifactFormat = versioned_format(9, 2);

#[inline]
const fn format(kind: u16) -> ArtifactFormat {
    versioned_format(kind, 1)
}

#[inline]
const fn versioned_format(kind: u16, version: u16) -> ArtifactFormat {
    ArtifactFormat {
        kind: ArtifactKind::new(kind),
        version: FormatVersion::new(version),
    }
}
