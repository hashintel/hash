//! The writes an integration makes to the Graph.
//!
//! Each [`GraphOperation`] creates or updates an entity or a link, or archives one. Entity and
//! link IDs are derived from the integration's namespace and the source's own identifiers, so a
//! later run addresses the same entities, and operations carry the Graph's own property and
//! provenance types, so they convert to Graph requests without reshaping.

mod plan;
mod property;
#[cfg(test)]
mod tests;

use type_system::{
    knowledge::{
        entity::{id::EntityId, provenance::ProvidedEntityEditionProvenance},
        property::PropertyObjectWithMetadata,
    },
    ontology::VersionedUrl,
    principal::{actor::ActorType, actor_group::WebId},
    provenance::{OriginProvenance, OriginType, SourceProvenance, SourceType},
};

pub use self::{
    plan::{
        DuplicateWrite, GraphPlan, Payload, PlanIssue, PlannedWrite, Planner, UnencodableRequest,
    },
    property::{
        ConversionFailure, FailureReason, ResolvedProperties, SinkColumns, SinkRow,
        UnsupportedValue,
    },
};
use crate::derive_entity_id;

/// Creates or updates an entity with an ID derived from its source record.
#[derive(Debug, Clone, PartialEq)]
pub struct EntityUpsert {
    pub entity_id: EntityId,
    pub entity_type: VersionedUrl,
    pub properties: PropertyObjectWithMetadata,
    pub provenance: ProvidedEntityEditionProvenance,
}

impl EntityUpsert {
    /// An upsert of the entity of `entity_type` that `source_id` identifies in the source.
    #[must_use]
    pub fn new(
        web_id: WebId,
        namespace: &str,
        entity_type: VersionedUrl,
        source_id: &str,
        properties: PropertyObjectWithMetadata,
        provenance: ProvidedEntityEditionProvenance,
    ) -> Self {
        Self {
            entity_id: derive_entity_id(web_id, namespace, &entity_type, source_id),
            entity_type,
            properties,
            provenance,
        }
    }
}

/// One end of a link: the entity of `entity_type` that `source_id` identifies in the source.
#[derive(Debug, Clone, Copy)]
pub struct LinkEndpoint<'a> {
    pub entity_type: &'a VersionedUrl,
    pub source_id: &'a str,
}

/// Creates or updates a link entity between two entities an integration writes.
#[derive(Debug, Clone, PartialEq)]
pub struct LinkUpsert {
    pub link_id: EntityId,
    pub link_type: VersionedUrl,
    pub left_entity_id: EntityId,
    pub right_entity_id: EntityId,
    /// The link's own properties, or `None` to leave an existing link's properties unchanged.
    pub properties: Option<PropertyObjectWithMetadata>,
    pub provenance: ProvidedEntityEditionProvenance,
}

impl LinkUpsert {
    /// An upsert of the link of `link_type` from `left` to `right`.
    ///
    /// The link's ID is derived from its type and both endpoints, so the same pair linked the
    /// other way round is a different link.
    #[must_use]
    pub fn new(
        web_id: WebId,
        namespace: &str,
        link_type: VersionedUrl,
        left: LinkEndpoint<'_>,
        right: LinkEndpoint<'_>,
        properties: Option<PropertyObjectWithMetadata>,
        provenance: ProvidedEntityEditionProvenance,
    ) -> Self {
        let link_source_id = format!(
            "{}::{}::{}::{}",
            left.entity_type, left.source_id, right.entity_type, right.source_id
        );
        Self {
            link_id: derive_entity_id(web_id, namespace, &link_type, &link_source_id),
            left_entity_id: derive_entity_id(web_id, namespace, left.entity_type, left.source_id),
            right_entity_id: derive_entity_id(
                web_id,
                namespace,
                right.entity_type,
                right.source_id,
            ),
            link_type,
            properties,
            provenance,
        }
    }
}

/// Archives an entity or a link entity the integration wrote earlier.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Archive {
    pub entity_id: EntityId,
    pub provenance: ProvidedEntityEditionProvenance,
}

/// A write an integration makes to the Graph.
#[derive(Debug, Clone, PartialEq)]
pub enum GraphOperation {
    UpsertEntity(EntityUpsert),
    UpsertLink(LinkUpsert),
    ArchiveLink(Archive),
    ArchiveEntity(Archive),
}

impl GraphOperation {
    #[must_use]
    pub const fn kind(&self) -> OperationKind {
        match self {
            Self::UpsertEntity(_) => OperationKind::UpsertEntity,
            Self::UpsertLink(_) => OperationKind::UpsertLink,
            Self::ArchiveLink(_) => OperationKind::ArchiveLink,
            Self::ArchiveEntity(_) => OperationKind::ArchiveEntity,
        }
    }
}

/// The kind of a [`GraphOperation`], ordered as operations must be applied.
///
/// Entities exist before links between them are written, and links are archived before the
/// entities they connect, so sorting operations by kind never references a missing entity.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, derive_more::Display)]
pub enum OperationKind {
    UpsertEntity,
    UpsertLink,
    ArchiveLink,
    ArchiveEntity,
}

/// The provenance of an edition an integration writes: a machine writing through the API, with
/// `source` describing the material it read.
///
/// `source` is recorded as an integration, whatever kind it states.
#[must_use]
pub fn integration_provenance(source: SourceProvenance) -> ProvidedEntityEditionProvenance {
    ProvidedEntityEditionProvenance {
        sources: vec![SourceProvenance {
            ty: SourceType::Integration,
            ..source
        }],
        actor_type: ActorType::Machine,
        origin: OriginProvenance::from_empty_type(OriginType::Api),
    }
}
