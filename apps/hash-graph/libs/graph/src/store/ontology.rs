use alloc::borrow::Cow;
use core::iter;
use std::collections::HashMap;

use authorization::schema::{
    DataTypeRelationAndSubject, EntityTypeRelationAndSubject, PropertyTypeRelationAndSubject,
};
use error_stack::Result;
use graph_types::{
    Embedding,
    account::{AccountId, EditionCreatedById},
    ontology::{
        DataTypeMetadata, DataTypeWithMetadata, EntityTypeMetadata, EntityTypeWithMetadata,
        OntologyTemporalMetadata, OntologyTypeClassificationMetadata, PropertyTypeMetadata,
        PropertyTypeWithMetadata, ProvidedOntologyEditionProvenance,
    },
    owned_by_id::OwnedById,
};
use hash_graph_store::{
    ConflictBehavior,
    filter::Filter,
    subgraph::{Subgraph, edges::GraphResolveDepths, temporal_axes::QueryTemporalAxesUnresolved},
};
use serde::{Deserialize, Serialize};
use temporal_versioning::{Timestamp, TransactionTime};
use type_system::{
    schema::{Conversions, DataType, EntityType, PropertyType},
    url::{BaseUrl, VersionedUrl},
};

use crate::store::{InsertionError, QueryError, UpdateError};

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
    #[serde(default, skip_serializing_if = "UserDefinedProvenanceData::is_empty")]
    pub provenance: ProvidedOntologyEditionProvenance,
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub conversions: HashMap<BaseUrl, Conversions>,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GetDataTypeSubgraphParams<'p> {
    #[serde(borrow)]
    pub filter: Filter<'p, DataTypeWithMetadata>,
    pub graph_resolve_depths: GraphResolveDepths,
    pub temporal_axes: QueryTemporalAxesUnresolved,
    pub include_drafts: bool,
    #[serde(default)]
    pub after: Option<VersionedUrl>,
    #[serde(default)]
    pub limit: Option<usize>,
    #[serde(default)]
    pub include_count: bool,
}

#[derive(Debug)]
pub struct GetDataTypeSubgraphResponse {
    pub subgraph: Subgraph,
    pub cursor: Option<VersionedUrl>,
    pub count: Option<usize>,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CountDataTypesParams<'p> {
    #[serde(borrow)]
    pub filter: Filter<'p, DataTypeWithMetadata>,
    pub temporal_axes: QueryTemporalAxesUnresolved,
    pub include_drafts: bool,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GetDataTypesParams<'p> {
    #[serde(borrow)]
    pub filter: Filter<'p, DataTypeWithMetadata>,
    pub temporal_axes: QueryTemporalAxesUnresolved,
    pub include_drafts: bool,
    #[serde(default)]
    pub after: Option<VersionedUrl>,
    #[serde(default)]
    pub limit: Option<usize>,
    #[serde(default)]
    pub include_count: bool,
}

#[derive(Debug, Serialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase")]
pub struct GetDataTypesResponse {
    pub data_types: Vec<DataTypeWithMetadata>,
    pub cursor: Option<VersionedUrl>,
    pub count: Option<usize>,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdateDataTypesParams<R> {
    pub schema: DataType,
    pub relationships: R,
    #[serde(default, skip_serializing_if = "UserDefinedProvenanceData::is_empty")]
    pub provenance: ProvidedOntologyEditionProvenance,
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub conversions: HashMap<BaseUrl, Conversions>,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ArchiveDataTypeParams<'a> {
    #[serde(borrow)]
    pub data_type_id: Cow<'a, VersionedUrl>,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UnarchiveDataTypeParams {
    pub data_type_id: VersionedUrl,
    #[serde(default, skip_serializing_if = "UserDefinedProvenanceData::is_empty")]
    pub provenance: ProvidedOntologyEditionProvenance,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdateDataTypeEmbeddingParams<'a> {
    #[serde(borrow)]
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
    fn create_data_type<R>(
        &mut self,
        actor_id: AccountId,
        params: CreateDataTypeParams<R>,
    ) -> impl Future<Output = Result<DataTypeMetadata, InsertionError>> + Send
    where
        Self: Send,
        R: IntoIterator<Item = DataTypeRelationAndSubject> + Send + Sync,
    {
        async move {
            Ok(self
                .create_data_types(actor_id, iter::once(params))
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
    fn create_data_types<P, R>(
        &mut self,
        actor_id: AccountId,
        params: P,
    ) -> impl Future<Output = Result<Vec<DataTypeMetadata>, InsertionError>> + Send
    where
        P: IntoIterator<Item = CreateDataTypeParams<R>, IntoIter: Send> + Send,
        R: IntoIterator<Item = DataTypeRelationAndSubject> + Send + Sync;

    /// Count the number of [`DataType`]s specified by the [`CountDataTypesParams`].
    ///
    /// # Errors
    ///
    /// - if the underlying store fails to count the data types.
    fn count_data_types(
        &self,
        actor_id: AccountId,
        params: CountDataTypesParams<'_>,
    ) -> impl Future<Output = Result<usize, QueryError>> + Send;

    /// Get the [`DataTypes`] specified by the [`GetDataTypesParams`].
    ///
    /// # Errors
    ///
    /// - if the requested [`DataType`] doesn't exist.
    ///
    /// [`DataTypes`]: DataType
    fn get_data_types(
        &self,
        actor_id: AccountId,
        params: GetDataTypesParams<'_>,
    ) -> impl Future<Output = Result<GetDataTypesResponse, QueryError>> + Send;

    /// Get the [`Subgraph`] specified by the [`GetDataTypeSubgraphParams`].
    ///
    /// # Errors
    ///
    /// - if the requested [`DataType`] doesn't exist.
    fn get_data_type_subgraph(
        &self,
        actor_id: AccountId,
        params: GetDataTypeSubgraphParams<'_>,
    ) -> impl Future<Output = Result<GetDataTypeSubgraphResponse, QueryError>> + Send;

    /// Update the definition of an existing [`DataType`].
    ///
    /// # Errors
    ///
    /// - if the [`DataType`] doesn't exist.
    fn update_data_type<R>(
        &mut self,
        actor_id: AccountId,
        params: UpdateDataTypesParams<R>,
    ) -> impl Future<Output = Result<DataTypeMetadata, UpdateError>> + Send
    where
        R: IntoIterator<Item = DataTypeRelationAndSubject> + Send + Sync;

    /// Archives the definition of an existing [`DataType`].
    ///
    /// # Errors
    ///
    /// - if the [`DataType`] doesn't exist.
    fn archive_data_type(
        &mut self,
        actor_id: AccountId,
        params: ArchiveDataTypeParams,
    ) -> impl Future<Output = Result<OntologyTemporalMetadata, UpdateError>> + Send;

    /// Restores the definition of an existing [`DataType`].
    ///
    /// # Errors
    ///
    /// - if the [`DataType`] doesn't exist.
    fn unarchive_data_type(
        &mut self,
        actor_id: AccountId,

        params: UnarchiveDataTypeParams,
    ) -> impl Future<Output = Result<OntologyTemporalMetadata, UpdateError>> + Send;

    fn update_data_type_embeddings(
        &mut self,
        actor_id: AccountId,

        params: UpdateDataTypeEmbeddingParams<'_>,
    ) -> impl Future<Output = Result<(), UpdateError>> + Send;

    /// Re-indexes the cache for data types.
    ///
    /// This is only needed if the schema of a data type has changed in place without bumping
    /// the version. This is a rare operation and should be avoided if possible.
    ///
    /// # Errors
    ///
    /// - if re-indexing the cache fails.
    fn reindex_cache(&mut self) -> impl Future<Output = Result<(), UpdateError>> + Send;
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
    #[serde(default, skip_serializing_if = "UserDefinedProvenanceData::is_empty")]
    pub provenance: ProvidedOntologyEditionProvenance,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GetPropertyTypeSubgraphParams<'p> {
    #[serde(borrow)]
    pub filter: Filter<'p, PropertyTypeWithMetadata>,
    pub graph_resolve_depths: GraphResolveDepths,
    pub temporal_axes: QueryTemporalAxesUnresolved,
    pub include_drafts: bool,
    #[serde(default)]
    pub after: Option<VersionedUrl>,
    #[serde(default)]
    pub limit: Option<usize>,
    #[serde(default)]
    pub include_count: bool,
}

#[derive(Debug)]
pub struct GetPropertyTypeSubgraphResponse {
    pub subgraph: Subgraph,
    pub cursor: Option<VersionedUrl>,
    pub count: Option<usize>,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CountPropertyTypesParams<'p> {
    #[serde(borrow)]
    pub filter: Filter<'p, PropertyTypeWithMetadata>,
    pub temporal_axes: QueryTemporalAxesUnresolved,
    pub include_drafts: bool,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GetPropertyTypesParams<'p> {
    #[serde(borrow)]
    pub filter: Filter<'p, PropertyTypeWithMetadata>,
    pub temporal_axes: QueryTemporalAxesUnresolved,
    pub include_drafts: bool,
    #[serde(default)]
    pub after: Option<VersionedUrl>,
    #[serde(default)]
    pub limit: Option<usize>,
    #[serde(default)]
    pub include_count: bool,
}

#[derive(Debug, Serialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase")]
pub struct GetPropertyTypesResponse {
    pub property_types: Vec<PropertyTypeWithMetadata>,
    pub cursor: Option<VersionedUrl>,
    pub count: Option<usize>,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdatePropertyTypesParams<R> {
    pub schema: PropertyType,
    pub relationships: R,
    #[serde(default, skip_serializing_if = "UserDefinedProvenanceData::is_empty")]
    pub provenance: ProvidedOntologyEditionProvenance,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ArchivePropertyTypeParams<'a> {
    #[serde(borrow)]
    pub property_type_id: Cow<'a, VersionedUrl>,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UnarchivePropertyTypeParams<'a> {
    pub property_type_id: Cow<'a, VersionedUrl>,
    #[serde(default, skip_serializing_if = "UserDefinedProvenanceData::is_empty")]
    pub provenance: ProvidedOntologyEditionProvenance,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdatePropertyTypeEmbeddingParams<'a> {
    #[serde(borrow)]
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
    fn create_property_type<R>(
        &mut self,
        actor_id: AccountId,
        params: CreatePropertyTypeParams<R>,
    ) -> impl Future<Output = Result<PropertyTypeMetadata, InsertionError>> + Send
    where
        Self: Send,
        R: IntoIterator<Item = PropertyTypeRelationAndSubject> + Send + Sync,
    {
        async move {
            Ok(self
                .create_property_types(actor_id, iter::once(params))
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
    fn create_property_types<P, R>(
        &mut self,
        actor_id: AccountId,
        params: P,
    ) -> impl Future<Output = Result<Vec<PropertyTypeMetadata>, InsertionError>> + Send
    where
        P: IntoIterator<Item = CreatePropertyTypeParams<R>, IntoIter: Send> + Send,
        R: IntoIterator<Item = PropertyTypeRelationAndSubject> + Send + Sync;

    /// Count the number of [`PropertyType`]s specified by the [`CountPropertyTypesParams`].
    ///
    /// # Errors
    ///
    /// - if the underlying store fails to count the property types.
    fn count_property_types(
        &self,
        actor_id: AccountId,
        params: CountPropertyTypesParams<'_>,
    ) -> impl Future<Output = Result<usize, QueryError>> + Send;

    /// Get the [`Subgraph`] specified by the [`GetPropertyTypeSubgraphParams`].
    ///
    /// # Errors
    ///
    /// - if the requested [`PropertyType`] doesn't exist.
    fn get_property_type_subgraph(
        &self,
        actor_id: AccountId,
        params: GetPropertyTypeSubgraphParams<'_>,
    ) -> impl Future<Output = Result<GetPropertyTypeSubgraphResponse, QueryError>> + Send;

    /// Get the [`PropertyTypes`] specified by the [`GetPropertyTypesParams`].
    ///
    /// # Errors
    ///
    /// - if the requested [`PropertyType`] doesn't exist.
    ///
    /// [`PropertyTypes`]: PropertyType
    fn get_property_types(
        &self,
        actor_id: AccountId,
        params: GetPropertyTypesParams<'_>,
    ) -> impl Future<Output = Result<GetPropertyTypesResponse, QueryError>> + Send;

    /// Update the definition of an existing [`PropertyType`].
    ///
    /// # Errors
    ///
    /// - if the [`PropertyType`] doesn't exist.
    fn update_property_type<R>(
        &mut self,
        actor_id: AccountId,
        params: UpdatePropertyTypesParams<R>,
    ) -> impl Future<Output = Result<PropertyTypeMetadata, UpdateError>> + Send
    where
        R: IntoIterator<Item = PropertyTypeRelationAndSubject> + Send + Sync;

    /// Archives the definition of an existing [`PropertyType`].
    ///
    /// # Errors
    ///
    /// - if the [`PropertyType`] doesn't exist.
    fn archive_property_type(
        &mut self,
        actor_id: AccountId,

        params: ArchivePropertyTypeParams<'_>,
    ) -> impl Future<Output = Result<OntologyTemporalMetadata, UpdateError>> + Send;

    /// Restores the definition of an existing [`PropertyType`].
    ///
    /// # Errors
    ///
    /// - if the [`PropertyType`] doesn't exist.
    fn unarchive_property_type(
        &mut self,
        actor_id: AccountId,

        params: UnarchivePropertyTypeParams<'_>,
    ) -> impl Future<Output = Result<OntologyTemporalMetadata, UpdateError>> + Send;

    fn update_property_type_embeddings(
        &mut self,
        actor_id: AccountId,

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
    #[serde(default, skip_serializing_if = "UserDefinedProvenanceData::is_empty")]
    pub provenance: ProvidedOntologyEditionProvenance,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[expect(clippy::struct_excessive_bools, reason = "Parameter struct")]
pub struct GetEntityTypeSubgraphParams<'p> {
    #[serde(borrow)]
    pub filter: Filter<'p, EntityTypeWithMetadata>,
    pub graph_resolve_depths: GraphResolveDepths,
    pub temporal_axes: QueryTemporalAxesUnresolved,
    pub after: Option<VersionedUrl>,
    pub limit: Option<usize>,
    pub include_drafts: bool,
    #[serde(default)]
    pub include_count: bool,
    #[serde(default)]
    pub include_web_ids: bool,
    #[serde(default)]
    pub include_edition_created_by_ids: bool,
}

#[derive(Debug)]
pub struct GetEntityTypeSubgraphResponse {
    pub subgraph: Subgraph,
    pub cursor: Option<VersionedUrl>,
    pub count: Option<usize>,
    pub web_ids: Option<HashMap<OwnedById, usize>>,
    pub edition_created_by_ids: Option<HashMap<EditionCreatedById, usize>>,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CountEntityTypesParams<'p> {
    #[serde(borrow)]
    pub filter: Filter<'p, EntityTypeWithMetadata>,
    pub temporal_axes: QueryTemporalAxesUnresolved,
    pub include_drafts: bool,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[expect(clippy::struct_excessive_bools, reason = "Parameter struct")]
pub struct GetEntityTypesParams<'p> {
    #[serde(borrow)]
    pub filter: Filter<'p, EntityTypeWithMetadata>,
    pub temporal_axes: QueryTemporalAxesUnresolved,
    pub include_drafts: bool,
    #[serde(default)]
    pub after: Option<VersionedUrl>,
    #[serde(default)]
    pub limit: Option<usize>,
    #[serde(default)]
    pub include_count: bool,
    #[serde(default)]
    pub include_web_ids: bool,
    #[serde(default)]
    pub include_edition_created_by_ids: bool,
}

#[derive(Debug, Serialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase")]
pub struct GetEntityTypesResponse {
    pub entity_types: Vec<EntityTypeWithMetadata>,
    pub cursor: Option<VersionedUrl>,
    pub count: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    pub web_ids: Option<HashMap<OwnedById, usize>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    pub edition_created_by_ids: Option<HashMap<EditionCreatedById, usize>>,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdateEntityTypesParams<R> {
    pub schema: EntityType,
    pub label_property: Option<BaseUrl>,
    pub icon: Option<String>,
    pub relationships: R,
    #[serde(default, skip_serializing_if = "UserDefinedProvenanceData::is_empty")]
    pub provenance: ProvidedOntologyEditionProvenance,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ArchiveEntityTypeParams<'a> {
    #[serde(borrow)]
    pub entity_type_id: Cow<'a, VersionedUrl>,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UnarchiveEntityTypeParams<'a> {
    pub entity_type_id: Cow<'a, VersionedUrl>,
    #[serde(default, skip_serializing_if = "UserDefinedProvenanceData::is_empty")]
    pub provenance: ProvidedOntologyEditionProvenance,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdateEntityTypeEmbeddingParams<'a> {
    #[serde(borrow)]
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
    fn create_entity_type<R>(
        &mut self,
        actor_id: AccountId,
        params: CreateEntityTypeParams<R>,
    ) -> impl Future<Output = Result<EntityTypeMetadata, InsertionError>> + Send
    where
        Self: Send,
        R: IntoIterator<Item = EntityTypeRelationAndSubject> + Send + Sync,
    {
        async move {
            Ok(self
                .create_entity_types(actor_id, iter::once(params))
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
    fn create_entity_types<P, R>(
        &mut self,
        actor_id: AccountId,
        params: P,
    ) -> impl Future<Output = Result<Vec<EntityTypeMetadata>, InsertionError>> + Send
    where
        P: IntoIterator<Item = CreateEntityTypeParams<R>, IntoIter: Send> + Send,
        R: IntoIterator<Item = EntityTypeRelationAndSubject> + Send + Sync;

    /// Count the number of [`EntityType`]s specified by the [`CountEntityTypesParams`].
    ///
    /// # Errors
    ///
    /// - if the underlying store fails to count the entity types.
    fn count_entity_types(
        &self,
        actor_id: AccountId,
        params: CountEntityTypesParams<'_>,
    ) -> impl Future<Output = Result<usize, QueryError>> + Send;

    /// Get the [`Subgraph`]s specified by the [`GetEntityTypeSubgraphParams`].
    ///
    /// # Errors
    ///
    /// - if the requested [`EntityType`] doesn't exist.
    fn get_entity_type_subgraph(
        &self,
        actor_id: AccountId,
        params: GetEntityTypeSubgraphParams<'_>,
    ) -> impl Future<Output = Result<GetEntityTypeSubgraphResponse, QueryError>> + Send;

    /// Get the [`EntityTypes`] specified by the [`GetEntityTypesParams`].
    ///
    /// # Errors
    ///
    /// - if the requested [`EntityType`] doesn't exist.
    ///
    /// [`EntityTypes`]: EntityType
    fn get_entity_types(
        &self,
        actor_id: AccountId,
        params: GetEntityTypesParams<'_>,
    ) -> impl Future<Output = Result<GetEntityTypesResponse, QueryError>> + Send;

    /// Update the definition of an existing [`EntityType`].
    ///
    /// # Errors
    ///
    /// - if the [`EntityType`] doesn't exist.
    fn update_entity_type<R>(
        &mut self,
        actor_id: AccountId,
        params: UpdateEntityTypesParams<R>,
    ) -> impl Future<Output = Result<EntityTypeMetadata, UpdateError>> + Send
    where
        R: IntoIterator<Item = EntityTypeRelationAndSubject> + Send + Sync;

    /// Archives the definition of an existing [`EntityType`].
    ///
    /// # Errors
    ///
    /// - if the [`EntityType`] doesn't exist.
    fn archive_entity_type(
        &mut self,
        actor_id: AccountId,

        params: ArchiveEntityTypeParams,
    ) -> impl Future<Output = Result<OntologyTemporalMetadata, UpdateError>> + Send;

    /// Restores the definition of an existing [`EntityType`].
    ///
    /// # Errors
    ///
    /// - if the [`EntityType`] doesn't exist.
    fn unarchive_entity_type(
        &mut self,
        actor_id: AccountId,

        params: UnarchiveEntityTypeParams,
    ) -> impl Future<Output = Result<OntologyTemporalMetadata, UpdateError>> + Send;

    fn update_entity_type_embeddings(
        &mut self,
        actor_id: AccountId,

        params: UpdateEntityTypeEmbeddingParams<'_>,
    ) -> impl Future<Output = Result<(), UpdateError>> + Send;
}
