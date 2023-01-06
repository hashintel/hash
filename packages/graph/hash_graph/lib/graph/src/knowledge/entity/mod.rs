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
        knowledge::{EntityEditionId, EntityId, EntityVersion},
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
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct EntityLinkOrder {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    left_to_right_order: Option<LinkOrder>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    right_to_left_order: Option<LinkOrder>,
}

impl EntityLinkOrder {
    #[must_use]
    pub const fn new(
        left_to_right_order: Option<LinkOrder>,
        right_to_left_order: Option<LinkOrder>,
    ) -> Self {
        Self {
            left_to_right_order,
            right_to_left_order,
        }
    }

    #[must_use]
    pub const fn left_to_right(&self) -> Option<LinkOrder> {
        self.left_to_right_order
    }

    #[must_use]
    pub const fn right_to_left(&self) -> Option<LinkOrder> {
        self.right_to_left_order
    }
}

/// The associated information for 'Link' entities
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct LinkData {
    left_entity_id: EntityId,
    right_entity_id: EntityId,
    #[serde(flatten)]
    order: EntityLinkOrder,
}

impl LinkData {
    #[must_use]
    pub const fn new(
        left_entity_id: EntityId,
        right_entity_id: EntityId,
        left_to_right_order: Option<LinkOrder>,
        right_to_left_order: Option<LinkOrder>,
    ) -> Self {
        Self {
            left_entity_id,
            right_entity_id,
            order: EntityLinkOrder::new(left_to_right_order, right_to_left_order),
        }
    }

    #[must_use]
    pub const fn left_entity_id(&self) -> EntityId {
        self.left_entity_id
    }

    #[must_use]
    pub const fn right_entity_id(&self) -> EntityId {
        self.right_entity_id
    }

    #[must_use]
    pub const fn left_to_right_order(&self) -> Option<LinkOrder> {
        self.order.left_to_right_order
    }

    #[must_use]
    pub const fn right_to_left_order(&self) -> Option<LinkOrder> {
        self.order.right_to_left_order
    }
}

/// The metadata of an [`Entity`] record.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, ToSchema)]
// TODO: deny_unknown_fields on other structs
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct EntityMetadata {
    edition_id: EntityEditionId,
    version: EntityVersion,
    #[schema(value_type = String)]
    entity_type_id: VersionedUri,
    #[serde(rename = "provenance")]
    provenance_metadata: ProvenanceMetadata,
    archived: bool,
}

impl EntityMetadata {
    #[must_use]
    pub const fn new(
        edition_id: EntityEditionId,
        version: EntityVersion,
        entity_type_id: VersionedUri,
        provenance_metadata: ProvenanceMetadata,
        archived: bool,
    ) -> Self {
        Self {
            edition_id,
            version,
            entity_type_id,
            provenance_metadata,
            archived,
        }
    }

    #[must_use]
    pub const fn edition_id(&self) -> EntityEditionId {
        self.edition_id
    }

    #[must_use]
    pub const fn version(&self) -> &EntityVersion {
        &self.version
    }

    #[must_use]
    pub const fn entity_type_id(&self) -> &VersionedUri {
        &self.entity_type_id
    }

    #[must_use]
    pub const fn provenance_metadata(&self) -> ProvenanceMetadata {
        self.provenance_metadata
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
    properties: EntityProperties,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    link_data: Option<LinkData>,
    metadata: EntityMetadata,
}

impl Entity {
    #[must_use]
    pub const fn new(
        properties: EntityProperties,
        link_data: Option<LinkData>,
        identifier: EntityEditionId,
        version: EntityVersion,
        entity_type_id: VersionedUri,
        provenance_metadata: ProvenanceMetadata,
        archived: bool,
    ) -> Self {
        Self {
            properties,
            link_data,
            metadata: EntityMetadata::new(
                identifier,
                version,
                entity_type_id,
                provenance_metadata,
                archived,
            ),
        }
    }

    #[must_use]
    pub const fn properties(&self) -> &EntityProperties {
        &self.properties
    }

    #[must_use]
    pub const fn link_data(&self) -> Option<LinkData> {
        self.link_data
    }

    #[must_use]
    pub const fn metadata(&self) -> &EntityMetadata {
        &self.metadata
    }
}

impl Record for Entity {
    type EditionId = EntityEditionId;
    type QueryPath<'p> = EntityQueryPath<'p>;
    type VertexId = EntityVertexId;

    fn edition_id(&self) -> &Self::EditionId {
        &self.metadata.edition_id
    }

    fn vertex_id(&self) -> Self::VertexId {
        EntityVertexId::new(
            self.edition_id().base_id(),
            self.metadata().version().transaction_time().start,
        )
    }

    fn create_filter_for_vertex_id(vertex_id: &Self::VertexId) -> Filter<Self> {
        Filter::for_entity_by_vertex_id(*vertex_id)
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
        test_entity(graph_test_data::entity::PERSON_A_V1);
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
