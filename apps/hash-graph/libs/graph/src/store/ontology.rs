use std::{future::Future, iter};

use authorization::{
    schema::{
        DataTypeRelationAndSubject, EntityTypeRelationAndSubject, PropertyTypeRelationAndSubject,
    },
    AuthorizationApi,
};
use error_stack::Result;
use graph_types::{
    account::AccountId,
    ontology::{
        DataTypeMetadata, DataTypeWithMetadata, EntityTypeMetadata, EntityTypeWithMetadata,
        OntologyTemporalMetadata, PartialDataTypeMetadata, PartialEntityTypeMetadata,
        PartialPropertyTypeMetadata, PropertyTypeMetadata, PropertyTypeWithMetadata,
    },
};
use type_system::{
    url::{BaseUrl, VersionedUrl},
    DataType, EntityType, PropertyType,
};

use crate::{
    store::{ConflictBehavior, InsertionError, QueryError, UpdateError},
    subgraph::{
        identifier::{DataTypeVertexId, EntityTypeVertexId, PropertyTypeVertexId},
        query::StructuralQuery,
        Subgraph,
    },
};

/// Describes the API of a store implementation for [`DataType`]s.
pub trait DataTypeStore {
    /// Creates a new [`DataType`].
    ///
    /// # Errors:
    ///
    /// - if any account referred to by `metadata` does not exist.
    /// - if the [`BaseUrl`] of the `data_type` already exists.
    ///
    /// [`BaseUrl`]: type_system::url::BaseUrl
    fn create_data_type<A: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut A,
        schema: DataType,
        metadata: PartialDataTypeMetadata,
        relationships: impl IntoIterator<Item = DataTypeRelationAndSubject> + Send,
    ) -> impl Future<Output = Result<DataTypeMetadata, InsertionError>> + Send
    where
        Self: Send,
    {
        async move {
            Ok(self
                .create_data_types(
                    actor_id,
                    authorization_api,
                    iter::once((schema, metadata)),
                    ConflictBehavior::Fail,
                    relationships,
                )
                .await?
                .pop()
                .expect("created exactly one data type"))
        }
    }

    /// Creates the provided [`DataType`]s.
    ///
    /// # Errors:
    ///
    /// - if any account referred to by the metadata does not exist.
    /// - if any [`BaseUrl`] of the data type already exists.
    ///
    /// [`BaseUrl`]: type_system::url::BaseUrl
    fn create_data_types<A: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut A,
        data_types: impl IntoIterator<Item = (DataType, PartialDataTypeMetadata), IntoIter: Send> + Send,
        on_conflict: ConflictBehavior,
        relationships: impl IntoIterator<Item = DataTypeRelationAndSubject> + Send,
    ) -> impl Future<Output = Result<Vec<DataTypeMetadata>, InsertionError>> + Send;

    /// Get the [`Subgraph`] specified by the [`StructuralQuery`].
    ///
    /// # Errors
    ///
    /// - if the requested [`DataType`] doesn't exist.
    fn get_data_type<A: AuthorizationApi + Sync>(
        &self,
        actor_id: AccountId,
        authorization_api: &A,
        query: &StructuralQuery<DataTypeWithMetadata>,
        after: Option<DataTypeVertexId>,
        limit: Option<usize>,
    ) -> impl Future<Output = Result<Subgraph, QueryError>> + Send;

    /// Update the definition of an existing [`DataType`].
    ///
    /// # Errors
    ///
    /// - if the [`DataType`] doesn't exist.
    fn update_data_type<A: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut A,
        data_type: DataType,
        relationships: impl IntoIterator<Item = DataTypeRelationAndSubject> + Send,
    ) -> impl Future<Output = Result<DataTypeMetadata, UpdateError>> + Send;

    /// Archives the definition of an existing [`DataType`].
    ///
    /// # Errors
    ///
    /// - if the [`DataType`] doesn't exist.
    fn archive_data_type<A: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut A,
        id: &VersionedUrl,
    ) -> impl Future<Output = Result<OntologyTemporalMetadata, UpdateError>> + Send;

    /// Restores the definition of an existing [`DataType`].
    ///
    /// # Errors
    ///
    /// - if the [`DataType`] doesn't exist.
    fn unarchive_data_type<A: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut A,
        id: &VersionedUrl,
    ) -> impl Future<Output = Result<OntologyTemporalMetadata, UpdateError>> + Send;
}

/// Describes the API of a store implementation for [`PropertyType`]s.
pub trait PropertyTypeStore {
    /// Creates a new [`PropertyType`].
    ///
    /// # Errors:
    ///
    /// - if any account referred to by `metadata` does not exist.
    /// - if the [`BaseUrl`] of the `property_type` already exists.
    ///
    /// [`BaseUrl`]: type_system::url::BaseUrl
    fn create_property_type<A: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut A,
        schema: PropertyType,
        metadata: PartialPropertyTypeMetadata,
        relationships: impl IntoIterator<Item = PropertyTypeRelationAndSubject> + Send,
    ) -> impl Future<Output = Result<PropertyTypeMetadata, InsertionError>> + Send
    where
        Self: Send,
    {
        async move {
            Ok(self
                .create_property_types(
                    actor_id,
                    authorization_api,
                    iter::once((schema, metadata)),
                    ConflictBehavior::Fail,
                    relationships,
                )
                .await?
                .pop()
                .expect("created exactly one property type"))
        }
    }

    /// Creates the provided [`PropertyType`]s.
    ///
    /// # Errors:
    ///
    /// - if any account referred to by the metadata does not exist.
    /// - if any [`BaseUrl`] of the property type already exists.
    ///
    /// [`BaseUrl`]: type_system::url::BaseUrl
    fn create_property_types<A: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut A,
        property_types: impl IntoIterator<
            Item = (PropertyType, PartialPropertyTypeMetadata),
            IntoIter: Send,
        > + Send,
        on_conflict: ConflictBehavior,
        relationships: impl IntoIterator<Item = PropertyTypeRelationAndSubject> + Send,
    ) -> impl Future<Output = Result<Vec<PropertyTypeMetadata>, InsertionError>> + Send;

    /// Get the [`Subgraph`] specified by the [`StructuralQuery`].
    ///
    /// # Errors
    ///
    /// - if the requested [`PropertyType`] doesn't exist.
    fn get_property_type<A: AuthorizationApi + Sync>(
        &self,
        actor_id: AccountId,
        authorization_api: &A,
        query: &StructuralQuery<'_, PropertyTypeWithMetadata>,
        after: Option<PropertyTypeVertexId>,
        limit: Option<usize>,
    ) -> impl Future<Output = Result<Subgraph, QueryError>> + Send;

    /// Update the definition of an existing [`PropertyType`].
    ///
    /// # Errors
    ///
    /// - if the [`PropertyType`] doesn't exist.
    fn update_property_type<A: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut A,
        property_type: PropertyType,
        relationships: impl IntoIterator<Item = PropertyTypeRelationAndSubject> + Send,
    ) -> impl Future<Output = Result<PropertyTypeMetadata, UpdateError>> + Send;

    /// Archives the definition of an existing [`PropertyType`].
    ///
    /// # Errors
    ///
    /// - if the [`PropertyType`] doesn't exist.
    fn archive_property_type<A: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut A,
        id: &VersionedUrl,
    ) -> impl Future<Output = Result<OntologyTemporalMetadata, UpdateError>> + Send;

    /// Restores the definition of an existing [`PropertyType`].
    ///
    /// # Errors
    ///
    /// - if the [`PropertyType`] doesn't exist.
    fn unarchive_property_type<A: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut A,
        id: &VersionedUrl,
    ) -> impl Future<Output = Result<OntologyTemporalMetadata, UpdateError>> + Send;
}

/// Describes the API of a store implementation for [`EntityType`]s.
pub trait EntityTypeStore {
    /// Creates a new [`EntityType`].
    ///
    /// # Errors:
    ///
    /// - if any account referred to by `metadata` does not exist.
    /// - if the [`BaseUrl`] of the `entity_type` already exists.
    ///
    /// [`BaseUrl`]: type_system::url::BaseUrl
    fn create_entity_type<A: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut A,
        schema: EntityType,
        metadata: PartialEntityTypeMetadata,
        relationships: impl IntoIterator<Item = EntityTypeRelationAndSubject> + Send,
    ) -> impl Future<Output = Result<EntityTypeMetadata, InsertionError>> + Send
    where
        Self: Send,
    {
        async move {
            Ok(self
                .create_entity_types(
                    actor_id,
                    authorization_api,
                    iter::once((schema, metadata)),
                    ConflictBehavior::Fail,
                    relationships,
                )
                .await?
                .pop()
                .expect("created exactly one entity type"))
        }
    }

    /// Creates the provided [`EntityType`]s.
    ///
    /// # Errors:
    ///
    /// - if any account referred to by the metadata does not exist.
    /// - if any [`BaseUrl`] of the entity type already exists.
    ///
    /// [`BaseUrl`]: type_system::url::BaseUrl
    fn create_entity_types<A: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut A,
        entity_types: impl IntoIterator<Item = (EntityType, PartialEntityTypeMetadata), IntoIter: Send>
        + Send,
        on_conflict: ConflictBehavior,
        relationships: impl IntoIterator<Item = EntityTypeRelationAndSubject> + Send,
    ) -> impl Future<Output = Result<Vec<EntityTypeMetadata>, InsertionError>> + Send;

    /// Get the [`Subgraph`]s specified by the [`StructuralQuery`].
    ///
    /// # Errors
    ///
    /// - if the requested [`EntityType`] doesn't exist.
    fn get_entity_type<A: AuthorizationApi + Sync>(
        &self,
        actor_id: AccountId,
        authorization_api: &A,
        query: &StructuralQuery<'_, EntityTypeWithMetadata>,
        after: Option<EntityTypeVertexId>,
        limit: Option<usize>,
    ) -> impl Future<Output = Result<Subgraph, QueryError>> + Send;

    /// Update the definition of an existing [`EntityType`].
    ///
    /// # Errors
    ///
    /// - if the [`EntityType`] doesn't exist.
    fn update_entity_type<A: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut A,
        entity_type: EntityType,
        label_property: Option<BaseUrl>,
        icon: Option<String>,
        relationships: impl IntoIterator<Item = EntityTypeRelationAndSubject> + Send,
    ) -> impl Future<Output = Result<EntityTypeMetadata, UpdateError>> + Send;

    /// Archives the definition of an existing [`EntityType`].
    ///
    /// # Errors
    ///
    /// - if the [`EntityType`] doesn't exist.
    fn archive_entity_type<A: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut A,
        id: &VersionedUrl,
    ) -> impl Future<Output = Result<OntologyTemporalMetadata, UpdateError>> + Send;

    /// Restores the definition of an existing [`EntityType`].
    ///
    /// # Errors
    ///
    /// - if the [`EntityType`] doesn't exist.
    fn unarchive_entity_type<A: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut A,
        id: &VersionedUrl,
    ) -> impl Future<Output = Result<OntologyTemporalMetadata, UpdateError>> + Send;
}
