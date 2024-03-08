use std::{borrow::Cow, error::Error, fmt, future::Future};

use authorization::{schema::EntityRelationAndSubject, zanzibar::Consistency, AuthorizationApi};
use error_stack::Report;
use graph_types::{
    account::AccountId,
    knowledge::{
        entity::{Entity, EntityEmbedding, EntityId, EntityMetadata, EntityProperties, EntityUuid},
        link::{EntityLinkOrder, LinkData},
    },
    owned_by_id::OwnedById,
};
use serde::{Deserialize, Serialize};
use temporal_client::TemporalClient;
use temporal_versioning::{DecisionTime, Timestamp, TransactionTime};
use type_system::{url::VersionedUrl, ClosedEntityType, EntityType};
#[cfg(feature = "utoipa")]
use utoipa::{
    openapi,
    openapi::{schema, Ref, RefOr, Schema},
    ToSchema,
};
use validation::ValidationProfile;

use crate::{
    knowledge::EntityQueryPath,
    store::{
        crud, crud::Sorting, postgres::CursorField, InsertionError, NullOrdering, Ordering,
        QueryError, UpdateError,
    },
    subgraph::{query::EntityStructuralQuery, Subgraph},
};

#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
#[expect(clippy::large_enum_variant)]
pub enum EntityValidationType<'a> {
    Schema(Vec<EntityType>),
    Id(Cow<'a, [VersionedUrl]>),
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

#[derive(Debug, Deserialize)]
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
    pub entity_type_ids: Vec<VersionedUrl>,
    pub properties: EntityProperties,
    #[serde(default)]
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    pub link_data: Option<LinkData>,
    pub draft: bool,
    pub relationships: R,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ValidateEntityParams<'a> {
    #[serde(borrow)]
    pub entity_types: EntityValidationType<'a>,
    #[serde(borrow)]
    pub properties: Cow<'a, EntityProperties>,
    #[serde(borrow, default)]
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    pub link_data: Option<Cow<'a, LinkData>>,
    pub profile: ValidationProfile,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GetEntityParams<'a> {
    #[serde(borrow)]
    pub query: EntityStructuralQuery<'a>,
    #[serde(borrow)]
    pub sorting: EntityQuerySorting<'static>,
    pub limit: Option<usize>,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdateEntityParams {
    pub entity_id: EntityId,
    #[serde(default)]
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    pub decision_time: Option<Timestamp<DecisionTime>>,
    pub entity_type_ids: Vec<VersionedUrl>,
    pub properties: EntityProperties,
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    pub link_order: EntityLinkOrder,
    pub archived: bool,
    pub draft: bool,
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

/// Describes the API of a store implementation for [Entities].
///
/// [Entities]: Entity
pub trait EntityStore: crud::ReadPaginated<Entity> {
    /// Creates a new [`Entity`].
    ///
    /// # Errors:
    ///
    /// - if the [`EntityType`] doesn't exist
    /// - if the [`EntityProperties`] is not valid with respect to the specified [`EntityType`]
    /// - if the account referred to by `owned_by_id` does not exist
    /// - if an [`EntityUuid`] was supplied and already exists in the store
    ///
    /// [`EntityType`]: type_system::EntityType
    fn create_entity<A: AuthorizationApi + Send + Sync, R>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut A,
        temporal_client: Option<&TemporalClient>,
        params: CreateEntityParams<R>,
    ) -> impl Future<Output = Result<EntityMetadata, Report<InsertionError>>> + Send
    where
        R: IntoIterator<Item = EntityRelationAndSubject> + Send;

    /// Validates an [`Entity`].
    ///
    /// # Errors:
    ///
    /// - if the validation failed
    fn validate_entity<A: AuthorizationApi + Sync>(
        &self,
        actor_id: AccountId,
        authorization_api: &A,
        consistency: Consistency<'_>,
        params: ValidateEntityParams<'_>,
    ) -> impl Future<Output = Result<(), Report<ValidateEntityError>>> + Send;

    /// Inserts the entities with the specified [`EntityType`] into the `Store`.
    ///
    /// This is only supporting a single [`EntityType`], not one [`EntityType`] per entity.
    /// [`EntityType`]s is stored in a different table and would need to be queried for each,
    /// this would be a lot less efficient.
    ///
    /// This is not supposed to be used outside of benchmarking as in the long term we need to
    /// figure out how to deal with batch inserting.
    ///
    /// # Errors
    ///
    /// - if the [`EntityType`] doesn't exist
    /// - if on of the [`Entity`] is not valid with respect to the specified [`EntityType`]
    /// - if the account referred to by `owned_by_id` does not exist
    /// - if an [`EntityUuid`] was supplied and already exists in the store
    ///
    /// [`EntityType`]: type_system::EntityType
    fn insert_entities_batched_by_type<A: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut A,
        entities: impl IntoIterator<
            Item = (
                OwnedById,
                Option<EntityUuid>,
                EntityProperties,
                Option<LinkData>,
                Option<Timestamp<DecisionTime>>,
            ),
            IntoIter: Send,
        > + Send,
        entity_type_id: &VersionedUrl,
    ) -> impl Future<Output = Result<Vec<EntityMetadata>, Report<InsertionError>>> + Send;

    /// Get the [`Subgraph`]s specified by the [`StructuralQuery`].
    ///
    /// # Errors
    ///
    /// - if the requested [`Entity`] doesn't exist
    ///
    /// [`StructuralQuery`]: crate::subgraph::query::StructuralQuery
    fn get_entity<A: AuthorizationApi + Sync>(
        &self,
        actor_id: AccountId,
        authorization_api: &A,
        params: GetEntityParams<'_>,
    ) -> impl Future<
        Output = Result<(Subgraph, Option<EntityQueryCursor<'static>>), Report<QueryError>>,
    > + Send;

    /// Update an existing [`Entity`].
    ///
    /// # Errors
    ///
    /// - if the [`Entity`] doesn't exist
    /// - if the [`EntityType`] doesn't exist
    /// - if the [`Entity`] is not valid with respect to its [`EntityType`]
    /// - if the account referred to by `actor_id` does not exist
    ///
    /// [`EntityType`]: type_system::EntityType
    // TODO: Allow partial updates to avoid setting the `draft` and `archived` state here
    //   see https://linear.app/hash/issue/H-1455
    fn update_entity<A: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut A,
        temporal_client: Option<&TemporalClient>,
        params: UpdateEntityParams,
    ) -> impl Future<Output = Result<EntityMetadata, Report<UpdateError>>> + Send;

    fn update_entity_embeddings<A: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut A,
        params: UpdateEntityEmbeddingsParams<'_>,
    ) -> impl Future<Output = Result<(), Report<UpdateError>>> + Send;
}
