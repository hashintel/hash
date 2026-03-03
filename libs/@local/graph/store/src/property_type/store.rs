use alloc::borrow::Cow;
use core::iter;
use std::collections::HashSet;

use error_stack::Report;
use hash_graph_authorization::policies::{
    action::ActionName, principal::actor::AuthenticatedActor,
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
    subgraph::{
        Subgraph,
        edges::{
            EntityTraversalPath, GraphResolveDepths, MAX_TRAVERSAL_PATHS, SubgraphTraversalParams,
            SubgraphTraversalValidationError, TraversalDepthError, TraversalEdgeKind,
            TraversalPath,
        },
        temporal_axes::QueryTemporalAxesUnresolved,
    },
};

#[derive(Debug, Clone, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreatePropertyTypeParams {
    pub schema: PropertyType,
    pub ownership: OntologyOwnership,
    pub conflict_behavior: ConflictBehavior,
    pub provenance: ProvidedOntologyEditionProvenance,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(untagged, deny_unknown_fields)]
pub enum QueryPropertyTypeSubgraphParams<'a> {
    #[serde(rename_all = "camelCase")]
    ResolveDepths {
        traversal_paths: Vec<EntityTraversalPath>,
        graph_resolve_depths: GraphResolveDepths,
        #[serde(borrow, flatten)]
        request: QueryPropertyTypesParams<'a>,
    },
    #[serde(rename_all = "camelCase")]
    Paths {
        traversal_paths: Vec<TraversalPath>,
        #[serde(borrow, flatten)]
        request: QueryPropertyTypesParams<'a>,
    },
}

impl<'a> QueryPropertyTypeSubgraphParams<'a> {
    /// Validates traversal paths and resolve depths against their limits.
    ///
    /// # Errors
    ///
    /// Returns [`SubgraphTraversalValidationError`] if any limit is exceeded.
    pub fn validate(&self) -> Result<(), SubgraphTraversalValidationError> {
        let path_count = match self {
            Self::Paths {
                traversal_paths, ..
            } => {
                for path in traversal_paths {
                    path.validate()?;
                }
                traversal_paths.len()
            }
            Self::ResolveDepths {
                traversal_paths,
                graph_resolve_depths,
                ..
            } => {
                for path in traversal_paths {
                    path.validate()?;
                }
                graph_resolve_depths.validate()?;
                traversal_paths.len()
            }
        };
        if path_count > MAX_TRAVERSAL_PATHS {
            return Err(TraversalDepthError::TooManyPaths {
                actual: path_count,
                max: MAX_TRAVERSAL_PATHS,
            }
            .into());
        }
        Ok(())
    }

    #[must_use]
    pub const fn request(&self) -> &QueryPropertyTypesParams<'a> {
        match self {
            Self::Paths { request, .. } | Self::ResolveDepths { request, .. } => request,
        }
    }

    #[must_use]
    pub const fn request_mut(&mut self) -> &mut QueryPropertyTypesParams<'a> {
        match self {
            Self::Paths { request, .. } | Self::ResolveDepths { request, .. } => request,
        }
    }

    #[must_use]
    pub fn into_request(self) -> (QueryPropertyTypesParams<'a>, SubgraphTraversalParams) {
        match self {
            Self::Paths {
                traversal_paths,
                request,
            } => (request, SubgraphTraversalParams::Paths { traversal_paths }),
            Self::ResolveDepths {
                traversal_paths,
                graph_resolve_depths,
                request,
            } => (
                request,
                SubgraphTraversalParams::ResolveDepths {
                    traversal_paths,
                    graph_resolve_depths,
                },
            ),
        }
    }

    #[must_use]
    pub fn view_actions(&self) -> Vec<ActionName> {
        let mut actions = vec![ActionName::ViewPropertyType];

        match self {
            Self::Paths {
                traversal_paths, ..
            } => {
                if traversal_paths
                    .iter()
                    .any(|path| path.has_edge_kind(TraversalEdgeKind::ConstrainsValuesOn))
                {
                    actions.push(ActionName::ViewDataType);
                }
            }
            Self::ResolveDepths {
                graph_resolve_depths,
                ..
            } => {
                if graph_resolve_depths.constrains_values_on > 0 {
                    actions.push(ActionName::ViewDataType);
                }
            }
        }

        actions
    }
}

#[derive(Debug)]
pub struct QueryPropertyTypeSubgraphResponse {
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
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct QueryPropertyTypesParams<'p> {
    #[serde(borrow)]
    pub filter: Filter<'p, PropertyTypeWithMetadata>,
    pub temporal_axes: QueryTemporalAxesUnresolved,
    #[serde(default)]
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    pub after: Option<VersionedUrl>,
    #[serde(default)]
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    pub limit: Option<usize>,
    #[serde(default)]
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    pub include_count: bool,
}

#[derive(Debug, Serialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase")]
pub struct QueryPropertyTypesResponse {
    pub property_types: Vec<PropertyTypeWithMetadata>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    pub cursor: Option<VersionedUrl>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    pub count: Option<usize>,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdatePropertyTypesParams {
    pub schema: PropertyType,
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
    fn create_property_type(
        &mut self,
        actor_id: ActorEntityUuid,
        params: CreatePropertyTypeParams,
    ) -> impl Future<Output = Result<PropertyTypeMetadata, Report<InsertionError>>> + Send
    where
        Self: Send,
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
    fn create_property_types<P>(
        &mut self,
        actor_id: ActorEntityUuid,
        params: P,
    ) -> impl Future<Output = Result<Vec<PropertyTypeMetadata>, Report<InsertionError>>> + Send
    where
        P: IntoIterator<Item = CreatePropertyTypeParams, IntoIter: Send> + Send;

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

    /// Get the [`Subgraph`] specified by the [`QueryPropertyTypeSubgraphParams`].
    ///
    /// # Errors
    ///
    /// - if the requested [`PropertyType`] doesn't exist.
    fn query_property_type_subgraph(
        &self,
        actor_id: ActorEntityUuid,
        params: QueryPropertyTypeSubgraphParams<'_>,
    ) -> impl Future<Output = Result<QueryPropertyTypeSubgraphResponse, Report<QueryError>>> + Send;

    /// Get the [`PropertyTypes`] specified by the [`QueryPropertyTypesParams`].
    ///
    /// # Errors
    ///
    /// - if the requested [`PropertyType`] doesn't exist.
    ///
    /// [`PropertyTypes`]: PropertyType
    fn query_property_types(
        &self,
        actor_id: ActorEntityUuid,
        params: QueryPropertyTypesParams<'_>,
    ) -> impl Future<Output = Result<QueryPropertyTypesResponse, Report<QueryError>>> + Send;

    /// Update the definition of an existing [`PropertyType`].
    ///
    /// # Errors
    ///
    /// - if the [`PropertyType`] doesn't exist.
    fn update_property_type(
        &mut self,
        actor_id: ActorEntityUuid,
        params: UpdatePropertyTypesParams,
    ) -> impl Future<Output = Result<PropertyTypeMetadata, Report<UpdateError>>> + Send
    where
        Self: Send,
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
    fn update_property_types<P>(
        &mut self,
        actor_id: ActorEntityUuid,
        params: P,
    ) -> impl Future<Output = Result<Vec<PropertyTypeMetadata>, Report<UpdateError>>> + Send
    where
        P: IntoIterator<Item = UpdatePropertyTypesParams, IntoIter: Send> + Send;

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
