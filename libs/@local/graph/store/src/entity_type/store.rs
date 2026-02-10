use alloc::borrow::Cow;
use core::iter;
use std::collections::{HashMap, HashSet};

use error_stack::Report;
use hash_graph_authorization::policies::{
    action::ActionName, principal::actor::AuthenticatedActor,
};
use hash_graph_temporal_versioning::{Timestamp, TransactionTime};
use hash_graph_types::Embedding;
use serde::{Deserialize, Serialize};
use type_system::{
    ontology::{
        EntityTypeWithMetadata, OntologyTemporalMetadata, VersionedUrl,
        data_type::ClosedDataType,
        entity_type::{
            ClosedEntityType, EntityType, EntityTypeMetadata, schema::PartialEntityType,
        },
        property_type::PropertyType,
        provenance::{OntologyOwnership, ProvidedOntologyEditionProvenance},
    },
    principal::{actor::ActorEntityUuid, actor_group::WebId},
};

use crate::{
    entity::ClosedMultiEntityTypeMap,
    error::{CheckPermissionError, InsertionError, QueryError, UpdateError},
    filter::Filter,
    query::ConflictBehavior,
    subgraph::{
        Subgraph,
        edges::{
            EntityTraversalPath, GraphResolveDepths, SubgraphTraversalParams,
            SubgraphTraversalValidationError, TraversalEdgeKind, TraversalPath,
        },
        temporal_axes::QueryTemporalAxesUnresolved,
    },
};

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateEntityTypeParams {
    pub schema: EntityType,
    pub ownership: OntologyOwnership,
    pub conflict_behavior: ConflictBehavior,
    pub provenance: ProvidedOntologyEditionProvenance,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(untagged, deny_unknown_fields)]
pub enum QueryEntityTypeSubgraphParams<'p> {
    #[serde(rename_all = "camelCase")]
    ResolveDepths {
        traversal_paths: Vec<EntityTraversalPath>,
        graph_resolve_depths: GraphResolveDepths,
        #[serde(borrow, flatten)]
        request: CommonQueryEntityTypesParams<'p>,
    },
    #[serde(rename_all = "camelCase")]
    Paths {
        traversal_paths: Vec<TraversalPath>,
        #[serde(borrow, flatten)]
        request: CommonQueryEntityTypesParams<'p>,
    },
}

impl<'a> QueryEntityTypeSubgraphParams<'a> {
    /// Validates traversal paths and resolve depths against their limits.
    ///
    /// # Errors
    ///
    /// Returns [`SubgraphTraversalValidationError`] if any limit is exceeded.
    pub fn validate(&self) -> Result<(), SubgraphTraversalValidationError> {
        match self {
            Self::Paths {
                traversal_paths, ..
            } => {
                for path in traversal_paths {
                    path.validate()?;
                }
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
            }
        }
        Ok(())
    }

    #[must_use]
    pub const fn request(&self) -> &CommonQueryEntityTypesParams<'a> {
        match self {
            Self::Paths { request, .. } | Self::ResolveDepths { request, .. } => request,
        }
    }

    #[must_use]
    pub const fn request_mut(&mut self) -> &mut CommonQueryEntityTypesParams<'a> {
        match self {
            Self::Paths { request, .. } | Self::ResolveDepths { request, .. } => request,
        }
    }

    #[must_use]
    pub fn into_request(self) -> (CommonQueryEntityTypesParams<'a>, SubgraphTraversalParams) {
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
        let mut actions = vec![ActionName::ViewEntityType];

        match self {
            Self::Paths {
                traversal_paths, ..
            } => {
                if traversal_paths
                    .iter()
                    .any(|path| path.has_edge_kind(TraversalEdgeKind::ConstrainsPropertiesOn))
                {
                    actions.push(ActionName::ViewPropertyType);

                    if traversal_paths
                        .iter()
                        .any(|path| path.has_edge_kind(TraversalEdgeKind::ConstrainsValuesOn))
                    {
                        actions.push(ActionName::ViewDataType);
                    }
                }
            }
            Self::ResolveDepths {
                graph_resolve_depths,
                ..
            } => {
                if graph_resolve_depths.constrains_properties_on > 0 {
                    actions.push(ActionName::ViewPropertyType);

                    if graph_resolve_depths.constrains_values_on > 0 {
                        actions.push(ActionName::ViewDataType);
                    }
                }
            }
        }

        actions
    }
}

#[derive(Debug)]
pub struct QueryEntityTypeSubgraphResponse {
    pub subgraph: Subgraph,
    pub cursor: Option<VersionedUrl>,
    pub count: Option<usize>,
    pub web_ids: Option<HashMap<WebId, usize>>,
    pub edition_created_by_ids: Option<HashMap<ActorEntityUuid, usize>>,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CountEntityTypesParams<'p> {
    #[serde(borrow)]
    pub filter: Filter<'p, EntityTypeWithMetadata>,
    pub temporal_axes: QueryTemporalAxesUnresolved,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CommonQueryEntityTypesParams<'p> {
    #[serde(borrow)]
    pub filter: Filter<'p, EntityTypeWithMetadata>,
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
    #[serde(default)]
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    pub include_web_ids: bool,
    #[serde(default)]
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    pub include_edition_created_by_ids: bool,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct QueryEntityTypesParams<'p> {
    #[serde(borrow, flatten)]
    pub request: CommonQueryEntityTypesParams<'p>,
    #[serde(default)]
    pub include_entity_types: Option<IncludeEntityTypeOption>,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase")]
pub enum IncludeEntityTypeOption {
    Closed,
    Resolved,
    ResolvedWithDataTypeChildren,
}

impl From<IncludeResolvedEntityTypeOption> for IncludeEntityTypeOption {
    fn from(value: IncludeResolvedEntityTypeOption) -> Self {
        match value {
            IncludeResolvedEntityTypeOption::Resolved => Self::Resolved,
            IncludeResolvedEntityTypeOption::ResolvedWithDataTypeChildren => {
                Self::ResolvedWithDataTypeChildren
            }
        }
    }
}

#[derive(Debug, Serialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase")]
pub struct ClosedDataTypeDefinition {
    pub schema: ClosedDataType,
    pub parents: Vec<VersionedUrl>,
}

#[derive(Debug, Default, Serialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase")]
#[expect(clippy::struct_field_names)]
pub struct EntityTypeResolveDefinitions {
    pub data_types: HashMap<VersionedUrl, ClosedDataTypeDefinition>,
    pub property_types: HashMap<VersionedUrl, PropertyType>,
    pub entity_types: HashMap<VersionedUrl, PartialEntityType>,
}

impl Extend<Self> for EntityTypeResolveDefinitions {
    fn extend<T: IntoIterator<Item = Self>>(&mut self, iter: T) {
        for definitions in iter {
            self.data_types.extend(definitions.data_types);
            self.property_types.extend(definitions.property_types);
            self.entity_types.extend(definitions.entity_types);
        }
    }
}

impl EntityTypeResolveDefinitions {
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.data_types.is_empty() && self.property_types.is_empty() && self.entity_types.is_empty()
    }
}

#[derive(Debug, Serialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase")]
pub struct QueryEntityTypesResponse {
    pub entity_types: Vec<EntityTypeWithMetadata>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    pub closed_entity_types: Option<Vec<ClosedEntityType>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    pub definitions: Option<EntityTypeResolveDefinitions>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    pub cursor: Option<VersionedUrl>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    pub count: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    pub web_ids: Option<HashMap<WebId, usize>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    pub edition_created_by_ids: Option<HashMap<ActorEntityUuid, usize>>,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase")]
pub enum IncludeResolvedEntityTypeOption {
    Resolved,
    ResolvedWithDataTypeChildren,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GetClosedMultiEntityTypesParams {
    pub entity_type_ids: Vec<Vec<VersionedUrl>>,
    pub temporal_axes: QueryTemporalAxesUnresolved,
    #[serde(default)]
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    pub include_resolved: Option<IncludeResolvedEntityTypeOption>,
}

#[derive(Debug, Serialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase")]
pub struct GetClosedMultiEntityTypesResponse {
    pub entity_types: HashMap<VersionedUrl, ClosedMultiEntityTypeMap>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    pub definitions: Option<EntityTypeResolveDefinitions>,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdateEntityTypesParams {
    pub schema: EntityType,
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

#[derive(Debug, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct HasPermissionForEntityTypesParams<'a> {
    #[cfg_attr(feature = "utoipa", schema(value_type = String))]
    pub action: ActionName,
    pub entity_type_ids: Cow<'a, [VersionedUrl]>,
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
    /// [`BaseUrl`]: type_system::ontology::BaseUrl
    fn create_entity_type(
        &mut self,
        actor_id: ActorEntityUuid,
        params: CreateEntityTypeParams,
    ) -> impl Future<Output = Result<EntityTypeMetadata, Report<InsertionError>>> + Send
    where
        Self: Send,
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
    /// [`BaseUrl`]: type_system::ontology::BaseUrl
    fn create_entity_types<P>(
        &mut self,
        actor_id: ActorEntityUuid,
        params: P,
    ) -> impl Future<Output = Result<Vec<EntityTypeMetadata>, Report<InsertionError>>> + Send
    where
        P: IntoIterator<Item = CreateEntityTypeParams, IntoIter: Send> + Send;

    /// Count the number of [`EntityType`]s specified by the [`CountEntityTypesParams`].
    ///
    /// # Errors
    ///
    /// - if the underlying store fails to count the entity types.
    fn count_entity_types(
        &self,
        actor_id: ActorEntityUuid,
        params: CountEntityTypesParams<'_>,
    ) -> impl Future<Output = Result<usize, Report<QueryError>>> + Send;

    /// Get the [`Subgraph`]s specified by the [`QueryEntityTypeSubgraphParams`].
    ///
    /// # Errors
    ///
    /// - if the requested [`EntityType`] doesn't exist.
    fn query_entity_type_subgraph(
        &self,
        actor_id: ActorEntityUuid,
        params: QueryEntityTypeSubgraphParams<'_>,
    ) -> impl Future<Output = Result<QueryEntityTypeSubgraphResponse, Report<QueryError>>> + Send;

    /// Get the [`EntityType`]s specified by the [`QueryEntityTypesParams`].
    ///
    /// # Errors
    ///
    /// - if the requested [`EntityType`] doesn't exist.
    fn query_entity_types(
        &self,
        actor_id: ActorEntityUuid,
        params: QueryEntityTypesParams<'_>,
    ) -> impl Future<Output = Result<QueryEntityTypesResponse, Report<QueryError>>> + Send;

    /// Resolves and builds closed type hierarchies for multiple sets of entity types.
    ///
    /// This function takes multiple sets of entity type IDs (each represented as a
    /// `HashSet<VersionedUrl>`) and constructs a nested map structure representing the closed
    /// type hierarchies for each combination of entity types within each set.
    ///
    /// # Algorithm
    ///
    /// 1. Collects all unique entity type IDs that need resolution
    /// 2. Retrieves closed type information for all entity types in a single database query
    /// 3. For each set of entity types, builds a nested hierarchy where:
    ///    - The first entity type (sorted alphabetically) serves as the root of the hierarchy
    ///    - Each subsequent entity type creates a deeper level in the hierarchy
    ///    - Each level combines the schema information from all types in its path
    ///
    /// # Errors
    ///
    /// Returns a `QueryError` if:
    /// - Database operations fail when retrieving closed entity type information
    /// - Type resolution fails due to invalid entity type references
    fn get_closed_multi_entity_types<I, J>(
        &self,
        actor_id: ActorEntityUuid,
        entity_type_ids: I,
        temporal_axes: QueryTemporalAxesUnresolved,
        include_resolved: Option<IncludeResolvedEntityTypeOption>,
    ) -> impl Future<Output = Result<GetClosedMultiEntityTypesResponse, Report<QueryError>>> + Send
    where
        I: IntoIterator<Item = J> + Send,
        J: IntoIterator<Item = VersionedUrl> + Send;

    /// Update the definition of an existing [`EntityType`].
    ///
    /// # Errors
    ///
    /// - if the [`EntityType`] doesn't exist.
    fn update_entity_type(
        &mut self,
        actor_id: ActorEntityUuid,
        params: UpdateEntityTypesParams,
    ) -> impl Future<Output = Result<EntityTypeMetadata, Report<UpdateError>>> + Send
    where
        Self: Send,
    {
        async move {
            Ok(self
                .update_entity_types(actor_id, iter::once(params))
                .await?
                .pop()
                .expect("created exactly one entity type"))
        }
    }

    /// Update the definitions of the existing [`EntityType`]s.
    ///
    /// # Errors
    ///
    /// - if the [`EntityType`]s do not exist.
    fn update_entity_types<P>(
        &mut self,
        actor_id: ActorEntityUuid,
        params: P,
    ) -> impl Future<Output = Result<Vec<EntityTypeMetadata>, Report<UpdateError>>> + Send
    where
        P: IntoIterator<Item = UpdateEntityTypesParams, IntoIter: Send> + Send;

    /// Archives the definition of an existing [`EntityType`].
    ///
    /// # Errors
    ///
    /// - if the [`EntityType`] doesn't exist.
    fn archive_entity_type(
        &mut self,
        actor_id: ActorEntityUuid,

        params: ArchiveEntityTypeParams,
    ) -> impl Future<Output = Result<OntologyTemporalMetadata, Report<UpdateError>>> + Send;

    /// Restores the definition of an existing [`EntityType`].
    ///
    /// # Errors
    ///
    /// - if the [`EntityType`] doesn't exist.
    fn unarchive_entity_type(
        &mut self,
        actor_id: ActorEntityUuid,

        params: UnarchiveEntityTypeParams,
    ) -> impl Future<Output = Result<OntologyTemporalMetadata, Report<UpdateError>>> + Send;

    fn update_entity_type_embeddings(
        &mut self,
        actor_id: ActorEntityUuid,

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

    /// Checks if the actor has permission for the given entity types.
    ///
    /// Returns a set of [`VersionedUrl`]s the actor has permission for. If the actor has no
    /// permission for an entity type, it will not be included in the set.
    ///
    /// # Errors
    ///
    /// - [`StoreError`] if the underlying store returns an error
    ///
    /// [`StoreError`]: CheckPermissionError::StoreError
    fn has_permission_for_entity_types(
        &self,
        authenticated_actor: AuthenticatedActor,
        params: HasPermissionForEntityTypesParams<'_>,
    ) -> impl Future<Output = Result<HashSet<VersionedUrl>, Report<CheckPermissionError>>> + Send;
}
