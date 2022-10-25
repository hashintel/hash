use serde::{Deserialize, Serialize, Serializer};
use type_system::{uri::VersionedUri, DataType, EntityType, LinkType, PropertyType};
use utoipa::ToSchema;

use crate::provenance::{CreatedById, OwnedById, RemovedById, UpdatedById};

/// The metadata required to uniquely identify an ontology element that has been persisted in the
/// datastore.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PersistedOntologyIdentifier {
    #[schema(value_type = String)]
    uri: VersionedUri,
    // TODO: owned_by_id is not required to identify an ontology element
    //  https://app.asana.com/0/1202805690238892/1203214689883091/f
    owned_by_id: OwnedById,
}

impl PersistedOntologyIdentifier {
    #[must_use]
    pub const fn new(uri: VersionedUri, owned_by_id: OwnedById) -> Self {
        Self { uri, owned_by_id }
    }

    #[must_use]
    pub const fn uri(&self) -> &VersionedUri {
        &self.uri
    }

    #[must_use]
    pub const fn owned_by_id(&self) -> OwnedById {
        self.owned_by_id
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PersistedOntologyMetadata {
    identifier: PersistedOntologyIdentifier,
    created_by_id: CreatedById,
    updated_by_id: UpdatedById,
    removed_by_id: Option<RemovedById>,
}

impl PersistedOntologyMetadata {
    #[must_use]
    pub const fn new(
        identifier: PersistedOntologyIdentifier,
        created_by_id: CreatedById,
        updated_by_id: UpdatedById,
        removed_by_id: Option<RemovedById>,
    ) -> Self {
        Self {
            identifier,
            created_by_id,
            updated_by_id,
            removed_by_id,
        }
    }

    #[must_use]
    pub const fn identifier(&self) -> &PersistedOntologyIdentifier {
        &self.identifier
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, ToSchema)]
pub struct PersistedDataType {
    #[schema(value_type = VAR_DATA_TYPE)]
    #[serde(serialize_with = "serialize_ontology_type")]
    inner: DataType,
    metadata: PersistedOntologyMetadata,
}

impl PersistedDataType {
    #[must_use]
    pub const fn new(inner: DataType, metadata: PersistedOntologyMetadata) -> Self {
        Self { inner, metadata }
    }

    #[must_use]
    pub const fn inner(&self) -> &DataType {
        &self.inner
    }

    #[must_use]
    pub const fn metadata(&self) -> &PersistedOntologyMetadata {
        &self.metadata
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, ToSchema)]
pub struct PersistedPropertyType {
    #[schema(value_type = VAR_PROPERTY_TYPE)]
    #[serde(serialize_with = "serialize_ontology_type")]
    inner: PropertyType,
    metadata: PersistedOntologyMetadata,
}

impl PersistedPropertyType {
    #[must_use]
    pub const fn new(inner: PropertyType, metadata: PersistedOntologyMetadata) -> Self {
        Self { inner, metadata }
    }

    #[must_use]
    pub const fn inner(&self) -> &PropertyType {
        &self.inner
    }

    #[must_use]
    pub const fn metadata(&self) -> &PersistedOntologyMetadata {
        &self.metadata
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, ToSchema)]
pub struct PersistedLinkType {
    #[schema(value_type = VAR_LINK_TYPE)]
    #[serde(serialize_with = "serialize_ontology_type")]
    inner: LinkType,
    metadata: PersistedOntologyMetadata,
}

impl PersistedLinkType {
    #[must_use]
    pub const fn new(inner: LinkType, metadata: PersistedOntologyMetadata) -> Self {
        Self { inner, metadata }
    }

    #[must_use]
    pub const fn inner(&self) -> &LinkType {
        &self.inner
    }

    #[must_use]
    pub const fn metadata(&self) -> &PersistedOntologyMetadata {
        &self.metadata
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, ToSchema)]
pub struct PersistedEntityType {
    #[schema(value_type = VAR_ENTITY_TYPE)]
    #[serde(serialize_with = "serialize_ontology_type")]
    inner: EntityType,
    metadata: PersistedOntologyMetadata,
}

impl PersistedEntityType {
    #[must_use]
    pub const fn new(inner: EntityType, metadata: PersistedOntologyMetadata) -> Self {
        Self { inner, metadata }
    }

    #[must_use]
    pub const fn inner(&self) -> &EntityType {
        &self.inner
    }

    #[must_use]
    pub const fn metadata(&self) -> &PersistedOntologyMetadata {
        &self.metadata
    }
}

fn serialize_ontology_type<T, S>(
    ontology_type: &T,
    serializer: S,
) -> std::result::Result<S::Ok, S::Error>
where
    T: Clone,
    serde_json::Value: From<T>,
    S: Serializer,
{
    // This clone is necessary because `Serialize` requires us to take the param by reference here
    //  even though we only use it in places where we could move
    serde_json::Value::from(ontology_type.clone()).serialize(serializer)
}
