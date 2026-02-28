use hashql_core::{
    id::{Id, bit_vec::FiniteBitSet},
    symbol::{ConstantSymbol, sym},
};

use super::access::{Access, AccessMode};
use crate::body::place::{Projection, ProjectionKind};

macro_rules! sym {
    ($($sym:tt)::*) => {
        sym::$($sym)::*::CONST
    };
}

/// Resolved entity field path.
///
/// Each variant identifies a specific storage location in the entity schema. Consumers can
/// exhaustively match on this to generate backend-specific access (SQL expressions, placement
/// decisions, etc.) without duplicating path resolution logic.
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Id)]
pub enum EntityPath {
    /// `properties.*` — JSONB column in `entity_editions`.
    Properties,
    /// `encodings.vectors` — embedding backend.
    Vectors,

    /// `metadata.record_id` — composite of [`EntityId`] + [`EditionId`].
    ///
    /// [`EntityId`]: Self::EntityId
    /// [`EditionId`]: Self::EditionId
    RecordId,
    /// `metadata.record_id.entity_id` — composite of `web_id` + `entity_uuid` + `draft_id`.
    EntityId,
    /// `metadata.record_id.entity_id.web_id` — `entity_temporal_metadata.web_id`.
    WebId,
    /// `metadata.record_id.entity_id.entity_uuid` — `entity_temporal_metadata.entity_uuid`.
    EntityUuid,
    /// `metadata.record_id.entity_id.draft_id` — `entity_temporal_metadata.draft_id`.
    DraftId,
    /// `metadata.record_id.edition_id` — `entity_temporal_metadata.entity_edition_id`.
    EditionId,

    /// `metadata.temporal_versioning` — composite of [`DecisionTime`] + [`TransactionTime`].
    ///
    /// [`DecisionTime`]: Self::DecisionTime
    /// [`TransactionTime`]: Self::TransactionTime
    TemporalVersioning,
    /// `metadata.temporal_versioning.decision_time` — `entity_temporal_metadata.decision_time`.
    DecisionTime,
    /// `metadata.temporal_versioning.transaction_time` —
    /// `entity_temporal_metadata.transaction_time`.
    TransactionTime,

    /// `metadata.entity_type_ids` — `entity_is_of_type` table (via JOIN).
    EntityTypeIds,
    /// `metadata.archived` — `entity_editions.archived`.
    Archived,
    /// `metadata.confidence` — `entity_editions.confidence`.
    Confidence,

    /// `metadata.provenance.inferred` — JSONB in `entity_ids.provenance`.
    ProvenanceInferred,
    /// `metadata.provenance.edition` — JSONB in `entity_editions.provenance`.
    ProvenanceEdition,
    /// `metadata.properties.*` — JSONB (`property_metadata`) in `entity_editions`.
    PropertyMetadata,

    /// `link_data.left_entity_id.web_id` — `entity_edge.target_web_id` (via
    /// `entity_has_left_entity`).
    LeftEntityWebId,
    /// `link_data.left_entity_id.entity_uuid` — `entity_edge.target_entity_uuid` (via
    /// `entity_has_left_entity`).
    LeftEntityUuid,
    /// `link_data.right_entity_id.web_id` — `entity_edge.target_web_id` (via
    /// `entity_has_right_entity`).
    RightEntityWebId,
    /// `link_data.right_entity_id.entity_uuid` — `entity_edge.target_entity_uuid` (via
    /// `entity_has_right_entity`).
    RightEntityUuid,
    /// `link_data.left_entity_confidence` — `entity_edge.confidence` (via
    /// `entity_has_left_entity`).
    LeftEntityConfidence,
    /// `link_data.right_entity_confidence` — `entity_edge.confidence` (via
    /// `entity_has_right_entity`).
    RightEntityConfidence,
    /// `link_data.left_entity_provenance` — JSONB in `entity_edge.provenance` (via
    /// `entity_has_left_entity`).
    LeftEntityProvenance,
    /// `link_data.right_entity_provenance` — JSONB in `entity_edge.provenance` (via
    /// `entity_has_right_entity`).
    RightEntityProvenance,
}

type FiniteBitSetWidth = u32;
const _: () = {
    assert!(
        (FiniteBitSetWidth::BITS as usize) >= core::mem::variant_count::<EntityPath>(),
        "entity path count exceeds finite bitset width"
    );
};

pub type EntityPathBitSet = FiniteBitSet<EntityPath, FiniteBitSetWidth>;

impl EntityPath {
    #[must_use]
    pub fn resolve(projections: &[Projection<'_>]) -> Option<(Self, usize)> {
        resolve(projections)
    }

    /// Returns the backend access mode for this path.
    pub(crate) const fn access(self) -> Access {
        match self {
            Self::Vectors => Access::Embedding(AccessMode::Direct),

            Self::RecordId | Self::EntityId | Self::TemporalVersioning => {
                Access::Postgres(AccessMode::Composite)
            }

            Self::Properties
            | Self::WebId
            | Self::EntityUuid
            | Self::DraftId
            | Self::EditionId
            | Self::DecisionTime
            | Self::TransactionTime
            | Self::EntityTypeIds
            | Self::Archived
            | Self::Confidence
            | Self::ProvenanceInferred
            | Self::ProvenanceEdition
            | Self::PropertyMetadata
            | Self::LeftEntityWebId
            | Self::LeftEntityUuid
            | Self::RightEntityWebId
            | Self::RightEntityUuid
            | Self::LeftEntityConfidence
            | Self::RightEntityConfidence
            | Self::LeftEntityProvenance
            | Self::RightEntityProvenance => Access::Postgres(AccessMode::Direct),
        }
    }

    const fn is_jsonb(self) -> bool {
        matches!(
            self,
            Self::Properties
                | Self::ProvenanceInferred
                | Self::ProvenanceEdition
                | Self::PropertyMetadata
                | Self::LeftEntityProvenance
                | Self::RightEntityProvenance
        )
    }
}

#[inline]
fn project(projections: &[Projection<'_>], index: &mut usize) -> Option<ConstantSymbol> {
    let projection = projections.get(*index).and_then(|projection| {
        if let ProjectionKind::FieldByName(name) = projection.kind {
            name.as_constant()
        } else {
            None
        }
    });

    if projection.is_some() {
        *index += 1;
    }

    projection
}

/// Resolves an entity field path to an [`EntityPath`].
///
/// Walks a sequence of field name projections through the entity schema and returns the resolved
/// path, or `None` if the path doesn't map to any known storage location (including synthesized
/// fields like `link_data.*.draft_id`).
#[expect(clippy::match_same_arms, clippy::allow_attributes)]
fn resolve(projections: &[Projection<'_>]) -> Option<(EntityPath, usize)> {
    #[allow(clippy::enum_glob_use, reason = "clarity")]
    use EntityPath::*;

    let mut index = 0;

    macro_rules! next {
        () => {
            project(projections, &mut index)
        };

        (else $cond:expr) => {{
            if index >= projections.len() {
                return Some(($cond, index));
            }

            next!()?
        }};
    }

    let path = match next!()? {
        // entity_editions.properties (JSONB)
        sym!(properties) => Properties,
        sym!(encodings) => match next!()? {
            sym!(vectors) => Vectors,
            _ => return None,
        },
        sym!(metadata) => match next!()? {
            sym!(record_id) => match next!(else RecordId) {
                sym!(entity_id) => match next!(else EntityId) {
                    sym!(web_id) => WebId,
                    sym!(entity_uuid) => EntityUuid,
                    sym!(draft_id) => DraftId,
                    _ => return None,
                },
                sym!(edition_id) => EditionId,
                _ => return None,
            },
            sym!(temporal_versioning) => match next!(else TemporalVersioning) {
                sym!(decision_time) => DecisionTime,
                sym!(transaction_time) => TransactionTime,
                _ => return None,
            },
            sym!(entity_type_ids) => EntityTypeIds,
            sym!(archived) => Archived,
            sym!(confidence) => Confidence,
            sym!(provenance) => match next!()? {
                sym!(inferred) => ProvenanceInferred,
                sym!(edition) => ProvenanceEdition,
                _ => return None,
            },
            sym!(properties) => PropertyMetadata,
            _ => return None,
        },
        sym!(link_data) => match next!()? {
            sym!(left_entity_id) => match next!()? {
                sym!(web_id) => LeftEntityWebId,
                sym!(entity_uuid) => LeftEntityUuid,
                // draft_id is synthesized (always None), not stored
                sym!(draft_id) => return None,
                _ => return None,
            },
            sym!(right_entity_id) => match next!()? {
                sym!(web_id) => RightEntityWebId,
                sym!(entity_uuid) => RightEntityUuid,
                // draft_id is synthesized (always None), not stored
                sym!(draft_id) => return None,
                _ => return None,
            },
            sym!(left_entity_confidence) => LeftEntityConfidence,
            sym!(right_entity_confidence) => RightEntityConfidence,
            sym!(left_entity_provenance) => LeftEntityProvenance,
            sym!(right_entity_provenance) => RightEntityProvenance,
            _ => return None,
        },

        _ => return None,
    };

    // JSONB paths allow arbitrary sub-paths; all others must be fully resolved
    if !path.is_jsonb() && projections.get(index).is_some() {
        return None;
    }

    Some((path, index))
}
