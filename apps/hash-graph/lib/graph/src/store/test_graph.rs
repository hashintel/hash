use async_trait::async_trait;
use error_stack::Result;
use futures::TryStreamExt;
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
    store::{crud::Read, query::Filter, InsertionError, QueryError},
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
pub struct BlockProtocolModuleVersions {
    pub graph: semver::Version,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TestData {
    pub block_protocol_module_versions: BlockProtocolModuleVersions,
    pub data_types: Vec<OntologyTypeRecord<DataType>>,
    pub property_types: Vec<OntologyTypeRecord<PropertyType>>,
    pub entity_types: Vec<OntologyTypeRecord<EntityType>>,
    pub entities: Vec<EntityRecord>,
    #[serde(default, skip_serializing_if = "CustomGlobalMetadata::is_empty")]
    pub custom: CustomGlobalMetadata,
}

#[async_trait]
#[expect(
    clippy::trait_duplication_in_bounds,
    reason = "False positive: the generics are different"
)]
pub trait TestStore:
    Read<OntologyTypeRecord<DataType>>
    + Read<OntologyTypeRecord<PropertyType>>
    + Read<OntologyTypeRecord<EntityType>>
    + Read<Entity>
{
    async fn read_test_graph(&self) -> Result<TestData, QueryError> {
        let data_types =
            Read::<OntologyTypeRecord<DataType>>::read_vec(self, &Filter::All(vec![]), None)
                .await?;

        let property_types =
            Read::<OntologyTypeRecord<PropertyType>>::read_vec(self, &Filter::All(vec![]), None)
                .await?;

        let entity_types =
            Read::<OntologyTypeRecord<EntityType>>::read_vec(self, &Filter::All(vec![]), None)
                .await?;

        let entities = Read::<Entity>::read(self, &Filter::All(vec![]), None)
            .await?
            .and_then(|entity| async move { Ok(EntityRecord::from(entity)) })
            .try_collect()
            .await?;

        Ok(TestData {
            block_protocol_module_versions: BlockProtocolModuleVersions {
                graph: semver::Version::new(0, 3, 0),
            },
            data_types,
            property_types,
            entity_types,
            entities,
            custom: CustomGlobalMetadata,
        })
    }

    #[expect(
        unused_variables,
        clippy::todo,
        reason = "This will be done in a follow-up"
    )]
    async fn write_test_graph(&mut self, data: TestData) -> Result<(), InsertionError> {
        todo!("https://app.asana.com/0/0/1204216809501006/f")
    }
}

#[expect(
    clippy::trait_duplication_in_bounds,
    reason = "False positive: the generics are different"
)]
impl<S> TestStore for S where
    S: Read<OntologyTypeRecord<DataType>>
        + Read<OntologyTypeRecord<PropertyType>>
        + Read<OntologyTypeRecord<EntityType>>
        + Read<Entity>
{
}
