use serde::{Deserialize, Serialize};
use time::OffsetDateTime;
use type_system::{url::VersionedUrl, DataType, EntityType, PropertyType};

use crate::{
    identifier::{
        knowledge::{EntityRecordId, EntityTemporalMetadata},
        ontology::OntologyTypeRecordId,
        time::{LeftClosedTemporalInterval, TransactionTime},
    },
    knowledge::{Entity, EntityProperties, LinkData},
    ontology::OntologyType,
    provenance::{OwnedById, ProvenanceMetadata},
};

#[derive(Debug, Default, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomEntityMetadata {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provenance: Option<ProvenanceMetadata>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub archived: Option<bool>,
}

impl CustomEntityMetadata {
    #[must_use]
    const fn is_empty(&self) -> bool {
        self.provenance.is_none() && self.archived.is_none()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EntityMetadata {
    pub record_id: EntityRecordId,
    pub entity_type_id: VersionedUrl,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub temporal_versioning: Option<EntityTemporalMetadata>,
    #[serde(default, skip_serializing_if = "CustomEntityMetadata::is_empty")]
    pub custom: CustomEntityMetadata,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EntityRecord {
    pub properties: EntityProperties,
    pub metadata: EntityMetadata,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub link_data: Option<LinkData>,
}

impl From<Entity> for EntityRecord {
    fn from(entity: Entity) -> Self {
        Self {
            properties: entity.properties,
            metadata: EntityMetadata {
                record_id: entity.metadata.record_id(),
                entity_type_id: entity.metadata.entity_type_id().clone(),
                temporal_versioning: Some(entity.metadata.temporal_versioning().clone()),
                custom: CustomEntityMetadata {
                    provenance: Some(entity.metadata.provenance()),
                    archived: Some(entity.metadata.archived()),
                },
            },
            link_data: entity.link_data,
        }
    }
}

#[derive(Debug, Default, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomOntologyMetadata {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provenance: Option<ProvenanceMetadata>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub temporal_versioning: Option<OntologyTemporalMetadata>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub owned_by_id: Option<OwnedById>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        with = "time::serde::iso8601::option"
    )]
    pub fetched_at: Option<OffsetDateTime>,
}

impl CustomOntologyMetadata {
    #[must_use]
    const fn is_empty(&self) -> bool {
        self.provenance.is_none()
            && self.temporal_versioning.is_none()
            && self.owned_by_id.is_none()
            && self.fetched_at.is_none()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OntologyTypeMetadata {
    pub record_id: OntologyTypeRecordId,
    #[serde(default, skip_serializing_if = "CustomOntologyMetadata::is_empty")]
    pub custom: CustomOntologyMetadata,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    rename_all = "camelCase",
    bound(
        serialize = "T::Representation: Serialize",
        deserialize = "T::Representation: Deserialize<'de>"
    )
)]
pub struct OntologyTypeRecord<T: OntologyType> {
    pub schema: T::Representation,
    pub metadata: OntologyTypeMetadata,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OntologyTemporalMetadata {
    pub transaction_time: Option<LeftClosedTemporalInterval<TransactionTime>>,
}

#[derive(Debug, Default, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomGlobalMetadata;

impl CustomGlobalMetadata {
    #[must_use]
    #[expect(clippy::unused_self)]
    const fn is_empty(&self) -> bool {
        true
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TestData {
    pub block_protocol_spec: semver::Version,
    pub data_types: Vec<OntologyTypeRecord<DataType>>,
    pub property_types: Vec<OntologyTypeRecord<PropertyType>>,
    pub entity_types: Vec<OntologyTypeRecord<EntityType>>,
    pub entities: Vec<EntityRecord>,
    #[serde(default, skip_serializing_if = "CustomGlobalMetadata::is_empty")]
    pub custom: CustomGlobalMetadata,
}
