use alloc::borrow::Cow;
use std::collections::{HashMap, HashSet};

use error_stack::Report;
use futures::TryFutureExt as _;
use hash_graph_authorization::{schema::EntityRelationAndSubject, zanzibar::Consistency};
use hash_graph_temporal_versioning::{DecisionTime, Timestamp, TransactionTime};
use hash_graph_types::knowledge::entity::EntityEmbedding;
use serde::{Deserialize, Serialize};
use type_system::{
    knowledge::{
        Confidence,
        entity::{
            Entity, LinkData,
            id::{EntityId, EntityUuid},
            metadata::EntityTypeIdDiff,
            provenance::ProvidedEntityEditionProvenance,
        },
        property::{
            PropertyDiff, PropertyObjectWithMetadata, PropertyPatchOperation, PropertyPath,
        },
    },
    ontology::{VersionedUrl, entity_type::ClosedMultiEntityType},
    provenance::{ActorId, CreatedById, EditionCreatedById},
    web::OwnedById,
};
#[cfg(feature = "utoipa")]
use utoipa::{
    ToSchema,
    openapi::{self, Ref},
};

use crate::{
    entity::{EntityQueryCursor, EntityQuerySorting, EntityValidationReport},
    entity_type::{EntityTypeResolveDefinitions, IncludeEntityTypeOption},
    error::{InsertionError, QueryError, UpdateError},
    filter::Filter,
    subgraph::{Subgraph, edges::GraphResolveDepths, temporal_axes::QueryTemporalAxesUnresolved},
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
#[expect(
    clippy::struct_excessive_bools,
    reason = "This is a configuration struct."
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
#[cfg_attr(
    feature = "utoipa",
    derive(utoipa::ToSchema),
    aliases(CreateEntityRequest = CreateEntityParams<Vec<EntityRelationAndSubject>>),
)]
#[serde(
    rename_all = "camelCase",
    deny_unknown_fields,
    bound(deserialize = "R: Deserialize<'de>")
)]
pub struct CreateEntityParams<R> {
    pub owned_by_id: OwnedById,
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
    pub relationships: R,
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
pub struct GetEntitiesParams<'a> {
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

#[derive(Debug, Serialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase")]
pub struct GetEntitiesResponse<'r> {
    pub entities: Vec<Entity>,
    pub cursor: Option<EntityQueryCursor<'r>>,
    pub count: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    pub closed_multi_entity_types: Option<HashMap<VersionedUrl, ClosedMultiEntityTypeMap>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    pub definitions: Option<EntityTypeResolveDefinitions>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    pub web_ids: Option<HashMap<OwnedById, usize>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    pub created_by_ids: Option<HashMap<CreatedById, usize>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    pub edition_created_by_ids: Option<HashMap<EditionCreatedById, usize>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    pub type_ids: Option<HashMap<VersionedUrl, usize>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    pub type_titles: Option<HashMap<VersionedUrl, String>>,
}

#[derive(Debug)]
#[expect(clippy::struct_excessive_bools, reason = "Parameter struct")]
pub struct GetEntitySubgraphParams<'a> {
    pub filter: Filter<'a, Entity>,
    pub temporal_axes: QueryTemporalAxesUnresolved,
    pub graph_resolve_depths: GraphResolveDepths,
    pub sorting: EntityQuerySorting<'static>,
    pub limit: Option<usize>,
    pub conversions: Vec<QueryConversion<'a>>,
    pub include_drafts: bool,
    pub include_count: bool,
    pub include_entity_types: Option<IncludeEntityTypeOption>,
    pub include_web_ids: bool,
    pub include_created_by_ids: bool,
    pub include_edition_created_by_ids: bool,
    pub include_type_ids: bool,
    pub include_type_titles: bool,
}

#[derive(Debug)]
pub struct GetEntitySubgraphResponse<'r> {
    pub subgraph: Subgraph,
    pub cursor: Option<EntityQueryCursor<'r>>,
    pub count: Option<usize>,
    pub closed_multi_entity_types: Option<HashMap<VersionedUrl, ClosedMultiEntityTypeMap>>,
    pub definitions: Option<EntityTypeResolveDefinitions>,
    pub web_ids: Option<HashMap<OwnedById, usize>>,
    pub created_by_ids: Option<HashMap<CreatedById, usize>>,
    pub edition_created_by_ids: Option<HashMap<EditionCreatedById, usize>>,
    pub type_ids: Option<HashMap<VersionedUrl, usize>>,
    pub type_titles: Option<HashMap<VersionedUrl, String>>,
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
    /// - if the account referred to by `owned_by_id` does not exist
    /// - if an [`EntityUuid`] was supplied and already exists in the store
    ///
    /// [`EntityType`]: type_system::ontology::entity_type::EntityType
    fn create_entity<R>(
        &mut self,
        actor_id: ActorId,
        params: CreateEntityParams<R>,
    ) -> impl Future<Output = Result<Entity, Report<InsertionError>>> + Send
    where
        R: IntoIterator<Item = EntityRelationAndSubject> + Send,
    {
        self.create_entities(actor_id, vec![params])
            .map_ok(|mut entities| {
                let entity = entities.pop().expect("Expected a single entity");
                assert!(entities.is_empty(), "Expected a single entity");
                entity
            })
    }

    /// Creates new [`Entities`][Entity].
    fn create_entities<R>(
        &mut self,
        actor_id: ActorId,
        params: Vec<CreateEntityParams<R>>,
    ) -> impl Future<Output = Result<Vec<Entity>, Report<InsertionError>>> + Send
    where
        R: IntoIterator<Item = EntityRelationAndSubject> + Send;

    /// Validates an [`Entity`].
    ///
    /// # Errors:
    ///
    /// - if the validation failed
    fn validate_entity(
        &self,
        actor_id: ActorId,
        consistency: Consistency<'_>,
        params: ValidateEntityParams<'_>,
    ) -> impl Future<Output = HashMap<usize, EntityValidationReport>> + Send {
        self.validate_entities(actor_id, consistency, vec![params])
    }

    /// Validates [`Entities`][Entity].
    ///
    /// # Errors:
    ///
    /// - if the validation failed
    fn validate_entities(
        &self,
        actor_id: ActorId,
        consistency: Consistency<'_>,
        params: Vec<ValidateEntityParams<'_>>,
    ) -> impl Future<Output = HashMap<usize, EntityValidationReport>> + Send;

    /// Get a list of entities specified by the [`GetEntitiesParams`].
    ///
    /// # Errors
    ///
    /// - if the requested [`Entities`][Entity] cannot be retrieved
    fn get_entities(
        &self,
        actor_id: ActorId,
        params: GetEntitiesParams<'_>,
    ) -> impl Future<Output = Result<GetEntitiesResponse<'static>, Report<QueryError>>> + Send;

    /// Get the [`Subgraph`]s specified by the [`GetEntitySubgraphParams`].
    ///
    /// # Errors
    ///
    /// - if the requested [`Entities`][Entity] cannot be retrieved
    fn get_entity_subgraph(
        &self,
        actor_id: ActorId,
        params: GetEntitySubgraphParams<'_>,
    ) -> impl Future<Output = Result<GetEntitySubgraphResponse<'static>, Report<QueryError>>> + Send;

    /// Count the number of entities that would be returned in [`get_entity`].
    ///
    /// # Errors
    ///
    /// - if the request to the database fails
    ///
    /// [`get_entity`]: Self::get_entity_subgraph
    fn count_entities(
        &self,
        actor_id: ActorId,
        params: CountEntitiesParams<'_>,
    ) -> impl Future<Output = Result<usize, Report<QueryError>>> + Send;

    fn get_entity_by_id(
        &self,
        actor_id: ActorId,
        entity_id: EntityId,
        transaction_time: Option<Timestamp<TransactionTime>>,
        decision_time: Option<Timestamp<DecisionTime>>,
    ) -> impl Future<Output = Result<Entity, Report<QueryError>>> + Send;

    fn patch_entity(
        &mut self,
        actor_id: ActorId,
        params: PatchEntityParams,
    ) -> impl Future<Output = Result<Entity, Report<UpdateError>>> + Send;

    fn diff_entity(
        &self,
        actor_id: ActorId,
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
        actor_id: ActorId,
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
}
