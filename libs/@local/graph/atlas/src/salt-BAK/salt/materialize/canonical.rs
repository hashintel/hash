use camino::Utf8Path;

use super::{
    CanonicalProvenance, ImportanceConfig, ImportanceInput, RankedPoint, error::BaseArtifactError,
    importance::rank_importance, publish_base_artifact,
};
use crate::salt::{identity::IdentityDirectory, storage::mmap::PublishedArtifact};

/// Published base field and its in-memory delivery order.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct MaterializedBase {
    pub artifact: PublishedArtifact,
    pub ranked: Vec<RankedPoint>,
}

/// Ranks and publishes one complete canonical base coordinate field.
///
/// Priority slices use generation-row order. The resulting artifact stores
/// coordinates in delivery order while retaining the complete row-to-entity
/// directory for external identity translation.
///
/// # Errors
///
/// This returns an error for inconsistent row counts, invalid ranking inputs,
/// invalid base rows, or failed immutable publication.
pub(crate) fn materialize_base_revision(
    path: &Utf8Path,
    identities: &IdentityDirectory,
    coordinates: &[[f64; 2]],
    importance: &[f64],
    semantic_priority: &[f64],
    config: ImportanceConfig<'_>,
    provenance: CanonicalProvenance,
) -> Result<MaterializedBase, BaseArtifactError> {
    let rows = identities.len();
    if coordinates.len() != rows || importance.len() != rows || semantic_priority.len() != rows {
        return Err(BaseArtifactError::PriorityRows {
            identities: rows,
            coordinates: coordinates.len(),
            importance: importance.len(),
            semantic: semantic_priority.len(),
        });
    }
    let inputs = identities
        .iter()
        .map(|(row, entity_id)| ImportanceInput {
            row,
            entity_id,
            coordinate: coordinates[row.as_usize()],
            importance: importance[row.as_usize()],
            semantic_priority: semantic_priority[row.as_usize()],
        })
        .collect::<Vec<_>>();
    let mut ranked = rank_importance(&inputs, config).map_err(BaseArtifactError::Importance)?;
    let artifact = publish_base_artifact(path, identities, coordinates, &mut ranked, provenance)?;
    Ok(MaterializedBase { artifact, ranked })
}
