//! Binary schema identities for generation artifacts.

use super::storage::mmap::{ArtifactFormat, ArtifactKind, FormatVersion};

pub(crate) const CLASSIFIER_FORMAT: ArtifactFormat = format(1);
pub(crate) const BASE_ARTIFACT_FORMAT: ArtifactFormat = versioned_format(2, 3);
pub(crate) const LANDMARK_FORMAT: ArtifactFormat = format(3);
pub(crate) const SEMANTIC_GRAPH_FORMAT: ArtifactFormat = format(4);
pub(crate) const ANALYTIC_FORMAT: ArtifactFormat = format(5);
pub(crate) const RELATION_FORMAT: ArtifactFormat = versioned_format(6, 2);
pub(crate) const STRENGTH_CLASSIFIER_FORMAT: ArtifactFormat = format(7);

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
