//! Graph delivery contracts and operation ordering.

mod client;
#[cfg(any(test, feature = "test-utils"))]
mod fake;
mod plan;
mod property;

use core::future::Future;

use serde::{Deserialize, Serialize};
use serde_json::value::RawValue;
use type_system::{
    knowledge::{
        entity::{id::EntityId, provenance::ProvidedEntityEditionProvenance},
        property::PropertyObjectWithMetadata,
    },
    ontology::VersionedUrl,
    principal::actor::{ActorEntityUuid, ActorType},
    provenance::{OriginProvenance, OriginType, SourceProvenance, SourceType},
};

#[cfg(any(test, feature = "test-utils"))]
pub use self::fake::{FakeEntity, FakeGraph, Recorded};
pub use self::{
    client::{GraphClient, GraphError},
    plan::{PlannedUpsert, Planner, UnencodableRequest},
    property::{
        ConversionFailure, FailureReason, ResolvedProperties, SinkColumns, SinkRow,
        UnsupportedValue,
    },
};
use crate::InvalidText;

/// Creates or updates an entity whose identity was persisted by stage 2.
#[derive(Debug, Clone, PartialEq)]
pub struct EntityUpsert {
    pub entity_id: EntityId,
    pub entity_type: VersionedUrl,
    pub properties: PropertyObjectWithMetadata,
    pub provenance: ProvidedEntityEditionProvenance,
}

/// Creates or updates a directed link with its complete current property object.
#[derive(Debug, Clone, PartialEq)]
pub struct LinkUpsert {
    pub link_id: EntityId,
    pub link_type: VersionedUrl,
    pub left_entity_id: EntityId,
    pub right_entity_id: EntityId,
    pub properties: PropertyObjectWithMetadata,
    pub provenance: ProvidedEntityEditionProvenance,
}

/// Archives an entity or link written by the integration.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Archive {
    pub entity_id: EntityId,
    pub provenance: ProvidedEntityEditionProvenance,
}

/// Describes an integration edition as a machine writing through the API.
///
/// The source type is always [`SourceType::Integration`].
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

/// The order in which planned operations are delivered.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OperationKind {
    UpsertEntity,
    UpsertLink,
    ArchiveLink,
    ArchiveEntity,
}

impl OperationKind {
    /// The value persisted in a writes file.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::UpsertEntity => "upsert_entity",
            Self::UpsertLink => "upsert_link",
            Self::ArchiveLink => "archive_link",
            Self::ArchiveEntity => "archive_entity",
        }
    }

    /// Reads the operation stored in a writes file.
    ///
    /// # Errors
    /// Returns [`InvalidText`] for an unknown operation.
    pub fn from_stored(text: &str) -> Result<Self, InvalidText> {
        match text {
            "upsert_entity" => Ok(Self::UpsertEntity),
            "upsert_link" => Ok(Self::UpsertLink),
            "archive_link" => Ok(Self::ArchiveLink),
            "archive_entity" => Ok(Self::ArchiveEntity),
            _ => Err(InvalidText {
                text: text.into(),
                expected: "a stored graph operation",
            }),
        }
    }
}

/// An atomic Graph request result.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GraphResponse {
    Applied,
    Status(u16),
    Unreachable,
}

/// Sends exact planned request bodies as one atomic bulk operation.
pub trait Graph: Send + Sync {
    fn create(
        &self,
        actor: ActorEntityUuid,
        bodies: &[&RawValue],
    ) -> impl Future<Output = GraphResponse> + Send;
    fn patch(
        &self,
        actor: ActorEntityUuid,
        bodies: &[&RawValue],
    ) -> impl Future<Output = GraphResponse> + Send;
}

/// The Graph bulk endpoint operation.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RequestKind {
    /// POST /entities/bulk.
    Create,
    /// PATCH /entities/bulk.
    Patch,
}
