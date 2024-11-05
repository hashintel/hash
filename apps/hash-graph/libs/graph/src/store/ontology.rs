use alloc::borrow::Cow;
use core::iter;
use std::collections::HashMap;

use authorization::schema::{EntityTypeRelationAndSubject, PropertyTypeRelationAndSubject};
use error_stack::Report;
use graph_types::{
    Embedding,
    account::{AccountId, EditionCreatedById},
    ontology::{
        EntityTypeMetadata, EntityTypeWithMetadata, OntologyTemporalMetadata,
        OntologyTypeClassificationMetadata, PropertyTypeMetadata, PropertyTypeWithMetadata,
        ProvidedOntologyEditionProvenance,
    },
    owned_by_id::OwnedById,
};
use hash_graph_store::{
    ConflictBehavior,
    error::{InsertionError, QueryError, UpdateError},
    filter::Filter,
    subgraph::{Subgraph, edges::GraphResolveDepths, temporal_axes::QueryTemporalAxesUnresolved},
};
use serde::{Deserialize, Serialize};
use temporal_versioning::{Timestamp, TransactionTime};
use type_system::{
    schema::{ClosedEntityType, ClosedMultiEntityType, EntityType, PropertyType},
    url::VersionedUrl,
};

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
    ) -> impl Future<Output = Result<PropertyTypeMetadata, Report<InsertionError>>> + Send
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
    ) -> impl Future<Output = Result<Vec<PropertyTypeMetadata>, Report<InsertionError>>> + Send
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
    ) -> impl Future<Output = Result<usize, Report<QueryError>>> + Send;

    /// Get the [`Subgraph`] specified by the [`GetPropertyTypeSubgraphParams`].
    ///
    /// # Errors
    ///
    /// - if the requested [`PropertyType`] doesn't exist.
    fn get_property_type_subgraph(
        &self,
        actor_id: AccountId,
        params: GetPropertyTypeSubgraphParams<'_>,
    ) -> impl Future<Output = Result<GetPropertyTypeSubgraphResponse, Report<QueryError>>> + Send;

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
    ) -> impl Future<Output = Result<GetPropertyTypesResponse, Report<QueryError>>> + Send;

    /// Update the definition of an existing [`PropertyType`].
    ///
    /// # Errors
    ///
    /// - if the [`PropertyType`] doesn't exist.
    fn update_property_type<R>(
        &mut self,
        actor_id: AccountId,
        params: UpdatePropertyTypesParams<R>,
    ) -> impl Future<Output = Result<PropertyTypeMetadata, Report<UpdateError>>> + Send
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
    ) -> impl Future<Output = Result<OntologyTemporalMetadata, Report<UpdateError>>> + Send;

    /// Restores the definition of an existing [`PropertyType`].
    ///
    /// # Errors
    ///
    /// - if the [`PropertyType`] doesn't exist.
    fn unarchive_property_type(
        &mut self,
        actor_id: AccountId,

        params: UnarchivePropertyTypeParams<'_>,
    ) -> impl Future<Output = Result<OntologyTemporalMetadata, Report<UpdateError>>> + Send;

    fn update_property_type_embeddings(
        &mut self,
        actor_id: AccountId,

        params: UpdatePropertyTypeEmbeddingParams<'_>,
    ) -> impl Future<Output = Result<(), Report<UpdateError>>> + Send;
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
    pub include_closed: bool,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(
        feature = "utoipa",
        schema(nullable = false, value_type = [VAR_CLOSED_ENTITY_TYPE])
    )]
    pub closed_entity_types: Option<Vec<ClosedEntityType>>,
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
pub struct GetClosedMultiEntityTypeParams {
    pub entity_type_ids: Vec<VersionedUrl>,
    pub temporal_axes: QueryTemporalAxesUnresolved,
    pub include_drafts: bool,
}

#[derive(Debug, Serialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase")]
pub struct GetClosedMultiEntityTypeResponse {
    #[cfg_attr(feature = "utoipa", schema(value_type = VAR_CLOSED_MULTI_ENTITY_TYPE))]
    pub entity_type: ClosedMultiEntityType,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdateEntityTypesParams<R> {
    pub schema: EntityType,
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
    ) -> impl Future<Output = Result<EntityTypeMetadata, Report<InsertionError>>> + Send
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
    ) -> impl Future<Output = Result<Vec<EntityTypeMetadata>, Report<InsertionError>>> + Send
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
    ) -> impl Future<Output = Result<usize, Report<QueryError>>> + Send;

    /// Get the [`Subgraph`]s specified by the [`GetEntityTypeSubgraphParams`].
    ///
    /// # Errors
    ///
    /// - if the requested [`EntityType`] doesn't exist.
    fn get_entity_type_subgraph(
        &self,
        actor_id: AccountId,
        params: GetEntityTypeSubgraphParams<'_>,
    ) -> impl Future<Output = Result<GetEntityTypeSubgraphResponse, Report<QueryError>>> + Send;

    /// Get the [`EntityType`]s specified by the [`GetEntityTypesParams`].
    ///
    /// # Errors
    ///
    /// - if the requested [`EntityType`] doesn't exist.
    fn get_entity_types(
        &self,
        actor_id: AccountId,
        params: GetEntityTypesParams<'_>,
    ) -> impl Future<Output = Result<GetEntityTypesResponse, Report<QueryError>>> + Send;

    /// Get the [`ClosedMultiEntityType`] specified by the [`GetClosedMultiEntityTypeParams`].
    ///
    /// # Errors
    ///
    /// - if the requested [`EntityType`] doesn't exist.
    fn get_closed_multi_entity_types(
        &self,
        actor_id: AccountId,
        params: GetClosedMultiEntityTypeParams,
    ) -> impl Future<Output = Result<GetClosedMultiEntityTypeResponse, Report<QueryError>>> + Send;

    /// Update the definition of an existing [`EntityType`].
    ///
    /// # Errors
    ///
    /// - if the [`EntityType`] doesn't exist.
    fn update_entity_type<R>(
        &mut self,
        actor_id: AccountId,
        params: UpdateEntityTypesParams<R>,
    ) -> impl Future<Output = Result<EntityTypeMetadata, Report<UpdateError>>> + Send
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
    ) -> impl Future<Output = Result<OntologyTemporalMetadata, Report<UpdateError>>> + Send;

    /// Restores the definition of an existing [`EntityType`].
    ///
    /// # Errors
    ///
    /// - if the [`EntityType`] doesn't exist.
    fn unarchive_entity_type(
        &mut self,
        actor_id: AccountId,

        params: UnarchiveEntityTypeParams,
    ) -> impl Future<Output = Result<OntologyTemporalMetadata, Report<UpdateError>>> + Send;

    fn update_entity_type_embeddings(
        &mut self,
        actor_id: AccountId,

        params: UpdateEntityTypeEmbeddingParams<'_>,
    ) -> impl Future<Output = Result<(), Report<UpdateError>>> + Send;

    /// Re-indexes the cache for entity types.
    ///
    /// This is only needed if the schema of a entity type has changed in place without bumping
    /// the version. This is a rare operation and should be avoided if possible.
    ///
    /// # Errors
    ///
    /// - if re-indexing the cache fails.
    fn reindex_entity_type_cache(
        &mut self,
    ) -> impl Future<Output = Result<(), Report<UpdateError>>> + Send;
}
