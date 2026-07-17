//! Immutable canonical and projector representation corpora.
//!
//! One artifact preserves the complete row-ordered canonical vectors, their
//! normalized projector prefixes, point roles, and the identities needed to
//! prove that all three columns share the generation row domain.

use camino::Utf8Path;

use super::{CANONICAL_DIMENSIONS, NORMALIZATION_EPSILON, PROJECTOR_DIMENSIONS};
use crate::salt::{
    format::REPRESENTATION_FORMAT,
    hash::ContentHash,
    identity::IdentityDirectory,
    projector::EntityRole,
    storage::mmap::{
        ArtifactSection, ArtifactWriteError, PublishedArtifact, SectionId, publish_artifact,
    },
};

pub(super) const CANONICAL: SectionId = SectionId::new(1);
pub(super) const PROJECTOR: SectionId = SectionId::new(2);
pub(super) const ROLES: SectionId = SectionId::new(3);
pub(super) const CANONICAL_HASH: SectionId = SectionId::new(4);
pub(super) const PROJECTOR_HASH: SectionId = SectionId::new(5);
pub(super) const IDENTITY_HASH: SectionId = SectionId::new(6);
pub(super) const NORMALIZATION_FLOOR: SectionId = SectionId::new(7);

/// Published representation bytes and their two corpus identities.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct PublishedRepresentations {
    pub artifact: PublishedArtifact,
    pub canonical_hash: ContentHash,
    pub projector_hash: ContentHash,
}

/// Publishes complete row-ordered representation and role columns.
///
/// `canonical` and `projector` use flat row-major storage. The artifact also
/// binds their generation-row order to `identities`.
///
/// # Errors
///
/// This returns an error when a column does not match its declared shape or
/// immutable publication fails.
pub(crate) fn publish_representations(
    path: &Utf8Path,
    identities: &IdentityDirectory,
    canonical: &[f32],
    projector: &[f32],
    roles: &[EntityRole],
) -> Result<PublishedRepresentations, ArtifactWriteError> {
    let rows = identities.len();
    let canonical_hash = super::canonical_corpus_hash(canonical);
    let projector_hash = super::projector_corpus_hash(projector);
    let identity_hash = identities.content_hash();
    let role_values = roles.iter().map(|role| role.index()).collect::<Vec<_>>();
    let normalization_floor = [NORMALIZATION_EPSILON];
    let sections = [
        ArtifactSection::new(CANONICAL, &[rows, CANONICAL_DIMENSIONS], canonical),
        ArtifactSection::new(PROJECTOR, &[rows, PROJECTOR_DIMENSIONS], projector),
        ArtifactSection::new(ROLES, &[rows], &role_values),
        ArtifactSection::new(CANONICAL_HASH, &[32], canonical_hash.as_bytes()),
        ArtifactSection::new(PROJECTOR_HASH, &[32], projector_hash.as_bytes()),
        ArtifactSection::new(IDENTITY_HASH, &[32], identity_hash.as_bytes()),
        ArtifactSection::new(NORMALIZATION_FLOOR, &[1], &normalization_floor),
    ];
    let mut validated = Vec::with_capacity(sections.len());
    for section in sections {
        validated.push(section.map_err(|error| ArtifactWriteError::InvalidSection {
            index: validated.len(),
            error,
        })?);
    }
    let artifact = publish_artifact(path, REPRESENTATION_FORMAT, &validated)?;
    Ok(PublishedRepresentations {
        artifact,
        canonical_hash,
        projector_hash,
    })
}
