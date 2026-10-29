//! The public form of an entity and of its ID.

use alloc::collections::BTreeSet;
use core::error::Error;

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use type_system::{
    knowledge::{
        self,
        entity::{EntityId, id::EntityUuid},
        property::PropertyObject,
    },
    ontology::VersionedUrl,
    principal::actor_group::WebId,
};

use super::{link::Link, property_metadata::PropertyObjectMetadata, provenance::Provenance};

/// An entity's web ID and UUID, joined by `~`.
///
/// Unlike [`EntityId`], it never names a draft.
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema, derive_more::Display,
)]
#[serde(try_from = "EntityId", into = "EntityId")]
#[schemars(
    with = "String",
    rename = "EntityId",
    description = "An entity's web ID and UUID, joined by `~`.",
    example = "8d86c8c3-d66d-43d1-859b-676c3bcaeadc~be2c5b2f-e3e1-4f26-a0c4-0f8b5e9c4a1d"
)]
pub(super) struct LiveEntityId(EntityId);

impl LiveEntityId {
    pub(super) const fn new(web_id: WebId, entity_uuid: EntityUuid) -> Self {
        Self(EntityId {
            web_id,
            entity_uuid,
            draft_id: None,
        })
    }
}

/// The entity ID names a draft.
#[derive(Debug, derive_more::Display)]
#[display("the entity ID names a draft")]
pub(super) struct DraftEntityIdError;

impl Error for DraftEntityIdError {}

impl TryFrom<EntityId> for LiveEntityId {
    type Error = DraftEntityIdError;

    fn try_from(entity_id: EntityId) -> Result<Self, Self::Error> {
        if entity_id.draft_id.is_some() {
            return Err(DraftEntityIdError);
        }
        Ok(Self(entity_id))
    }
}

impl From<LiveEntityId> for EntityId {
    fn from(entity_id: LiveEntityId) -> Self {
        entity_id.0
    }
}

/// An example of an entity, with its provenance and without a link.
fn entity_example() -> serde_json::Value {
    serde_json::json!({
        "metadata": {
            "entityId": "8d86c8c3-d66d-43d1-859b-676c3bcaeadc~be2c5b2f-e3e1-4f26-a0c4-0f8b5e9c4a1d",
            "entityTypeIds": ["https://hash.ai/@h/types/entity-type/user/v/1"],
            "provenance": {
                "actorType": "user",
                "origin": { "type": "external" },
            },
        },
        "properties": {
            "https://hash.ai/@h/types/property-type/preferred-name/": "Alice",
            "https://hash.ai/@h/types/property-type/shortname/": "alice",
        },
        "propertyMetadata": {
            "https://hash.ai/@h/types/property-type/preferred-name/": {
                "dataTypeId": "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
            },
            "https://hash.ai/@h/types/property-type/shortname/": {
                "dataTypeId": "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
            },
        },
    })
}

/// An entity the caller may view.
#[derive(Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
#[schemars(example = entity_example())]
pub(super) struct Entity {
    /// What identifies and classifies the entity, and where its data comes from.
    metadata: EntityMetadata,
    /// The entity's properties, keyed by the base URL of their property type.
    properties: PropertyObject,
    /// The data types of the values in `properties`, and where they come from.
    property_metadata: PropertyObjectMetadata,
    /// The entities it connects, if the entity is a link.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "Link")]
    link: Option<Link>,
}

impl Entity {
    /// The public form of `entity`, which `entity_id` identifies.
    pub(super) fn new(entity_id: LiveEntityId, entity: knowledge::Entity) -> Self {
        Self {
            metadata: EntityMetadata {
                entity_id,
                entity_type_ids: entity.metadata.entity_type_ids.into_iter().collect(),
                provenance: Provenance::from_stored(entity.metadata.provenance.edition.provided),
            },
            properties: entity.properties,
            property_metadata: PropertyObjectMetadata::from_stored(entity.metadata.properties),
            link: entity.link_data.map(Link::from),
        }
    }
}

/// What identifies and classifies an entity, and where its data comes from.
#[derive(Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
struct EntityMetadata {
    /// The ID of the entity.
    entity_id: LiveEntityId,
    /// The entity types the entity is an instance of, without the types they inherit from.
    entity_type_ids: BTreeSet<VersionedUrl>,
    /// Where the data of the entity's current edition comes from, and how it reached HASH.
    provenance: Provenance,
}
