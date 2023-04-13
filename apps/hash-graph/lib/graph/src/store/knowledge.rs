use async_trait::async_trait;
use error_stack::Result;
use type_system::url::VersionedUrl;

use crate::{
    identifier::{
        knowledge::EntityId,
        time::{DecisionTime, Timestamp},
    },
    knowledge::{Entity, EntityLinkOrder, EntityMetadata, EntityProperties, EntityUuid, LinkData},
    provenance::{OwnedById, RecordCreatedById},
    store::{crud, InsertionError, QueryError, UpdateError},
    subgraph::{query::StructuralQuery, Subgraph},
};

/// Describes the API of a store implementation for [Entities].
///
/// [Entities]: crate::knowledge::Entity
#[async_trait]
pub trait EntityStore: crud::Read<Entity> {
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
    #[expect(clippy::too_many_arguments)]
    async fn create_entity(
        &mut self,
        owned_by_id: OwnedById,
        entity_uuid: Option<EntityUuid>,
        decision_time: Option<Timestamp<DecisionTime>>,
        record_created_by_id: RecordCreatedById,
        archived: bool,
        entity_type_id: VersionedUrl,
        properties: EntityProperties,
        link_data: Option<LinkData>,
    ) -> Result<EntityMetadata, InsertionError>;

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
    #[doc(hidden)]
    #[cfg(feature = "__internal_bench")]
    async fn insert_entities_batched_by_type(
        &mut self,
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
        actor_id: RecordCreatedById,
        entity_type_id: &VersionedUrl,
    ) -> Result<Vec<EntityMetadata>, InsertionError>;

    /// Get the [`Subgraph`]s specified by the [`StructuralQuery`].
    ///
    /// # Errors
    ///
    /// - if the requested [`Entity`] doesn't exist
    async fn get_entity(&self, query: &StructuralQuery<Entity>) -> Result<Subgraph, QueryError>;

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
    #[expect(clippy::too_many_arguments)]
    async fn update_entity(
        &mut self,
        entity_id: EntityId,
        decision_time: Option<Timestamp<DecisionTime>>,
        record_created_by_id: RecordCreatedById,
        archived: bool,
        entity_type_id: VersionedUrl,
        properties: EntityProperties,
        link_order: EntityLinkOrder,
    ) -> Result<EntityMetadata, UpdateError>;
}
