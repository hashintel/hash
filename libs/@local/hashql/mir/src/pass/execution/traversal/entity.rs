use core::{debug_assert_matches, num::NonZero, ops::Bound};

use hashql_core::{
    id::{
        Id,
        bit_vec::{BitRelations as _, FiniteBitSet},
    },
    symbol::{ConstantSymbol, sym},
};

use super::{
    TraversalLattice, VertexType,
    access::{Access, AccessMode},
};
use crate::{
    body::place::{Projection, ProjectionKind},
    pass::{
        analysis::{
            dataflow::lattice::{HasBottom, HasTop, JoinSemiLattice},
            size_estimation::{InformationRange, InformationUnit},
        },
        execution::target::{TargetArray, TargetBitSet, TargetId},
    },
};

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
#[id(const)]
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

/// Configuration for entity field transfer cost estimation.
///
/// Separates the variable-size components (properties, embeddings, provenance) from the
/// fixed-size schema fields. The fixed costs (UUIDs, timestamps, scalars) are constants on
/// [`EntityPath::estimate_size`]; this config provides the values that vary per entity type
/// or deployment.
#[derive(Debug, Copy, Clone)]
pub(crate) struct TransferCostConfig {
    /// Size of the entity's properties (the `T` parameter in `Entity<T>`).
    pub properties_size: InformationRange,
    /// Size of a single embedding vector.
    pub embedding_size: InformationRange,
    /// Size of `EntityEditionProvenance` JSONB (`entity_editions.provenance`).
    ///
    /// Variable structure: `created_by_id` + optional `archived_by_id` + `actor_type` +
    /// `OriginProvenance` (tag + optional strings) + `Vec<SourceProvenance>` (typically 0-2
    /// items, each with optional entity ID, authors, location, and timestamps).
    pub edition_provenance_size: InformationRange,
    /// Size of `PropertyProvenance` JSONB on entity edges (`entity_edge.provenance`).
    ///
    /// Just `Vec<SourceProvenance>`. Incoming edges are always empty; outgoing edges
    /// carry the caller-provided provenance, typically 0-1 sources.
    pub edge_provenance_size: InformationRange,
    /// Divisor for estimating property metadata size from properties size.
    ///
    /// Property metadata stores per-key metadata (confidence, provenance) rather than values,
    /// so it is lighter than properties. The estimate is `properties_size / divisor`.
    ///
    /// This is a placeholder until the confirmed entity type set is available, at which point
    /// the metadata size can be computed directly from the property key count.
    pub property_metadata_divisor: NonZero<u32>,
    /// Multiplier for the cost of transferring an entity to a target.
    ///
    /// For example, if the multiplier for Postgres is 2, then transferring an entity to Postgres
    /// costs twice as much as transferring it to the interpreter.
    pub target_multiplier: TargetArray<NonZero<u16>>,
}

impl TransferCostConfig {
    /// Creates a config with the current HASH schema defaults.
    ///
    /// Uses the known embedding dimension (`vector(3072)`) and a metadata-to-properties ratio
    /// of 1:4. Provenance sizes are derived from the actual JSONB structures stored by the
    /// graph service. Only `properties_size` varies per entity type.
    #[must_use]
    pub(crate) const fn new(properties_size: InformationRange) -> Self {
        Self {
            properties_size,
            embedding_size: InformationRange::value(InformationUnit::new(3072)),
            edition_provenance_size: InformationRange::new(
                InformationUnit::new(3),
                Bound::Included(InformationUnit::new(20)),
            ),
            edge_provenance_size: InformationRange::new(
                InformationUnit::new(0),
                Bound::Included(InformationUnit::new(10)),
            ),
            property_metadata_divisor: NonZero::new(4).expect("infallible"),
            target_multiplier: TargetArray::from_raw([NonZero::new(1).expect("infallible"); _]),
        }
    }
}

type FiniteBitSetWidth = u32;
const _: () = {
    assert!(
        (FiniteBitSetWidth::BITS as usize) >= core::mem::variant_count::<EntityPath>(),
        "entity path count exceeds finite bitset width"
    );
};

impl EntityPath {
    #[must_use]
    pub fn resolve(projections: &[Projection<'_>]) -> Option<(Self, usize)> {
        resolve(projections)
    }

    /// Returns the set of execution targets that natively serve this path.
    pub(crate) const fn origin(self) -> TargetBitSet {
        let mut set = TargetBitSet::new_empty(TargetId::VARIANT_COUNT_U32);

        match self.access() {
            Access::Postgres(_) => set.insert(TargetId::Postgres),
            Access::Embedding(_) => set.insert(TargetId::Embedding),
        }

        set
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

    /// Returns the transitive children of this path in the composite hierarchy.
    ///
    /// Composites cover their children: [`RecordId`](Self::RecordId) covers
    /// [`EntityId`](Self::EntityId) and all of its children, plus [`EditionId`](Self::EditionId).
    /// Leaf paths return an empty slice.
    const fn children(self) -> &'static [Self] {
        match self {
            Self::RecordId => &[
                Self::EntityId,
                Self::WebId,
                Self::EntityUuid,
                Self::DraftId,
                Self::EditionId,
            ],
            Self::EntityId => &[Self::WebId, Self::EntityUuid, Self::DraftId],
            Self::TemporalVersioning => &[Self::DecisionTime, Self::TransactionTime],
            Self::Properties
            | Self::Vectors
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
            | Self::RightEntityProvenance => &[],
        }
    }

    /// Returns the ancestor composites of this path, nearest first.
    ///
    /// For example, [`WebId`](Self::WebId) has ancestors
    /// [`EntityId`](Self::EntityId) and [`RecordId`](Self::RecordId).
    /// Top-level paths return an empty slice.
    pub(crate) const fn ancestors(self) -> &'static [Self] {
        match self {
            Self::WebId | Self::EntityUuid | Self::DraftId => &[Self::EntityId, Self::RecordId],
            Self::EntityId | Self::EditionId => &[Self::RecordId],
            Self::DecisionTime | Self::TransactionTime => &[Self::TemporalVersioning],
            Self::Properties
            | Self::Vectors
            | Self::RecordId
            | Self::TemporalVersioning
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
            | Self::RightEntityProvenance => &[],
        }
    }

    /// Returns the estimated transfer size for this path in information units.
    ///
    /// Fixed-size fields (UUIDs, timestamps, scalars) return known constants derived from the
    /// entity schema. [`Properties`](Self::Properties) depends on the entity's type parameter.
    /// [`PropertyMetadata`](Self::PropertyMetadata) is estimated at 1/4 of properties size,
    /// since it stores lightweight per-property-key metadata rather than values.
    pub(crate) fn estimate_size(self, config: &TransferCostConfig) -> InformationRange {
        #[expect(clippy::match_same_arms, reason = "readability")]
        #[expect(clippy::integer_division)]
        match self {
            Self::Properties => config.properties_size,
            Self::PropertyMetadata => {
                let divisor = config.property_metadata_divisor;
                let min = InformationUnit::new(config.properties_size.min().as_u32() / divisor);
                config.properties_size.inclusive_max().map_or_else(
                    || InformationRange::new(min, Bound::Unbounded),
                    |max| {
                        InformationRange::new(
                            min,
                            Bound::Included(InformationUnit::new(max.as_u32() / divisor)),
                        )
                    },
                )
            }

            Self::Vectors => config.embedding_size,

            // Composites: sum of leaf children
            Self::RecordId => InformationRange::value(InformationUnit::new(4)),
            Self::EntityId => InformationRange::value(InformationUnit::new(3)),
            Self::TemporalVersioning => InformationRange::value(InformationUnit::new(4)),

            // UUID fields
            Self::WebId
            | Self::EntityUuid
            | Self::DraftId
            | Self::EditionId
            | Self::LeftEntityWebId
            | Self::LeftEntityUuid
            | Self::RightEntityWebId
            | Self::RightEntityUuid => InformationRange::one(),

            // Temporal intervals (start + end timestamps)
            Self::DecisionTime | Self::TransactionTime => {
                InformationRange::value(InformationUnit::new(2))
            }

            // Type ID list (variable length, at least one type)
            Self::EntityTypeIds => InformationRange::new(InformationUnit::new(1), Bound::Unbounded),

            // Scalar metadata
            Self::Archived
            | Self::Confidence
            | Self::LeftEntityConfidence
            | Self::RightEntityConfidence => InformationRange::one(),

            // Provenance: inferred is a fixed structure (3 required + 2 optional scalars)
            Self::ProvenanceInferred => InformationRange::new(
                InformationUnit::new(3),
                Bound::Included(InformationUnit::new(5)),
            ),
            // Provenance: edition and edge have Vec<SourceProvenance>, sized from config
            Self::ProvenanceEdition => config.edition_provenance_size,
            Self::LeftEntityProvenance | Self::RightEntityProvenance => config.edge_provenance_size,
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

const HAS_ANCESTORS: [EntityPath; HAS_ANCESTOR_COUNT] = {
    let mut out = [EntityPath::Archived; HAS_ANCESTOR_COUNT];

    let mut index = 0;
    let mut ptr = 0;
    let paths = EntityPath::all();

    while ptr < paths.len() {
        if !paths[ptr].ancestors().is_empty() {
            out[index] = paths[ptr];
            index += 1;
        }

        ptr += 1;
    }

    out
};
const HAS_ANCESTOR_COUNT: usize = {
    let mut count = 0;
    let mut index = 0;
    let paths = EntityPath::all();

    while index < paths.len() {
        if !paths[index].ancestors().is_empty() {
            count += 1;
        }

        index += 1;
    }

    count
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct EntityPathBitSet(FiniteBitSet<EntityPath, FiniteBitSetWidth>);

impl EntityPathBitSet {
    const BOTTOM: Self = Self::new_empty();
    #[expect(clippy::cast_possible_truncation)]
    const TOP: Self = {
        let mut set = FiniteBitSet::new_empty(core::mem::variant_count::<EntityPath>() as u32);

        set.insert_range(.., core::mem::variant_count::<EntityPath>());

        let mut index = 0;
        while index < HAS_ANCESTOR_COUNT {
            set.remove(HAS_ANCESTORS[index]);
            index += 1;
        }

        Self(set)
    };

    #[expect(clippy::cast_possible_truncation)]
    #[must_use]
    pub const fn new_empty() -> Self {
        Self(FiniteBitSet::new_empty(
            core::mem::variant_count::<EntityPath>() as u32,
        ))
    }

    /// Inserts this path into `bitset` with composite swallowing.
    ///
    /// If an ancestor composite is already present, the insertion is a no-op (the ancestor
    /// already implies this path). If this path is a composite, any children already in the
    /// set are removed (the composite subsumes them).
    pub(crate) fn insert(&mut self, path: EntityPath) {
        for &ancestor in path.ancestors() {
            if self.0.contains(ancestor) {
                return;
            }
        }

        self.0.insert(path);

        for &child in path.children() {
            self.0.remove(child);
        }
    }

    pub(crate) fn contains(&self, path: EntityPath) -> bool {
        self.0.contains(path)
    }

    fn normalize(&mut self) {
        for path in &self.0 {
            for &ancestor in path.ancestors() {
                if self.0.contains(ancestor) {
                    self.0.remove(path);
                }
            }
        }
    }

    #[inline]
    pub(crate) const fn insert_all(&mut self) {
        *self = Self::TOP;
    }
}

impl HasTop<EntityPathBitSet> for TraversalLattice {
    fn top(&self) -> EntityPathBitSet {
        debug_assert_matches!(self.vertex(), VertexType::Entity);
        EntityPathBitSet::TOP
    }

    fn is_top(&self, value: &EntityPathBitSet) -> bool {
        debug_assert_matches!(self.vertex(), VertexType::Entity);
        *value == EntityPathBitSet::TOP
    }
}

impl HasBottom<EntityPathBitSet> for TraversalLattice {
    fn bottom(&self) -> EntityPathBitSet {
        debug_assert_matches!(self.vertex(), VertexType::Entity);
        EntityPathBitSet::BOTTOM
    }

    fn is_bottom(&self, value: &EntityPathBitSet) -> bool {
        debug_assert_matches!(self.vertex(), VertexType::Entity);
        *value == EntityPathBitSet::BOTTOM
    }
}

impl JoinSemiLattice<EntityPathBitSet> for TraversalLattice {
    fn join(&self, lhs: &mut EntityPathBitSet, rhs: &EntityPathBitSet) -> bool {
        debug_assert_matches!(self.vertex(), VertexType::Entity);

        let mut new = *lhs;

        new.0.union(&rhs.0);
        new.normalize();

        let has_changed = new != *lhs;
        *lhs = new;
        has_changed
    }

    fn join_owned(&self, mut lhs: EntityPathBitSet, rhs: &EntityPathBitSet) -> EntityPathBitSet
    where
        EntityPathBitSet: Sized,
    {
        debug_assert_matches!(self.vertex(), VertexType::Entity);

        lhs.0.union(&rhs.0);
        lhs.normalize();

        lhs
    }
}

impl const core::ops::Deref for EntityPathBitSet {
    type Target = FiniteBitSet<EntityPath, FiniteBitSetWidth>;

    #[inline]
    fn deref(&self) -> &Self::Target {
        &self.0
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
