use alloc::borrow::Cow;
use std::collections::{HashMap, HashSet};

use error_stack::Report;
use futures::TryFutureExt as _;
use hash_graph_authorization::policies::{
    Effect,
    action::ActionName,
    principal::{PrincipalConstraint, actor::AuthenticatedActor},
};
use hash_graph_temporal_versioning::{DecisionTime, Timestamp, TransactionTime};
use hash_graph_types::knowledge::entity::EntityEmbedding;
use serde::{Deserialize, Serialize};
use type_system::{
    knowledge::{
        Confidence,
        entity::{
            Entity, LinkData,
            id::{EntityEditionId, EntityId, EntityUuid},
            metadata::EntityTypeIdDiff,
            provenance::ProvidedEntityEditionProvenance,
        },
        property::{
            PropertyDiff, PropertyObjectWithMetadata, PropertyPatchOperation, PropertyPath,
        },
    },
    ontology::{VersionedUrl, entity_type::ClosedMultiEntityType},
    principal::{actor::ActorEntityUuid, actor_group::WebId},
};
#[cfg(feature = "utoipa")]
use utoipa::{
    ToSchema,
    openapi::{self, Ref},
};

use crate::{
    entity::{EntityQueryCursor, EntityQuerySorting, EntityValidationReport},
    entity_type::{EntityTypeResolveDefinitions, IncludeEntityTypeOption},
    error::{CheckPermissionError, DeletionError, InsertionError, QueryError, UpdateError},
    filter::Filter,
    subgraph::{
        Subgraph,
        edges::{
            EntityTraversalPath, GraphResolveDepths, SubgraphTraversalParams, TraversalEdgeKind,
            TraversalPath,
        },
        temporal_axes::QueryTemporalAxesUnresolved,
    },
};

#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
pub enum EntityValidationType<'a> {
    Id(Cow<'a, HashSet<VersionedUrl>>),
    #[serde(skip)]
    ClosedSchema(Cow<'a, ClosedMultiEntityType>),
}

#[cfg(feature = "utoipa")]
impl ToSchema<'_> for EntityValidationType<'_> {
    fn schema() -> (&'static str, openapi::RefOr<openapi::Schema>) {
        (
            "EntityValidationType",
            Ref::from_schema_name("VersionedUrl")
                .to_array_builder()
                .into(),
        )
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, derive_more::Display, derive_more::Error)]
#[display("entity validation failed")]
#[must_use]
pub struct ValidateEntityError;

const fn default_true() -> bool {
    true
}

#[derive(Debug, Copy, Clone, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[allow(
    clippy::struct_excessive_bools,
    clippy::allow_attributes,
    reason = "This is a configuration struct. `struct_excessive_bools` does not always report for \
              some reason, so we use `allow` here."
)]
pub struct ValidateEntityComponents {
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    #[serde(default = "default_true")]
    pub link_data: bool,
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    #[serde(default = "default_true")]
    pub required_properties: bool,
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    #[serde(default = "default_true")]
    pub num_items: bool,
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    #[serde(default = "default_true")]
    pub link_validation: bool,
}

impl ValidateEntityComponents {
    #[must_use]
    pub const fn full() -> Self {
        Self {
            link_data: true,
            required_properties: true,
            num_items: true,
            link_validation: true,
        }
    }

    #[must_use]
    pub const fn draft() -> Self {
        Self {
            num_items: false,
            required_properties: false,
            ..Self::full()
        }
    }
}

impl Default for ValidateEntityComponents {
    fn default() -> Self {
        Self::full()
    }
}

#[derive(Debug, Clone, Deserialize)]
#[cfg_attr(feature = "codegen", derive(specta::Type))]
pub struct CreateEntityPolicyParams {
    pub name: String,
    pub effect: Effect,
    pub principal: Option<PrincipalConstraint>,
    pub actions: Vec<ActionName>,
}

#[derive(Debug, Clone, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateEntityParams {
    pub web_id: WebId,
    #[serde(default)]
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    pub entity_uuid: Option<EntityUuid>,
    #[serde(default)]
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    pub decision_time: Option<Timestamp<DecisionTime>>,
    #[cfg_attr(feature = "utoipa", schema(value_type = Vec<VersionedUrl>))]
    pub entity_type_ids: HashSet<VersionedUrl>,
    pub properties: PropertyObjectWithMetadata,
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub confidence: Option<Confidence>,
    #[serde(default)]
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    pub link_data: Option<LinkData>,
    pub draft: bool,
    #[cfg_attr(feature = "utoipa", schema(value_type = Vec<Object>))]
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub policies: Vec<CreateEntityPolicyParams>,
    pub provenance: ProvidedEntityEditionProvenance,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ValidateEntityParams<'a> {
    #[serde(borrow)]
    pub entity_types: EntityValidationType<'a>,
    #[serde(borrow)]
    pub properties: Cow<'a, PropertyObjectWithMetadata>,
    #[serde(borrow, default)]
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    pub link_data: Option<Cow<'a, LinkData>>,
    #[serde(default)]
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    pub components: ValidateEntityComponents,
}

#[derive(Debug, Clone, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct QueryConversion<'a> {
    pub path: PropertyPath<'a>,
    pub data_type_id: VersionedUrl,
}

#[derive(Debug)]
#[expect(clippy::struct_excessive_bools, reason = "Parameter struct")]
pub struct QueryEntitiesParams<'a> {
    pub filter: Filter<'a, Entity>,
    pub temporal_axes: QueryTemporalAxesUnresolved,
    pub sorting: EntityQuerySorting<'static>,
    pub conversions: Vec<QueryConversion<'a>>,
    pub limit: Option<usize>,
    pub include_drafts: bool,
    pub include_count: bool,
    pub include_entity_types: Option<IncludeEntityTypeOption>,
    pub include_web_ids: bool,
    pub include_created_by_ids: bool,
    pub include_edition_created_by_ids: bool,
    pub include_type_ids: bool,
    pub include_type_titles: bool,
    pub include_permissions: bool,
}

/// A recursive map structure representing a hierarchical combination of entity types.
///
/// This data structure stores the schema information for a combination of entity types,
/// organized in a tree-like structure. Each level in the hierarchy represents the addition
/// of one more entity type to the combination.
///
/// # Structure
///
/// - `schema`: Contains the combined closed type information for all entity types in the current
///   path of the hierarchy
/// - `inner`: Maps from additional entity types to deeper levels in the hierarchy, where each
///   deeper level represents the schema when that entity type is added to the current combination
///
/// # Example Hierarchy
///
/// For entity types A, B, and C, the structure might look like:
/// ```text
/// A (schema: closed type for A)
/// └── B (schema: combined closed type for A+B)
///     └── C (schema: combined closed type for A+B+C)
/// ```
///
/// This allows efficient lookup of type information for any combination of entity types
/// by traversing the hierarchy from root to leaf, accumulating type constraints along the way.
#[derive(Debug, Serialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase")]
pub struct ClosedMultiEntityTypeMap {
    /// The combined schema information for all entity types in the current path.
    pub schema: ClosedMultiEntityType,

    /// Maps from additional entity types to deeper levels in the hierarchy.
    /// Each entry represents adding one more entity type to the current combination.
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub inner: HashMap<VersionedUrl, Self>,
}

#[derive(Debug, Default, Serialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[cfg_attr(feature = "codegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct EntityPermissions {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub update: Vec<EntityEditionId>,
}

#[derive(Debug, Serialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase")]
pub struct QueryEntitiesResponse<'r> {
    pub entities: Vec<Entity>,
    pub cursor: Option<EntityQueryCursor<'r>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    pub count: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    pub closed_multi_entity_types: Option<HashMap<VersionedUrl, ClosedMultiEntityTypeMap>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    pub definitions: Option<EntityTypeResolveDefinitions>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    pub web_ids: Option<HashMap<WebId, usize>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    pub created_by_ids: Option<HashMap<ActorEntityUuid, usize>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    pub edition_created_by_ids: Option<HashMap<ActorEntityUuid, usize>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    pub type_ids: Option<HashMap<VersionedUrl, usize>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    pub type_titles: Option<HashMap<VersionedUrl, String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    pub permissions: Option<HashMap<EntityId, EntityPermissions>>,
}

#[derive(Debug)]
pub enum QueryEntitySubgraphParams<'a> {
    Paths {
        traversal_paths: Vec<TraversalPath>,
        request: QueryEntitiesParams<'a>,
    },
    ResolveDepths {
        graph_resolve_depths: GraphResolveDepths,
        traversal_paths: Vec<EntityTraversalPath>,
        request: QueryEntitiesParams<'a>,
    },
}

impl<'a> QueryEntitySubgraphParams<'a> {
    #[must_use]
    pub const fn request(&self) -> &QueryEntitiesParams<'a> {
        match self {
            Self::Paths { request, .. } | Self::ResolveDepths { request, .. } => request,
        }
    }

    #[must_use]
    pub const fn request_mut(&mut self) -> &mut QueryEntitiesParams<'a> {
        match self {
            Self::Paths { request, .. } | Self::ResolveDepths { request, .. } => request,
        }
    }

    #[must_use]
    pub fn from_parts(
        request: QueryEntitiesParams<'a>,
        traversal_params: SubgraphTraversalParams,
    ) -> Self {
        match traversal_params {
            SubgraphTraversalParams::Paths { traversal_paths } => Self::Paths {
                request,
                traversal_paths,
            },
            SubgraphTraversalParams::ResolveDepths {
                traversal_paths,
                graph_resolve_depths,
            } => Self::ResolveDepths {
                request,
                traversal_paths,
                graph_resolve_depths,
            },
        }
    }

    #[must_use]
    pub fn into_parts(self) -> (QueryEntitiesParams<'a>, SubgraphTraversalParams) {
        match self {
            Self::Paths {
                request,
                traversal_paths,
            } => (request, SubgraphTraversalParams::Paths { traversal_paths }),
            Self::ResolveDepths {
                request,
                traversal_paths,
                graph_resolve_depths,
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
        let mut actions = vec![ActionName::ViewEntity];

        match self {
            Self::Paths {
                traversal_paths, ..
            } => {
                if traversal_paths
                    .iter()
                    .any(|path| path.has_edge_kind(TraversalEdgeKind::IsOfType))
                {
                    actions.push(ActionName::ViewEntityType);

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
            }
            Self::ResolveDepths {
                graph_resolve_depths: depths,
                ..
            } => {
                if depths.is_of_type {
                    actions.push(ActionName::ViewEntityType);

                    if depths.constrains_properties_on > 0 {
                        actions.push(ActionName::ViewPropertyType);

                        if depths.constrains_values_on > 0 {
                            actions.push(ActionName::ViewDataType);
                        }
                    }
                }
            }
        }

        actions
    }
}

#[derive(Debug)]
pub struct QueryEntitySubgraphResponse<'r> {
    pub subgraph: Subgraph,
    pub cursor: Option<EntityQueryCursor<'r>>,
    pub count: Option<usize>,
    pub closed_multi_entity_types: Option<HashMap<VersionedUrl, ClosedMultiEntityTypeMap>>,
    pub definitions: Option<EntityTypeResolveDefinitions>,
    pub web_ids: Option<HashMap<WebId, usize>>,
    pub created_by_ids: Option<HashMap<ActorEntityUuid, usize>>,
    pub edition_created_by_ids: Option<HashMap<ActorEntityUuid, usize>>,
    pub type_ids: Option<HashMap<VersionedUrl, usize>>,
    pub type_titles: Option<HashMap<VersionedUrl, String>>,
    pub entity_permissions: Option<HashMap<EntityId, EntityPermissions>>,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CountEntitiesParams<'a> {
    #[serde(borrow)]
    pub filter: Filter<'a, Entity>,
    pub temporal_axes: QueryTemporalAxesUnresolved,
    pub include_drafts: bool,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PatchEntityParams {
    pub entity_id: EntityId,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    pub decision_time: Option<Timestamp<DecisionTime>>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    #[cfg_attr(feature = "utoipa", schema(value_type = Vec<VersionedUrl>))]
    pub entity_type_ids: HashSet<VersionedUrl>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub properties: Vec<PropertyPatchOperation>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    pub draft: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    pub archived: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    pub confidence: Option<Confidence>,
    pub provenance: ProvidedEntityEditionProvenance,
}

impl PatchEntityParams {
    /// Returns `true` if the parameters represents an update.
    ///
    /// An update is defined as any change to the entity's type IDs, properties, or draft status. If
    /// only the confidence is updated without changing the archive-state, this is also considered
    /// an update. On the counterary, if only the confidence is updated along with an archive-state
    /// change, the confidence is used for the new entity edition.
    // TODO(BE-224): Fix edge-case that the confidence could be updated by archiving/unarchiving.
    #[must_use]
    pub fn is_update(&self) -> bool {
        !self.entity_type_ids.is_empty()
            || !self.properties.is_empty()
            || self.draft.is_some()
            || (self.archived.is_none() && self.confidence.is_some())
    }
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdateEntityEmbeddingsParams<'e> {
    pub entity_id: EntityId,
    pub embeddings: Vec<EntityEmbedding<'e>>,
    pub updated_at_transaction_time: Timestamp<TransactionTime>,
    pub updated_at_decision_time: Timestamp<DecisionTime>,
    pub reset: bool,
}

#[derive(Debug, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DiffEntityParams {
    pub first_entity_id: EntityId,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "utoipa", schema(required = true))]
    pub first_decision_time: Option<Timestamp<DecisionTime>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "utoipa", schema(required = true))]
    pub first_transaction_time: Option<Timestamp<TransactionTime>>,
    pub second_entity_id: EntityId,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "utoipa", schema(required = true))]
    pub second_decision_time: Option<Timestamp<DecisionTime>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "utoipa", schema(required = true))]
    pub second_transaction_time: Option<Timestamp<TransactionTime>>,
}

#[derive(Debug, Serialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DiffEntityResult<'e> {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub properties: Vec<PropertyDiff<'e>>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub entity_type_ids: Vec<EntityTypeIdDiff<'e>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    pub draft_state: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct HasPermissionForEntitiesParams<'a> {
    #[cfg_attr(feature = "utoipa", schema(value_type = String))]
    pub action: ActionName,
    pub entity_ids: Cow<'a, [EntityId]>,
    pub temporal_axes: QueryTemporalAxesUnresolved,
    pub include_drafts: bool,
}

#[derive(Debug, Copy, Clone, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(
    tag = "scope",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
pub enum DeletionScope {
    // Archive,
    Purge { link_behavior: LinkDeletionBehavior },
    Erase,
}

#[derive(Debug, Copy, Clone, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "kebab-case")]
pub enum LinkDeletionBehavior {
    Ignore,
    Error,
    // Cascade,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase")]
pub struct DeleteEntitiesParams<'a> {
    #[serde(borrow)]
    pub filter: Filter<'a, Entity>,
    pub include_drafts: bool,
    #[serde(flatten)]
    pub scope: DeletionScope,
    #[serde(default)]
    pub decision_time: Option<Timestamp<DecisionTime>>,
}

/// Summary of a deletion operation.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase")]
pub struct DeletionSummary {
    /// Number of entities fully deleted (tombstoned or erased).
    pub full_entities: usize,
    /// Number of draft-only deletions performed.
    pub draft_deletions: usize,
}

/// Describes the API of a store implementation for [Entities].
///
/// [Entities]: Entity
pub trait EntityStore {
    /// Creates a new [`Entity`].
    ///
    /// # Errors:
    ///
    /// - if the [`EntityType`] doesn't exist
    /// - if the [`PropertyObjectWithMetadata`] is not valid with respect to the specified
    ///   [`EntityType`]
    /// - if the account referred to by `web_id` does not exist
    /// - if an [`EntityUuid`] was supplied and already exists in the store
    ///
    /// [`EntityType`]: type_system::ontology::entity_type::EntityType
    fn create_entity(
        &mut self,
        actor_id: ActorEntityUuid,
        params: CreateEntityParams,
    ) -> impl Future<Output = Result<Entity, Report<InsertionError>>> + Send {
        self.create_entities(actor_id, vec![params])
            .map_ok(|mut entities| {
                let entity = entities.pop().expect("Expected a single entity");
                assert!(entities.is_empty(), "Expected a single entity");
                entity
            })
    }

    /// Creates new [`Entities`][Entity].
    fn create_entities(
        &mut self,
        actor_uuid: ActorEntityUuid,
        params: Vec<CreateEntityParams>,
    ) -> impl Future<Output = Result<Vec<Entity>, Report<InsertionError>>> + Send;

    /// Validates an [`Entity`].
    ///
    /// # Errors:
    ///
    /// - if the validation failed
    fn validate_entity(
        &self,
        actor_id: ActorEntityUuid,
        params: ValidateEntityParams<'_>,
    ) -> impl Future<Output = Result<HashMap<usize, EntityValidationReport>, Report<QueryError>>> + Send
    {
        self.validate_entities(actor_id, vec![params])
    }

    /// Validates [`Entities`][Entity].
    ///
    /// # Errors:
    ///
    /// - if the validation failed
    fn validate_entities(
        &self,
        actor_id: ActorEntityUuid,
        params: Vec<ValidateEntityParams<'_>>,
    ) -> impl Future<Output = Result<HashMap<usize, EntityValidationReport>, Report<QueryError>>> + Send;

    /// Get a list of entities specified by the [`QueryEntitiesParams`].
    ///
    /// # Errors
    ///
    /// - if the requested [`Entities`][Entity] cannot be retrieved
    fn query_entities(
        &self,
        actor_id: ActorEntityUuid,
        params: QueryEntitiesParams<'_>,
    ) -> impl Future<Output = Result<QueryEntitiesResponse<'static>, Report<QueryError>>> + Send;

    /// Get the [`Subgraph`]s specified by the [`QueryEntitySubgraphParams`].
    ///
    /// # Errors
    ///
    /// - if the requested [`Entities`][Entity] cannot be retrieved
    fn query_entity_subgraph(
        &self,
        actor_id: ActorEntityUuid,
        params: QueryEntitySubgraphParams<'_>,
    ) -> impl Future<Output = Result<QueryEntitySubgraphResponse<'static>, Report<QueryError>>> + Send;

    /// Count the number of entities that would be returned in [`query_entities`].
    ///
    /// # Errors
    ///
    /// - if the request to the database fails
    ///
    /// [`query_entities`]: Self::query_entities
    fn count_entities(
        &self,
        actor_id: ActorEntityUuid,
        params: CountEntitiesParams<'_>,
    ) -> impl Future<Output = Result<usize, Report<QueryError>>> + Send;

    fn get_entity_by_id(
        &self,
        actor_id: ActorEntityUuid,
        entity_id: EntityId,
        transaction_time: Option<Timestamp<TransactionTime>>,
        decision_time: Option<Timestamp<DecisionTime>>,
    ) -> impl Future<Output = Result<Entity, Report<QueryError>>> + Send;

    fn patch_entity(
        &mut self,
        actor_id: ActorEntityUuid,
        params: PatchEntityParams,
    ) -> impl Future<Output = Result<Entity, Report<UpdateError>>> + Send;

    /// Deletes entities matching the `params` filter.
    ///
    /// **Purge** keeps `entity_ids` as a tombstone with deletion provenance; all edition data,
    /// temporal metadata, type associations, embeddings, drafts, and outgoing edges are removed.
    /// **Erase** additionally removes the `entity_ids` row, leaving no trace.
    ///
    /// # Behavioral notes
    ///
    /// - **Erase + draft-only targets**: when [`DeletionScope::Erase`] is used but only draft-only
    ///   targets are produced (e.g., a partial draft match on an entity with a published version),
    ///   `entity_ids` is **not** deleted because published data still references it. Callers
    ///   passing `Erase` should not assume complete removal in this case.
    ///
    /// - **Filter interaction with `include_drafts`**: [`Filter::for_entity_by_entity_id`] with
    ///   `draft_id: None` matches on `(web_id, entity_uuid)` without restricting by `draft_id`. The
    ///   `draft_id IS NULL` constraint comes from `include_drafts: false` in the select compiler.
    ///   This means `include_drafts: true` + `draft_id: None` matches **all** rows (published + all
    ///   drafts) for the entity.
    ///
    /// - **Double-purge is a no-op**: after the first purge deletes temporal metadata, a second
    ///   call finds no matching rows and returns successfully without modifying the tombstone.
    ///
    /// # Errors
    ///
    /// - [`InvalidDecisionTime`] if `decision_time` exceeds `transaction_time`
    /// - [`IncomingLinksExist`] if incoming links exist and [`LinkDeletionBehavior::Error`] or
    ///   [`DeletionScope::Erase`] is requested
    /// - [`Store`] if a database operation fails
    ///
    /// [`InvalidDecisionTime`]: DeletionError::InvalidDecisionTime
    /// [`IncomingLinksExist`]: DeletionError::IncomingLinksExist
    /// [`Store`]: DeletionError::Store
    /// [`Filter::for_entity_by_entity_id`]: crate::filter::Filter::for_entity_by_entity_id
    fn delete_entities(
        &mut self,
        actor_id: ActorEntityUuid,
        params: DeleteEntitiesParams<'_>,
    ) -> impl Future<Output = Result<DeletionSummary, Report<DeletionError>>> + Send;

    fn diff_entity(
        &self,
        actor_id: ActorEntityUuid,
        params: DiffEntityParams,
    ) -> impl Future<Output = Result<DiffEntityResult<'static>, Report<QueryError>>> + Send
    where
        Self: Sync,
    {
        async move {
            let first_entity = self
                .get_entity_by_id(
                    actor_id,
                    params.first_entity_id,
                    params.first_transaction_time,
                    params.first_decision_time,
                )
                .await?;
            let second_entity = self
                .get_entity_by_id(
                    actor_id,
                    params.second_entity_id,
                    params.second_transaction_time,
                    params.second_decision_time,
                )
                .await?;

            let property_diff = first_entity
                .properties
                .diff(&second_entity.properties, &mut PropertyPath::default())
                .map(PropertyDiff::into_owned)
                .collect();

            let removed_types = first_entity
                .metadata
                .entity_type_ids
                .difference(&second_entity.metadata.entity_type_ids)
                .map(|removed| EntityTypeIdDiff::Removed {
                    removed: Cow::Borrowed(removed),
                });
            let added_types = second_entity
                .metadata
                .entity_type_ids
                .difference(&first_entity.metadata.entity_type_ids)
                .map(|added| EntityTypeIdDiff::Added {
                    added: Cow::Borrowed(added),
                });
            let first_is_draft = first_entity.metadata.record_id.entity_id.draft_id.is_some();
            let second_is_draft = second_entity
                .metadata
                .record_id
                .entity_id
                .draft_id
                .is_some();

            Ok(DiffEntityResult {
                properties: property_diff,
                entity_type_ids: removed_types
                    .chain(added_types)
                    .map(EntityTypeIdDiff::into_owned)
                    .collect(),
                draft_state: (first_is_draft != second_is_draft).then_some(second_is_draft),
            })
        }
    }

    fn update_entity_embeddings(
        &mut self,
        actor_id: ActorEntityUuid,
        params: UpdateEntityEmbeddingsParams<'_>,
    ) -> impl Future<Output = Result<(), Report<UpdateError>>> + Send;

    /// Re-indexes the cache for entities.
    ///
    /// This is only needed if the entity was changed in place without an update procedure. This is
    /// a rare operation and should be avoided if possible.
    ///
    /// # Errors
    ///
    /// - if re-indexing the cache fails.
    fn reindex_entity_cache(
        &mut self,
    ) -> impl Future<Output = Result<(), Report<UpdateError>>> + Send;

    /// Checks if the actor has permission for the given entities.
    ///
    /// Returns a map of entity IDs to the edition IDs that the actor has permission for. If the
    /// actor has no permission for an entity, it will not be included in the map.
    ///
    /// # Errors
    ///
    /// - [`StoreError`] if the underlying store returns an error
    ///
    /// [`StoreError`]: CheckPermissionError::StoreError
    fn has_permission_for_entities(
        &self,
        authenticated_actor: AuthenticatedActor,
        params: HasPermissionForEntitiesParams<'_>,
    ) -> impl Future<
        Output = Result<HashMap<EntityId, Vec<EntityEditionId>>, Report<CheckPermissionError>>,
    > + Send;
}
