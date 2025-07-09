use alloc::borrow::Cow;
use core::iter;
use std::collections::HashSet;

use error_stack::Report;
use hash_graph_authorization::{
    policies::{action::ActionName, principal::actor::AuthenticatedActor},
    schema::PropertyTypeRelationAndSubject,
};
use hash_graph_temporal_versioning::{Timestamp, TransactionTime};
use hash_graph_types::Embedding;
use serde::{Deserialize, Serialize};
use type_system::{
    ontology::{
        OntologyTemporalMetadata, VersionedUrl,
        property_type::{PropertyType, PropertyTypeMetadata, PropertyTypeWithMetadata},
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
#[serde(
    rename_all = "camelCase",
    deny_unknown_fields,
    bound(deserialize = "R: Deserialize<'de>")
)]
pub struct CreatePropertyTypeParams<R> {
    pub schema: PropertyType,
    pub ownership: OntologyOwnership,
    pub relationships: R,
    pub conflict_behavior: ConflictBehavior,
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

#[derive(Debug, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct HasPermissionForPropertyTypesParams<'a> {
    #[cfg_attr(feature = "utoipa", schema(value_type = String))]
    pub action: ActionName,
    pub property_type_ids: Cow<'a, [VersionedUrl]>,
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
    /// [`BaseUrl`]: type_system::ontology::BaseUrl
    fn create_property_type<R>(
        &mut self,
        actor_id: ActorEntityUuid,
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
    /// [`BaseUrl`]: type_system::ontology::BaseUrl
    fn create_property_types<P, R>(
        &mut self,
        actor_id: ActorEntityUuid,
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
        actor_id: ActorEntityUuid,
        params: CountPropertyTypesParams<'_>,
    ) -> impl Future<Output = Result<usize, Report<QueryError>>> + Send;

    /// Get the [`Subgraph`] specified by the [`GetPropertyTypeSubgraphParams`].
    ///
    /// # Errors
    ///
    /// - if the requested [`PropertyType`] doesn't exist.
    fn get_property_type_subgraph(
        &self,
        actor_id: ActorEntityUuid,
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
        actor_id: ActorEntityUuid,
        params: GetPropertyTypesParams<'_>,
    ) -> impl Future<Output = Result<GetPropertyTypesResponse, Report<QueryError>>> + Send;

    /// Update the definition of an existing [`PropertyType`].
    ///
    /// # Errors
    ///
    /// - if the [`PropertyType`] doesn't exist.
    fn update_property_type<R>(
        &mut self,
        actor_id: ActorEntityUuid,
        params: UpdatePropertyTypesParams<R>,
    ) -> impl Future<Output = Result<PropertyTypeMetadata, Report<UpdateError>>> + Send
    where
        Self: Send,
        R: IntoIterator<Item = PropertyTypeRelationAndSubject> + Send + Sync,
    {
        async move {
            Ok(self
                .update_property_types(actor_id, iter::once(params))
                .await?
                .pop()
                .expect("created exactly one property type"))
        }
    }

    /// Update the definitions of the existing [`PropertyType`]s.
    ///
    /// # Errors
    ///
    /// - if the [`PropertyType`]s do not exist.
    fn update_property_types<P, R>(
        &mut self,
        actor_id: ActorEntityUuid,
        params: P,
    ) -> impl Future<Output = Result<Vec<PropertyTypeMetadata>, Report<UpdateError>>> + Send
    where
        P: IntoIterator<Item = UpdatePropertyTypesParams<R>, IntoIter: Send> + Send,
        R: IntoIterator<Item = PropertyTypeRelationAndSubject> + Send + Sync;

    /// Archives the definition of an existing [`PropertyType`].
    ///
    /// # Errors
    ///
    /// - if the [`PropertyType`] doesn't exist.
    fn archive_property_type(
        &mut self,
        actor_id: ActorEntityUuid,

        params: ArchivePropertyTypeParams<'_>,
    ) -> impl Future<Output = Result<OntologyTemporalMetadata, Report<UpdateError>>> + Send;

    /// Restores the definition of an existing [`PropertyType`].
    ///
    /// # Errors
    ///
    /// - if the [`PropertyType`] doesn't exist.
    fn unarchive_property_type(
        &mut self,
        actor_id: ActorEntityUuid,

        params: UnarchivePropertyTypeParams<'_>,
    ) -> impl Future<Output = Result<OntologyTemporalMetadata, Report<UpdateError>>> + Send;

    fn update_property_type_embeddings(
        &mut self,
        actor_id: ActorEntityUuid,

        params: UpdatePropertyTypeEmbeddingParams<'_>,
    ) -> impl Future<Output = Result<(), Report<UpdateError>>> + Send;

    /// Checks if the actor has permission for the given property types.
    ///
    /// Returns a set of [`VersionedUrl`]s the actor has permission for. If the actor has no
    /// permission for an property type, it will not be included in the set.
    ///
    /// # Errors
    ///
    /// - [`StoreError`] if the underlying store returns an error
    ///
    /// [`StoreError`]: CheckPermissionError::StoreError
    fn has_permission_for_property_types(
        &self,
        authenticated_actor: AuthenticatedActor,
        params: HasPermissionForPropertyTypesParams<'_>,
    ) -> impl Future<Output = Result<HashSet<VersionedUrl>, Report<CheckPermissionError>>> + Send;
}
