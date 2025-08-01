use alloc::borrow::Cow;
use core::iter;
use std::collections::{HashMap, HashSet};

use error_stack::Report;
use hash_graph_authorization::policies::{
    action::ActionName, principal::actor::AuthenticatedActor,
};
use hash_graph_temporal_versioning::{Timestamp, TransactionTime};
use hash_graph_types::{self, Embedding};
use serde::{Deserialize, Serialize};
use type_system::{
    ontology::{
        BaseUrl, OntologyTemporalMetadata, VersionedUrl,
        data_type::{
            ConversionDefinition, Conversions, DataType, DataTypeMetadata, DataTypeWithMetadata,
        },
        provenance::{OntologyOwnership, ProvidedOntologyEditionProvenance},
    },
    principal::actor::ActorEntityUuid,
};

use crate::{
    error::{CheckPermissionError, InsertionError, QueryError, UpdateError},
    filter::Filter,
    query::ConflictBehavior,
    subgraph::{Subgraph, edges::GraphResolveDepths, temporal_axes::QueryTemporalAxesUnresolved},
};

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateDataTypeParams {
    pub schema: DataType,
    pub ownership: OntologyOwnership,
    pub conflict_behavior: ConflictBehavior,
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
pub struct UpdateDataTypesParams {
    pub schema: DataType,
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

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GetDataTypeConversionTargetsParams {
    pub data_type_ids: Vec<VersionedUrl>,
}

#[derive(Debug, Serialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase")]
pub struct DataTypeConversionTargets {
    pub title: String,
    pub conversions: Vec<ConversionDefinition>,
}

#[derive(Debug, Serialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase")]
pub struct GetDataTypeConversionTargetsResponse {
    pub conversions: HashMap<VersionedUrl, HashMap<VersionedUrl, DataTypeConversionTargets>>,
}

#[derive(Debug, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct HasPermissionForDataTypesParams<'a> {
    #[cfg_attr(feature = "utoipa", schema(value_type = String))]
    pub action: ActionName,
    pub data_type_ids: Cow<'a, [VersionedUrl]>,
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
    /// [`BaseUrl`]: type_system::ontology::BaseUrl
    fn create_data_type(
        &mut self,
        actor_id: ActorEntityUuid,
        params: CreateDataTypeParams,
    ) -> impl Future<Output = Result<DataTypeMetadata, Report<InsertionError>>> + Send
    where
        Self: Send,
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
    /// [`BaseUrl`]: type_system::ontology::BaseUrl
    fn create_data_types<P>(
        &mut self,
        actor_id: ActorEntityUuid,
        params: P,
    ) -> impl Future<Output = Result<Vec<DataTypeMetadata>, Report<InsertionError>>> + Send
    where
        P: IntoIterator<Item = CreateDataTypeParams, IntoIter: Send> + Send;

    /// Count the number of [`DataType`]s specified by the [`CountDataTypesParams`].
    ///
    /// # Errors
    ///
    /// - if the underlying store fails to count the data types.
    fn count_data_types(
        &self,
        actor_id: ActorEntityUuid,
        params: CountDataTypesParams<'_>,
    ) -> impl Future<Output = Result<usize, Report<QueryError>>> + Send;

    /// Get the [`DataType`]s specified by the [`GetDataTypesParams`].
    ///
    /// # Errors
    ///
    /// - if the requested [`DataType`] doesn't exist.
    fn get_data_types(
        &self,
        actor_id: ActorEntityUuid,
        params: GetDataTypesParams<'_>,
    ) -> impl Future<Output = Result<GetDataTypesResponse, Report<QueryError>>> + Send;

    /// Get the [`Subgraph`] specified by the [`GetDataTypeSubgraphParams`].
    ///
    /// # Errors
    ///
    /// - if the requested [`DataType`] doesn't exist.
    fn get_data_type_subgraph(
        &self,
        actor_id: ActorEntityUuid,
        params: GetDataTypeSubgraphParams<'_>,
    ) -> impl Future<Output = Result<GetDataTypeSubgraphResponse, Report<QueryError>>> + Send;

    /// Update the definition of an existing [`DataType`].
    ///
    /// # Errors
    ///
    /// - if the [`DataType`] doesn't exist.
    fn update_data_type(
        &mut self,
        actor_id: ActorEntityUuid,
        params: UpdateDataTypesParams,
    ) -> impl Future<Output = Result<DataTypeMetadata, Report<UpdateError>>> + Send
    where
        Self: Send,
    {
        async move {
            Ok(self
                .update_data_types(actor_id, iter::once(params))
                .await?
                .pop()
                .expect("created exactly one data type"))
        }
    }

    /// Update the definitions of the existing [`DataType`]s.
    ///
    /// # Errors
    ///
    /// - if the [`DataType`]s do not exist.
    fn update_data_types<P>(
        &mut self,
        actor_id: ActorEntityUuid,
        params: P,
    ) -> impl Future<Output = Result<Vec<DataTypeMetadata>, Report<UpdateError>>> + Send
    where
        P: IntoIterator<Item = UpdateDataTypesParams, IntoIter: Send> + Send;

    /// Archives the definition of an existing [`DataType`].
    ///
    /// # Errors
    ///
    /// - if the [`DataType`] doesn't exist.
    fn archive_data_type(
        &mut self,
        actor_id: ActorEntityUuid,
        params: ArchiveDataTypeParams,
    ) -> impl Future<Output = Result<OntologyTemporalMetadata, Report<UpdateError>>> + Send;

    /// Restores the definition of an existing [`DataType`].
    ///
    /// # Errors
    ///
    /// - if the [`DataType`] doesn't exist.
    fn unarchive_data_type(
        &mut self,
        actor_id: ActorEntityUuid,
        params: UnarchiveDataTypeParams,
    ) -> impl Future<Output = Result<OntologyTemporalMetadata, Report<UpdateError>>> + Send;

    fn update_data_type_embeddings(
        &mut self,
        actor_id: ActorEntityUuid,
        params: UpdateDataTypeEmbeddingParams<'_>,
    ) -> impl Future<Output = Result<(), Report<UpdateError>>> + Send;

    fn get_data_type_conversion_targets(
        &self,
        actor_id: ActorEntityUuid,
        params: GetDataTypeConversionTargetsParams,
    ) -> impl Future<Output = Result<GetDataTypeConversionTargetsResponse, Report<QueryError>>> + Send;

    /// Re-indexes the cache for data types.
    ///
    /// This is only needed if the schema of a data type has changed in place without bumping
    /// the version. This is a rare operation and should be avoided if possible.
    ///
    /// # Errors
    ///
    /// - if re-indexing the cache fails.
    fn reindex_data_type_cache(
        &mut self,
    ) -> impl Future<Output = Result<(), Report<UpdateError>>> + Send;

    /// Checks if the actor has permission for the given data types.
    ///
    /// Returns a set of [`VersionedUrl`]s the actor has permission for. If the actor has no
    /// permission for a data type, it will not be included in the set.
    ///
    /// # Errors
    ///
    /// - [`StoreError`] if the underlying store returns an error
    ///
    /// [`StoreError`]: CheckPermissionError::StoreError
    fn has_permission_for_data_types(
        &self,
        authenticated_actor: AuthenticatedActor,
        params: HasPermissionForDataTypesParams<'_>,
    ) -> impl Future<Output = Result<HashSet<VersionedUrl>, Report<CheckPermissionError>>> + Send;
}
