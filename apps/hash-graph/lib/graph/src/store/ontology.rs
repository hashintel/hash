use std::iter;

use async_trait::async_trait;
use authorization::AuthorizationApi;
use error_stack::Result;
use graph_types::{
    account::AccountId,
    ontology::{
        DataTypeWithMetadata, EntityTypeMetadata, EntityTypeWithMetadata, OntologyElementMetadata,
        OntologyTemporalMetadata, PartialEntityTypeMetadata, PartialOntologyElementMetadata,
        PropertyTypeWithMetadata,
    },
};
use type_system::{
    url::{BaseUrl, VersionedUrl},
    DataType, EntityType, PropertyType,
};

use crate::{
    store::{crud, ConflictBehavior, InsertionError, QueryError, UpdateError},
    subgraph::{
        identifier::{DataTypeVertexId, EntityTypeVertexId, PropertyTypeVertexId},
        query::StructuralQuery,
        Subgraph,
    },
};

/// Describes the API of a store implementation for [`DataType`]s.
#[async_trait]
pub trait DataTypeStore: crud::Read<DataTypeWithMetadata> {
    /// Creates a new [`DataType`].
    ///
    /// # Errors:
    ///
    /// - if any account referred to by `metadata` does not exist.
    /// - if the [`BaseUrl`] of the `data_type` already exists.
    ///
    /// [`BaseUrl`]: type_system::url::BaseUrl
    async fn create_data_type<A: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut A,
        schema: DataType,
        metadata: PartialOntologyElementMetadata,
    ) -> Result<OntologyElementMetadata, InsertionError> {
        Ok(self
            .create_data_types(
                actor_id,
                authorization_api,
                iter::once((schema, metadata)),
                ConflictBehavior::Fail,
            )
            .await?
            .pop()
            .expect("created exactly one data type"))
    }

    /// Creates the provided [`DataType`]s.
    ///
    /// # Errors:
    ///
    /// - if any account referred to by the metadata does not exist.
    /// - if any [`BaseUrl`] of the data type already exists.
    ///
    /// [`BaseUrl`]: type_system::url::BaseUrl
    async fn create_data_types<A: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut A,
        data_types: impl IntoIterator<Item = (DataType, PartialOntologyElementMetadata), IntoIter: Send>
        + Send,
        on_conflict: ConflictBehavior,
    ) -> Result<Vec<OntologyElementMetadata>, InsertionError>;

    /// Get the [`Subgraph`] specified by the [`StructuralQuery`].
    ///
    /// # Errors
    ///
    /// - if the requested [`DataType`] doesn't exist.
    async fn get_data_type<A: AuthorizationApi + Sync>(
        &self,
        actor_id: AccountId,
        authorization_api: &A,
        query: &StructuralQuery<DataTypeWithMetadata>,
        after: Option<&DataTypeVertexId>,
        limit: Option<usize>,
    ) -> Result<Subgraph, QueryError>;

    /// Update the definition of an existing [`DataType`].
    ///
    /// # Errors
    ///
    /// - if the [`DataType`] doesn't exist.
    async fn update_data_type<A: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut A,
        data_type: DataType,
    ) -> Result<OntologyElementMetadata, UpdateError>;

    /// Archives the definition of an existing [`DataType`].
    ///
    /// # Errors
    ///
    /// - if the [`DataType`] doesn't exist.
    async fn archive_data_type<A: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut A,
        id: &VersionedUrl,
    ) -> Result<OntologyTemporalMetadata, UpdateError>;

    /// Restores the definition of an existing [`DataType`].
    ///
    /// # Errors
    ///
    /// - if the [`DataType`] doesn't exist.
    async fn unarchive_data_type<A: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut A,
        id: &VersionedUrl,
    ) -> Result<OntologyTemporalMetadata, UpdateError>;
}

/// Describes the API of a store implementation for [`PropertyType`]s.
#[async_trait]
pub trait PropertyTypeStore: crud::Read<PropertyTypeWithMetadata> {
    /// Creates a new [`PropertyType`].
    ///
    /// # Errors:
    ///
    /// - if any account referred to by `metadata` does not exist.
    /// - if the [`BaseUrl`] of the `property_type` already exists.
    ///
    /// [`BaseUrl`]: type_system::url::BaseUrl
    async fn create_property_type<A: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut A,
        schema: PropertyType,
        metadata: PartialOntologyElementMetadata,
    ) -> Result<OntologyElementMetadata, InsertionError> {
        Ok(self
            .create_property_types(
                actor_id,
                authorization_api,
                iter::once((schema, metadata)),
                ConflictBehavior::Fail,
            )
            .await?
            .pop()
            .expect("created exactly one property type"))
    }

    /// Creates the provided [`PropertyType`]s.
    ///
    /// # Errors:
    ///
    /// - if any account referred to by the metadata does not exist.
    /// - if any [`BaseUrl`] of the property type already exists.
    ///
    /// [`BaseUrl`]: type_system::url::BaseUrl
    async fn create_property_types<A: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut A,
        property_types: impl IntoIterator<
            Item = (PropertyType, PartialOntologyElementMetadata),
            IntoIter: Send,
        > + Send,
        on_conflict: ConflictBehavior,
    ) -> Result<Vec<OntologyElementMetadata>, InsertionError>;

    /// Get the [`Subgraph`] specified by the [`StructuralQuery`].
    ///
    /// # Errors
    ///
    /// - if the requested [`PropertyType`] doesn't exist.
    async fn get_property_type<A: AuthorizationApi + Sync>(
        &self,
        actor_id: AccountId,
        authorization_api: &A,
        query: &StructuralQuery<PropertyTypeWithMetadata>,
        after: Option<&PropertyTypeVertexId>,
        limit: Option<usize>,
    ) -> Result<Subgraph, QueryError>;

    /// Update the definition of an existing [`PropertyType`].
    ///
    /// # Errors
    ///
    /// - if the [`PropertyType`] doesn't exist.
    async fn update_property_type<A: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut A,
        property_type: PropertyType,
    ) -> Result<OntologyElementMetadata, UpdateError>;

    /// Archives the definition of an existing [`PropertyType`].
    ///
    /// # Errors
    ///
    /// - if the [`PropertyType`] doesn't exist.
    async fn archive_property_type<A: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut A,
        id: &VersionedUrl,
    ) -> Result<OntologyTemporalMetadata, UpdateError>;

    /// Restores the definition of an existing [`PropertyType`].
    ///
    /// # Errors
    ///
    /// - if the [`PropertyType`] doesn't exist.
    async fn unarchive_property_type<A: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut A,
        id: &VersionedUrl,
    ) -> Result<OntologyTemporalMetadata, UpdateError>;
}

/// Describes the API of a store implementation for [`EntityType`]s.
#[async_trait]
pub trait EntityTypeStore: crud::Read<EntityTypeWithMetadata> {
    /// Creates a new [`EntityType`].
    ///
    /// # Errors:
    ///
    /// - if any account referred to by `metadata` does not exist.
    /// - if the [`BaseUrl`] of the `entity_type` already exists.
    ///
    /// [`BaseUrl`]: type_system::url::BaseUrl
    async fn create_entity_type<A: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut A,
        schema: EntityType,
        metadata: PartialEntityTypeMetadata,
    ) -> Result<EntityTypeMetadata, InsertionError> {
        Ok(self
            .create_entity_types(
                actor_id,
                authorization_api,
                iter::once((schema, metadata)),
                ConflictBehavior::Fail,
            )
            .await?
            .pop()
            .expect("created exactly one entity type"))
    }

    /// Creates the provided [`EntityType`]s.
    ///
    /// # Errors:
    ///
    /// - if any account referred to by the metadata does not exist.
    /// - if any [`BaseUrl`] of the entity type already exists.
    ///
    /// [`BaseUrl`]: type_system::url::BaseUrl
    async fn create_entity_types<A: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut A,
        entity_types: impl IntoIterator<Item = (EntityType, PartialEntityTypeMetadata), IntoIter: Send>
        + Send,
        on_conflict: ConflictBehavior,
    ) -> Result<Vec<EntityTypeMetadata>, InsertionError>;

    /// Get the [`Subgraph`]s specified by the [`StructuralQuery`].
    ///
    /// # Errors
    ///
    /// - if the requested [`EntityType`] doesn't exist.
    async fn get_entity_type<A: AuthorizationApi + Sync>(
        &self,
        actor_id: AccountId,
        authorization_api: &A,
        query: &StructuralQuery<EntityTypeWithMetadata>,
        after: Option<&EntityTypeVertexId>,
        limit: Option<usize>,
    ) -> Result<Subgraph, QueryError>;

    /// Update the definition of an existing [`EntityType`].
    ///
    /// # Errors
    ///
    /// - if the [`EntityType`] doesn't exist.
    async fn update_entity_type<A: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut A,
        entity_type: EntityType,
        label_property: Option<BaseUrl>,
        icon: Option<String>,
    ) -> Result<EntityTypeMetadata, UpdateError>;

    /// Archives the definition of an existing [`EntityType`].
    ///
    /// # Errors
    ///
    /// - if the [`EntityType`] doesn't exist.
    async fn archive_entity_type<A: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut A,
        id: &VersionedUrl,
    ) -> Result<OntologyTemporalMetadata, UpdateError>;

    /// Restores the definition of an existing [`EntityType`].
    ///
    /// # Errors
    ///
    /// - if the [`EntityType`] doesn't exist.
    async fn unarchive_entity_type<A: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut A,
        id: &VersionedUrl,
    ) -> Result<OntologyTemporalMetadata, UpdateError>;
}
