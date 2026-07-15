//! Persisted non-parametric reference merge trees.

use camino::Utf8Path;

use super::MergeTree;
use crate::salt::{
    format::PERSISTENCE_REFERENCE_FORMAT,
    hash::ContentHash,
    storage::mmap::{
        ArtifactSection, ArtifactWriteError, PublishedArtifact, SectionId, publish_artifact,
    },
};

pub(super) const CONFIGURATION_HASH: SectionId = SectionId::new(1);
pub(super) const SOURCE_HASH: SectionId = SectionId::new(2);
pub(super) const DENSITY_MAXIMUM: SectionId = SectionId::new(3);
pub(super) const LEAF_BIRTHS: SectionId = SectionId::new(4);
pub(super) const LEAF_DEATHS: SectionId = SectionId::new(5);
pub(super) const MERGE_TREE_HASH: SectionId = SectionId::new(6);
pub(super) const LEAF_PARENTS: SectionId = SectionId::new(7);
pub(super) const LEAF_REPRESENTATIVE_PIXELS: SectionId = SectionId::new(8);

/// Publishes the landmark-reference persistence tree.
///
/// # Errors
///
/// This returns an error when section construction or immutable publication
/// fails.
pub(crate) fn publish_persistence_reference(
    path: &Utf8Path,
    analytic_configuration: ContentHash,
    reference_source: ContentHash,
    tree: &MergeTree,
) -> Result<PublishedArtifact, ArtifactWriteError> {
    let density_maximum = [tree.density_maximum()];
    let births = tree
        .leaves()
        .iter()
        .map(|leaf| leaf.birth)
        .collect::<Vec<_>>();
    let deaths = tree
        .leaves()
        .iter()
        .map(|leaf| leaf.death)
        .collect::<Vec<_>>();
    let parents = tree
        .leaves()
        .iter()
        .map(|leaf| leaf.parent.unwrap_or(u64::MAX))
        .collect::<Vec<_>>();
    let representative_pixels = tree
        .leaves()
        .iter()
        .map(|leaf| u64::try_from(leaf.representative_pixel).expect("pixel index should fit u64"))
        .collect::<Vec<_>>();
    let merge_tree_hash = tree.content_hash();
    let sections = [
        ArtifactSection::new(CONFIGURATION_HASH, &[32], analytic_configuration.as_bytes()),
        ArtifactSection::new(SOURCE_HASH, &[32], reference_source.as_bytes()),
        ArtifactSection::new(DENSITY_MAXIMUM, &[1], &density_maximum),
        ArtifactSection::new(LEAF_BIRTHS, &[births.len()], &births),
        ArtifactSection::new(LEAF_DEATHS, &[deaths.len()], &deaths),
        ArtifactSection::new(MERGE_TREE_HASH, &[32], merge_tree_hash.as_bytes()),
        ArtifactSection::new(LEAF_PARENTS, &[parents.len()], &parents),
        ArtifactSection::new(
            LEAF_REPRESENTATIVE_PIXELS,
            &[representative_pixels.len()],
            &representative_pixels,
        ),
    ];
    let mut validated = Vec::with_capacity(sections.len());
    for section in sections {
        validated.push(section.map_err(|error| ArtifactWriteError::InvalidSection {
            index: validated.len(),
            error,
        })?);
    }
    publish_artifact(path, PERSISTENCE_REFERENCE_FORMAT, &validated)
}
