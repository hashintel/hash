use std::{error::Error, fmt, future::Future};

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
use type_system::{url::VersionedUrl, EntityType};
use validation::ValidationProfile;

use crate::{
    knowledge::EntityQueryPath,
    store::{
        crud, crud::Sorting, postgres::CursorField, InsertionError, Ordering, QueryError,
        UpdateError,
    },
    subgraph::{query::StructuralQuery, Subgraph},
};

#[derive(Debug, Copy, Clone)]
pub enum EntityValidationType<'a> {
    Schema(&'a EntityType),
    Id(&'a VersionedUrl),
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct ValidateEntityError;

impl fmt::Display for ValidateEntityError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("Entity validation failed")
    }
}

impl Error for ValidateEntityError {}

#[derive(Debug, Deserialize)]
pub struct EntityQuerySortingRecord<'s> {
    #[serde(
        borrow,
        deserialize_with = "EntityQueryPath::deserialize_from_sorting_tokens"
    )]
    pub path: EntityQueryPath<'s>,
    pub ordering: Ordering,
}

impl EntityQuerySortingRecord<'_> {
    #[must_use]
    pub fn into_owned(self) -> EntityQuerySortingRecord<'static> {
        EntityQuerySortingRecord {
            path: self.path.into_owned(),
            ordering: self.ordering,
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
    // TODO: Revisit creation parameter to avoid too many parameters, especially as the parameters
    //       are booleans/optionals and can be easily confused
    #[expect(
        clippy::too_many_arguments,
        reason = "https://linear.app/hash/issue/H-1466"
    )]
    fn create_entity<A: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut A,
        temporal_client: Option<&TemporalClient>,
        owned_by_id: OwnedById,
        entity_uuid: Option<EntityUuid>,
        decision_time: Option<Timestamp<DecisionTime>>,
        archived: bool,
        draft: bool,
        entity_type_id: VersionedUrl,
        properties: EntityProperties,
        link_data: Option<LinkData>,
        relationships: impl IntoIterator<Item = EntityRelationAndSubject> + Send,
    ) -> impl Future<Output = Result<EntityMetadata, Report<InsertionError>>> + Send;

    /// Validates an [`Entity`].
    ///
    /// # Errors:
    ///
    /// - if the validation failed
    // TODO: Revisit parameter to avoid too many parameters, especially as the parameters are
    //       booleans/optionals and can be easily confused
    #[expect(
        clippy::too_many_arguments,
        reason = "https://linear.app/hash/issue/H-1466"
    )]
    fn validate_entity<A: AuthorizationApi + Sync>(
        &self,
        actor_id: AccountId,
        authorization_api: &A,
        consistency: Consistency<'static>,
        entity_type: EntityValidationType<'_>,
        properties: &EntityProperties,
        link_data: Option<&LinkData>,
        profile: ValidationProfile,
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
    fn get_entity<A: AuthorizationApi + Sync>(
        &self,
        actor_id: AccountId,
        authorization_api: &A,
        query: &StructuralQuery<'_, Entity>,
        after: EntityQuerySorting<'static>,
        limit: Option<usize>,
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
    // TODO: Revisit creation parameter to avoid too many parameters, especially as the parameters
    //       are booleans/optionals and can be easily confused
    #[expect(
        clippy::too_many_arguments,
        reason = "https://linear.app/hash/issue/H-1466"
    )]
    fn update_entity<A: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut A,
        temporal_client: Option<&TemporalClient>,
        entity_id: EntityId,
        decision_time: Option<Timestamp<DecisionTime>>,
        archived: bool,
        draft: bool,
        entity_type_id: VersionedUrl,
        properties: EntityProperties,
        link_order: EntityLinkOrder,
    ) -> impl Future<Output = Result<EntityMetadata, Report<UpdateError>>> + Send;

    fn update_entity_embeddings<A: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut A,
        embeddings: Vec<EntityEmbedding<'_>>,
        updated_at_transaction_time: Timestamp<TransactionTime>,
        updated_at_decision_time: Timestamp<DecisionTime>,
        reset: bool,
    ) -> impl Future<Output = Result<(), Report<UpdateError>>> + Send;
}
