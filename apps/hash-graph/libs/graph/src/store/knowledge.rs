use alloc::borrow::Cow;
use core::{error::Error, fmt};
use std::collections::{HashMap, HashSet};

use authorization::{schema::EntityRelationAndSubject, zanzibar::Consistency};
use error_stack::Report;
use futures::TryFutureExt;
use graph_types::{
    account::{AccountId, CreatedById, EditionCreatedById},
    knowledge::{
        entity::{Entity, EntityEmbedding, EntityId, EntityUuid, ProvidedEntityEditionProvenance},
        link::LinkData,
        property::{
            PropertyDiff, PropertyPatchOperation, PropertyPath, PropertyWithMetadataObject,
        },
        Confidence, EntityTypeIdDiff,
    },
    owned_by_id::OwnedById,
};
use hash_graph_store::{
    entity::EntityQueryPath,
    filter::Filter,
    subgraph::{edges::GraphResolveDepths, temporal_axes::QueryTemporalAxesUnresolved, Subgraph},
};
use serde::{Deserialize, Serialize};
use temporal_versioning::{DecisionTime, Timestamp, TransactionTime};
use type_system::{
    schema::{ClosedEntityType, EntityType},
    url::VersionedUrl,
};
#[cfg(feature = "utoipa")]
use utoipa::{
    openapi::{self, schema, Ref, RefOr, Schema},
    ToSchema,
};
use validation::ValidateEntityComponents;

use crate::store::{
    crud::Sorting, postgres::CursorField, InsertionError, NullOrdering, Ordering, QueryError,
    UpdateError,
};

#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
pub enum EntityValidationType<'a> {
    Schema(Vec<EntityType>),
    Id(Cow<'a, HashSet<VersionedUrl>>),
    #[serde(skip)]
    ClosedSchema(Cow<'a, ClosedEntityType>),
}

#[cfg(feature = "utoipa")]
impl ToSchema<'_> for EntityValidationType<'_> {
    fn schema() -> (&'static str, openapi::RefOr<openapi::Schema>) {
        (
            "EntityValidationType",
            Schema::OneOf(
                schema::OneOfBuilder::new()
                    .item(Ref::from_schema_name("VAR_ENTITY_TYPE").to_array_builder())
                    .item(Ref::from_schema_name("VersionedUrl").to_array_builder())
                    .build(),
            )
            .into(),
        )
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct ValidateEntityError;

impl fmt::Display for ValidateEntityError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("Entity validation failed")
    }
}

impl Error for ValidateEntityError {}

#[derive(Debug, Clone, Deserialize)]
pub struct EntityQuerySortingRecord<'s> {
    #[serde(
        borrow,
        deserialize_with = "EntityQueryPath::deserialize_from_sorting_tokens"
    )]
    pub path: EntityQueryPath<'s>,
    pub ordering: Ordering,
    pub nulls: Option<NullOrdering>,
}

#[cfg(feature = "utoipa")]
impl ToSchema<'_> for EntityQuerySortingRecord<'_> {
    fn schema() -> (&'static str, RefOr<Schema>) {
        (
            "EntityQuerySortingRecord",
            Schema::Object(
                schema::ObjectBuilder::new()
                    .property("path", Ref::from_schema_name("EntityQuerySortingPath"))
                    .required("path")
                    .property("ordering", Ref::from_schema_name("Ordering"))
                    .required("ordering")
                    .property("nulls", Ref::from_schema_name("NullOrdering"))
                    .required("nulls")
                    .build(),
            )
            .into(),
        )
    }
}

impl EntityQuerySortingRecord<'_> {
    #[must_use]
    pub fn into_owned(self) -> EntityQuerySortingRecord<'static> {
        EntityQuerySortingRecord {
            path: self.path.into_owned(),
            ordering: self.ordering,
            nulls: self.nulls,
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct EntityQuerySorting<'s> {
    #[serde(borrow)]
    pub paths: Vec<EntityQuerySortingRecord<'s>>,
    #[serde(borrow)]
    pub cursor: Option<EntityQueryCursor<'s>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(transparent)]
pub struct EntityQueryCursor<'s> {
    #[serde(borrow)]
    pub values: Vec<CursorField<'s>>,
}

#[cfg(feature = "utoipa")]
impl ToSchema<'_> for EntityQueryCursor<'_> {
    fn schema() -> (&'static str, openapi::RefOr<openapi::Schema>) {
        (
            "EntityQueryCursor",
            openapi::Schema::Array(openapi::schema::Array::default()).into(),
        )
    }
}

impl EntityQueryCursor<'_> {
    pub fn into_owned(self) -> EntityQueryCursor<'static> {
        EntityQueryCursor {
            values: self
                .values
                .into_iter()
                .map(CursorField::into_owned)
                .collect(),
        }
    }
}

impl<'s> Sorting for EntityQuerySorting<'s> {
    type Cursor = EntityQueryCursor<'s>;

    fn cursor(&self) -> Option<&Self::Cursor> {
        self.cursor.as_ref()
    }

    fn set_cursor(&mut self, cursor: Self::Cursor) {
        self.cursor = Some(cursor);
    }
}

#[derive(Debug, Clone, Deserialize)]
#[cfg_attr(
feature = "utoipa",
derive(utoipa::ToSchema),
aliases(CreateEntityRequest = CreateEntityParams < Vec < EntityRelationAndSubject >>),
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
    pub properties: PropertyWithMetadataObject,
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub confidence: Option<Confidence>,
    #[serde(default)]
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    pub link_data: Option<LinkData>,
    pub draft: bool,
    pub relationships: R,
    #[serde(default, skip_serializing_if = "UserDefinedProvenanceData::is_empty")]
    pub provenance: ProvidedEntityEditionProvenance,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ValidateEntityParams<'a> {
    #[serde(borrow)]
    pub entity_types: EntityValidationType<'a>,
    #[serde(borrow)]
    pub properties: Cow<'a, PropertyWithMetadataObject>,
    #[serde(borrow, default)]
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    pub link_data: Option<Cow<'a, LinkData>>,
    #[serde(default)]
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    pub components: ValidateEntityComponents,
}

#[derive(Debug, Deserialize)]
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
    pub include_web_ids: bool,
    pub include_created_by_ids: bool,
    pub include_edition_created_by_ids: bool,
    pub include_type_ids: bool,
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
    pub include_web_ids: bool,
    pub include_created_by_ids: bool,
    pub include_edition_created_by_ids: bool,
    pub include_type_ids: bool,
}

#[derive(Debug)]
pub struct GetEntitySubgraphResponse<'r> {
    pub subgraph: Subgraph,
    pub cursor: Option<EntityQueryCursor<'r>>,
    pub count: Option<usize>,
    pub web_ids: Option<HashMap<OwnedById, usize>>,
    pub created_by_ids: Option<HashMap<CreatedById, usize>>,
    pub edition_created_by_ids: Option<HashMap<EditionCreatedById, usize>>,
    pub type_ids: Option<HashMap<VersionedUrl, usize>>,
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
    #[serde(default, skip_serializing_if = "UserDefinedProvenanceData::is_empty")]
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

#[derive(Debug, Deserialize)]
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
    /// - if the [`PropertyWithMetadataObject`] is not valid with respect to the specified
    ///   [`EntityType`]
    /// - if the account referred to by `owned_by_id` does not exist
    /// - if an [`EntityUuid`] was supplied and already exists in the store
    fn create_entity<R>(
        &mut self,
        actor_id: AccountId,
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
        actor_id: AccountId,
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
        actor_id: AccountId,
        consistency: Consistency<'_>,
        params: ValidateEntityParams<'_>,
    ) -> impl Future<Output = Result<(), Report<ValidateEntityError>>> + Send {
        self.validate_entities(actor_id, consistency, vec![params])
    }

    /// Validates [`Entities`][Entity].
    ///
    /// # Errors:
    ///
    /// - if the validation failed
    fn validate_entities(
        &self,
        actor_id: AccountId,
        consistency: Consistency<'_>,
        params: Vec<ValidateEntityParams<'_>>,
    ) -> impl Future<Output = Result<(), Report<ValidateEntityError>>> + Send;

    /// Get a list of entities specified by the [`GetEntitiesParams`].
    ///
    /// # Errors
    ///
    /// - if the requested [`Entities`][Entity] cannot be retrieved
    fn get_entities(
        &self,
        actor_id: AccountId,
        params: GetEntitiesParams<'_>,
    ) -> impl Future<Output = Result<GetEntitiesResponse<'static>, Report<QueryError>>> + Send;

    /// Get the [`Subgraph`]s specified by the [`GetEntitySubgraphParams`].
    ///
    /// # Errors
    ///
    /// - if the requested [`Entities`][Entity] cannot be retrieved
    fn get_entity_subgraph(
        &self,
        actor_id: AccountId,
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
        actor_id: AccountId,
        params: CountEntitiesParams<'_>,
    ) -> impl Future<Output = Result<usize, Report<QueryError>>> + Send;

    fn get_entity_by_id(
        &self,
        actor_id: AccountId,
        entity_id: EntityId,
        transaction_time: Option<Timestamp<TransactionTime>>,
        decision_time: Option<Timestamp<DecisionTime>>,
    ) -> impl Future<Output = Result<Entity, Report<QueryError>>> + Send;

    fn patch_entity(
        &mut self,
        actor_id: AccountId,
        params: PatchEntityParams,
    ) -> impl Future<Output = Result<Entity, Report<UpdateError>>> + Send;

    fn diff_entity(
        &self,
        actor_id: AccountId,
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
        actor_id: AccountId,
        params: UpdateEntityEmbeddingsParams<'_>,
    ) -> impl Future<Output = Result<(), Report<UpdateError>>> + Send;
}
