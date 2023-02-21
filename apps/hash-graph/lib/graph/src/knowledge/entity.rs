mod query;

use std::{collections::HashMap, fmt};

use serde::{Deserialize, Serialize};
use tokio_postgres::types::{FromSql, ToSql};
use type_system::uri::{BaseUri, VersionedUri};
use utoipa::ToSchema;
use uuid::Uuid;

pub use self::query::{EntityQueryPath, EntityQueryPathVisitor, EntityQueryToken};
use crate::{
    identifier::{
        knowledge::{EntityId, EntityRecordId, EntityTemporalMetadata},
        time::{TemporalTagged, TimeAxis},
        EntityVertexId,
    },
    provenance::ProvenanceMetadata,
    store::{query::Filter, Record},
};

#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    Eq,
    Hash,
    PartialOrd,
    Ord,
    Serialize,
    Deserialize,
    ToSchema,
    FromSql,
    ToSql,
)]
#[postgres(transparent)]
#[repr(transparent)]
pub struct EntityUuid(Uuid);

impl EntityUuid {
    #[must_use]
    pub const fn new(uuid: Uuid) -> Self {
        Self(uuid)
    }

    #[must_use]
    pub const fn as_uuid(self) -> Uuid {
        self.0
    }
}

impl fmt::Display for EntityUuid {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(fmt, "{}", &self.0)
    }
}

#[derive(
    Debug, Copy, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, ToSchema, FromSql, ToSql,
)]
#[repr(transparent)]
#[postgres(transparent)]
pub struct LinkOrder(i32);

impl LinkOrder {
    #[must_use]
    pub const fn new(order: i32) -> Self {
        Self(order)
    }
}

/// The properties of an entity.
///
/// When expressed as JSON, this should validate against its respective entity type(s).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[schema(value_type = Object)]
pub struct EntityProperties(HashMap<BaseUri, serde_json::Value>);

impl EntityProperties {
    #[must_use]
    pub fn empty() -> Self {
        Self(HashMap::new())
    }
}

impl EntityProperties {
    #[must_use]
    pub const fn properties(&self) -> &HashMap<BaseUri, serde_json::Value> {
        &self.0
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct EntityLinkOrder {
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        rename = "leftToRightOrder"
    )]
    pub left_to_right: Option<LinkOrder>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        rename = "rightToLeftOrder"
    )]
    pub right_to_left: Option<LinkOrder>,
}

/// The associated information for 'Link' entities
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct LinkData {
    pub left_entity_id: EntityId,
    pub right_entity_id: EntityId,
    #[serde(flatten)]
    pub order: EntityLinkOrder,
}

/// The metadata of an [`Entity`] record.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, ToSchema)]
// TODO: deny_unknown_fields on other structs
// TODO: Make fields `pub` when `#[feature(mut_restriction)]` is available.
//   see https://github.com/rust-lang/rust/issues/105077
//   see https://app.asana.com/0/0/1203977361907407/f
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct EntityMetadata {
    record_id: EntityRecordId,
    temporal_versioning: EntityTemporalMetadata,
    #[schema(value_type = String)]
    entity_type_id: VersionedUri,
    provenance: ProvenanceMetadata,
    archived: bool,
}

impl EntityMetadata {
    #[must_use]
    pub const fn new(
        record_id: EntityRecordId,
        temporal_versioning: EntityTemporalMetadata,
        entity_type_id: VersionedUri,
        provenance: ProvenanceMetadata,
        archived: bool,
    ) -> Self {
        Self {
            record_id,
            temporal_versioning,
            entity_type_id,
            provenance,
            archived,
        }
    }

    #[must_use]
    pub const fn record_id(&self) -> EntityRecordId {
        self.record_id
    }

    #[must_use]
    pub const fn temporal_versioning(&self) -> &EntityTemporalMetadata {
        &self.temporal_versioning
    }

    #[must_use]
    pub const fn entity_type_id(&self) -> &VersionedUri {
        &self.entity_type_id
    }

    #[must_use]
    pub const fn provenance(&self) -> ProvenanceMetadata {
        self.provenance
    }

    #[must_use]
    pub const fn archived(&self) -> bool {
        self.archived
    }
}

/// A record of an [`Entity`] that has been persisted in the datastore, with its associated
/// metadata.
#[derive(Debug, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct Entity {
    pub properties: EntityProperties,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub link_data: Option<LinkData>,
    pub metadata: EntityMetadata,
}

impl Record for Entity {
    type QueryPath<'p> = EntityQueryPath<'p>;
    type VertexId = EntityVertexId;

    fn vertex_id(&self, time_axis: TimeAxis) -> Self::VertexId {
        let timestamp = match time_axis {
            TimeAxis::DecisionTime => self
                .metadata
                .temporal_versioning()
                .decision_time
                .start()
                .cast(),
            TimeAxis::TransactionTime => self
                .metadata
                .temporal_versioning()
                .transaction_time
                .start()
                .cast(),
        };
        EntityVertexId {
            base_id: self.metadata.record_id().entity_id,
            version: timestamp.into(),
        }
    }

    fn create_filter_for_vertex_id(vertex_id: &Self::VertexId) -> Filter<Self> {
        Filter::for_entity_by_entity_id(vertex_id.base_id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_entity(json: &str) {
        let json_value: serde_json::Value = serde_json::from_str(json).expect("invalid JSON");

        let properties: EntityProperties =
            serde_json::from_value(json_value.clone()).expect("invalid entity");

        assert_eq!(
            serde_json::to_value(properties.clone()).expect("could not serialize"),
            json_value,
            "{properties:#?}"
        );
    }

    #[test]
    fn book() {
        test_entity(graph_test_data::entity::BOOK_V1);
    }

    #[test]
    fn address() {
        test_entity(graph_test_data::entity::ADDRESS_V1);
    }

    #[test]
    fn organization() {
        test_entity(graph_test_data::entity::ORGANIZATION_V1);
    }

    #[test]
    fn building() {
        test_entity(graph_test_data::entity::BUILDING_V1);
    }

    #[test]
    fn person() {
        test_entity(graph_test_data::entity::PERSON_ALICE_V1);
    }

    #[test]
    fn playlist() {
        test_entity(graph_test_data::entity::PLAYLIST_V1);
    }

    #[test]
    fn song() {
        test_entity(graph_test_data::entity::SONG_V1);
    }

    #[test]
    fn page() {
        test_entity(graph_test_data::entity::PAGE_V1);
    }
}
