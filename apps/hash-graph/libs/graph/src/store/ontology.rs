use std::{borrow::Cow, future::Future, iter};

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
        OntologyTemporalMetadata, OntologyTypeClassificationMetadata, PropertyTypeMetadata,
        PropertyTypeWithMetadata,
    },
    Embedding,
};
use serde::Deserialize;
use temporal_client::TemporalClient;
use temporal_versioning::{Timestamp, TransactionTime};
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

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(
    rename_all = "camelCase",
    deny_unknown_fields,
    bound(deserialize = "R: Deserialize<'de>")
)]
pub struct CreateDataTypeParams<R> {
    pub schema: DataType,
    pub classification: OntologyTypeClassificationMetadata,
    pub relationships: R,
    pub conflict_behavior: ConflictBehavior,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GetDataTypesParams<'p> {
    #[serde(borrow)]
    pub query: StructuralQuery<'p, DataTypeWithMetadata>,
    pub after: Option<DataTypeVertexId>,
    pub limit: Option<usize>,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdateDataTypesParams<R> {
    pub schema: DataType,
    pub relationships: R,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ArchiveDataTypeParams<'a> {
    #[serde(borrow)]
    #[cfg_attr(feature = "utoipa", schema(value_type = SHARED_VersionedUrl))]
    pub data_type_id: Cow<'a, VersionedUrl>,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UnarchiveDataTypeParams {
    #[cfg_attr(feature = "utoipa", schema(value_type = SHARED_VersionedUrl))]
    pub data_type_id: VersionedUrl,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdateDataTypeEmbeddingParams<'a> {
    #[serde(borrow)]
    #[cfg_attr(feature = "utoipa", schema(value_type = SHARED_VersionedUrl))]
    pub data_type_id: Cow<'a, VersionedUrl>,
    #[serde(borrow)]
    pub embedding: Embedding<'a>,
    pub updated_at_transaction_time: Timestamp<TransactionTime>,
    pub reset: bool,
}

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
    fn create_data_type<A: AuthorizationApi + Send + Sync, R>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut A,
        temporal_client: Option<&TemporalClient>,
        params: CreateDataTypeParams<R>,
    ) -> impl Future<Output = Result<DataTypeMetadata, InsertionError>> + Send
    where
        Self: Send,
        R: IntoIterator<Item = DataTypeRelationAndSubject> + Send + Sync,
    {
        async move {
            Ok(self
                .create_data_types(
                    actor_id,
                    authorization_api,
                    temporal_client,
                    iter::once(params),
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
    fn create_data_types<A: AuthorizationApi + Send + Sync, P, R>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut A,
        temporal_client: Option<&TemporalClient>,
        params: P,
    ) -> impl Future<Output = Result<Vec<DataTypeMetadata>, InsertionError>> + Send
    where
        P: IntoIterator<Item = CreateDataTypeParams<R>, IntoIter: Send> + Send,
        R: IntoIterator<Item = DataTypeRelationAndSubject> + Send + Sync;

    /// Get the [`Subgraph`] specified by the [`StructuralQuery`].
    ///
    /// # Errors
    ///
    /// - if the requested [`DataType`] doesn't exist.
    fn get_data_type<A: AuthorizationApi + Sync>(
        &self,
        actor_id: AccountId,
        authorization_api: &A,
        params: GetDataTypesParams<'_>,
    ) -> impl Future<Output = Result<Subgraph, QueryError>> + Send;

    /// Update the definition of an existing [`DataType`].
    ///
    /// # Errors
    ///
    /// - if the [`DataType`] doesn't exist.
    fn update_data_type<A: AuthorizationApi + Send + Sync, R>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut A,
        temporal_client: Option<&TemporalClient>,
        params: UpdateDataTypesParams<R>,
    ) -> impl Future<Output = Result<DataTypeMetadata, UpdateError>> + Send
    where
        R: IntoIterator<Item = DataTypeRelationAndSubject> + Send + Sync;

    /// Archives the definition of an existing [`DataType`].
    ///
    /// # Errors
    ///
    /// - if the [`DataType`] doesn't exist.
    fn archive_data_type<A: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut A,
        params: ArchiveDataTypeParams,
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
        params: UnarchiveDataTypeParams,
    ) -> impl Future<Output = Result<OntologyTemporalMetadata, UpdateError>> + Send;

    fn update_data_type_embeddings<A: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut A,
        params: UpdateDataTypeEmbeddingParams<'_>,
    ) -> impl Future<Output = Result<(), UpdateError>> + Send;
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(
    rename_all = "camelCase",
    deny_unknown_fields,
    bound(deserialize = "R: Deserialize<'de>")
)]
pub struct CreatePropertyTypeParams<R> {
    pub schema: PropertyType,
    pub classification: OntologyTypeClassificationMetadata,
    pub relationships: R,
    pub conflict_behavior: ConflictBehavior,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GetPropertyTypesParams<'p> {
    #[serde(borrow)]
    pub query: StructuralQuery<'p, PropertyTypeWithMetadata>,
    pub after: Option<PropertyTypeVertexId>,
    pub limit: Option<usize>,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdatePropertyTypesParams<R> {
    pub schema: PropertyType,
    pub relationships: R,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ArchivePropertyTypeParams<'a> {
    #[serde(borrow)]
    #[cfg_attr(feature = "utoipa", schema(value_type = SHARED_VersionedUrl))]
    pub property_type_id: Cow<'a, VersionedUrl>,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UnarchivePropertyTypeParams<'a> {
    #[cfg_attr(feature = "utoipa", schema(value_type = SHARED_VersionedUrl))]
    pub property_type_id: Cow<'a, VersionedUrl>,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdatePropertyTypeEmbeddingParams<'a> {
    #[serde(borrow)]
    #[cfg_attr(feature = "utoipa", schema(value_type = SHARED_VersionedUrl))]
    pub property_type_id: Cow<'a, VersionedUrl>,
    #[serde(borrow)]
    pub embedding: Embedding<'a>,
    pub updated_at_transaction_time: Timestamp<TransactionTime>,
    pub reset: bool,
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
    fn create_property_type<A: AuthorizationApi + Send + Sync, R>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut A,
        temporal_client: Option<&TemporalClient>,
        params: CreatePropertyTypeParams<R>,
    ) -> impl Future<Output = Result<PropertyTypeMetadata, InsertionError>> + Send
    where
        Self: Send,
        R: IntoIterator<Item = PropertyTypeRelationAndSubject> + Send + Sync,
    {
        async move {
            Ok(self
                .create_property_types(
                    actor_id,
                    authorization_api,
                    temporal_client,
                    iter::once(params),
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
    fn create_property_types<A: AuthorizationApi + Send + Sync, P, R>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut A,
        temporal_client: Option<&TemporalClient>,
        params: P,
    ) -> impl Future<Output = Result<Vec<PropertyTypeMetadata>, InsertionError>> + Send
    where
        P: IntoIterator<Item = CreatePropertyTypeParams<R>, IntoIter: Send> + Send,
        R: IntoIterator<Item = PropertyTypeRelationAndSubject> + Send + Sync;

    /// Get the [`Subgraph`] specified by the [`StructuralQuery`].
    ///
    /// # Errors
    ///
    /// - if the requested [`PropertyType`] doesn't exist.
    fn get_property_type<A: AuthorizationApi + Sync>(
        &self,
        actor_id: AccountId,
        authorization_api: &A,
        params: GetPropertyTypesParams<'_>,
    ) -> impl Future<Output = Result<Subgraph, QueryError>> + Send;

    /// Update the definition of an existing [`PropertyType`].
    ///
    /// # Errors
    ///
    /// - if the [`PropertyType`] doesn't exist.
    fn update_property_type<A: AuthorizationApi + Send + Sync, R>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut A,
        temporal_client: Option<&TemporalClient>,
        params: UpdatePropertyTypesParams<R>,
    ) -> impl Future<Output = Result<PropertyTypeMetadata, UpdateError>> + Send
    where
        R: IntoIterator<Item = PropertyTypeRelationAndSubject> + Send + Sync;

    /// Archives the definition of an existing [`PropertyType`].
    ///
    /// # Errors
    ///
    /// - if the [`PropertyType`] doesn't exist.
    fn archive_property_type<A: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut A,
        params: ArchivePropertyTypeParams<'_>,
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
        params: UnarchivePropertyTypeParams<'_>,
    ) -> impl Future<Output = Result<OntologyTemporalMetadata, UpdateError>> + Send;

    fn update_property_type_embeddings<A: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut A,
        params: UpdatePropertyTypeEmbeddingParams<'_>,
    ) -> impl Future<Output = Result<(), UpdateError>> + Send;
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(
    rename_all = "camelCase",
    deny_unknown_fields,
    bound(deserialize = "R: Deserialize<'de>")
)]
pub struct CreateEntityTypeParams<R> {
    pub schema: EntityType,
    pub classification: OntologyTypeClassificationMetadata,
    pub label_property: Option<BaseUrl>,
    pub icon: Option<String>,
    pub relationships: R,
    pub conflict_behavior: ConflictBehavior,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GetEntityTypesParams<'p> {
    #[serde(borrow)]
    pub query: StructuralQuery<'p, EntityTypeWithMetadata>,
    pub after: Option<EntityTypeVertexId>,
    pub limit: Option<usize>,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdateEntityTypesParams<R> {
    pub schema: EntityType,
    pub label_property: Option<BaseUrl>,
    pub icon: Option<String>,
    pub relationships: R,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ArchiveEntityTypeParams<'a> {
    #[serde(borrow)]
    #[cfg_attr(feature = "utoipa", schema(value_type = SHARED_VersionedUrl))]
    pub entity_type_id: Cow<'a, VersionedUrl>,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UnarchiveEntityTypeParams<'a> {
    #[cfg_attr(feature = "utoipa", schema(value_type = SHARED_VersionedUrl))]
    pub entity_type_id: Cow<'a, VersionedUrl>,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdateEntityTypeEmbeddingParams<'a> {
    #[serde(borrow)]
    #[cfg_attr(feature = "utoipa", schema(value_type = SHARED_VersionedUrl))]
    pub entity_type_id: Cow<'a, VersionedUrl>,
    #[serde(borrow)]
    pub embedding: Embedding<'a>,
    pub updated_at_transaction_time: Timestamp<TransactionTime>,
    pub reset: bool,
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
    fn create_entity_type<A: AuthorizationApi + Send + Sync, R>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut A,
        temporal_client: Option<&TemporalClient>,
        params: CreateEntityTypeParams<R>,
    ) -> impl Future<Output = Result<EntityTypeMetadata, InsertionError>> + Send
    where
        Self: Send,
        R: IntoIterator<Item = EntityTypeRelationAndSubject> + Send + Sync,
    {
        async move {
            Ok(self
                .create_entity_types(
                    actor_id,
                    authorization_api,
                    temporal_client,
                    iter::once(params),
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
    fn create_entity_types<A: AuthorizationApi + Send + Sync, P, R>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut A,
        temporal_client: Option<&TemporalClient>,
        params: P,
    ) -> impl Future<Output = Result<Vec<EntityTypeMetadata>, InsertionError>> + Send
    where
        P: IntoIterator<Item = CreateEntityTypeParams<R>, IntoIter: Send> + Send,
        R: IntoIterator<Item = EntityTypeRelationAndSubject> + Send + Sync;

    /// Get the [`Subgraph`]s specified by the [`StructuralQuery`].
    ///
    /// # Errors
    ///
    /// - if the requested [`EntityType`] doesn't exist.
    fn get_entity_type<A: AuthorizationApi + Sync>(
        &self,
        actor_id: AccountId,
        authorization_api: &A,
        params: GetEntityTypesParams<'_>,
    ) -> impl Future<Output = Result<Subgraph, QueryError>> + Send;

    /// Update the definition of an existing [`EntityType`].
    ///
    /// # Errors
    ///
    /// - if the [`EntityType`] doesn't exist.
    fn update_entity_type<A: AuthorizationApi + Send + Sync, R>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut A,
        temporal_client: Option<&TemporalClient>,
        params: UpdateEntityTypesParams<R>,
    ) -> impl Future<Output = Result<EntityTypeMetadata, UpdateError>> + Send
    where
        R: IntoIterator<Item = EntityTypeRelationAndSubject> + Send + Sync;

    /// Archives the definition of an existing [`EntityType`].
    ///
    /// # Errors
    ///
    /// - if the [`EntityType`] doesn't exist.
    fn archive_entity_type<A: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut A,
        params: ArchiveEntityTypeParams,
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
        params: UnarchiveEntityTypeParams,
    ) -> impl Future<Output = Result<OntologyTemporalMetadata, UpdateError>> + Send;

    fn update_entity_type_embeddings<A: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut A,
        params: UpdateEntityTypeEmbeddingParams<'_>,
    ) -> impl Future<Output = Result<(), UpdateError>> + Send;
}
