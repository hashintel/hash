use core::error::Error;
use std::collections::HashMap;

use error_stack::Report;
use type_system::{
    knowledge::entity::id::{EntityId, EntityUuid},
    ontology::{
        data_type::DataTypeUuid, entity_type::EntityTypeUuid, property_type::PropertyTypeUuid,
    },
    principal::{
        actor::ActorEntityUuid,
        actor_group::{ActorGroupEntityUuid, WebId},
    },
};

use crate::{
    backend::{
        CheckError, CheckResponse, ModifyRelationError, ModifyRelationshipOperation, ReadError,
    },
    schema::{
        AccountGroupPermission, AccountGroupRelationAndSubject, ActorIdOrPublic,
        DataTypePermission, DataTypeRelationAndSubject, EntityPermission, EntityRelationAndSubject,
        EntityTypePermission, EntityTypeRelationAndSubject, PropertyTypePermission,
        PropertyTypeRelationAndSubject, WebPermission, WebRelationAndSubject,
    },
    zanzibar::{Consistency, Zookie},
};

pub trait AuthorizationApi: Send + Sync {
    fn seed(
        &mut self,
    ) -> impl Future<Output = Result<Zookie<'static>, Report<ModifyRelationError>>> + Send;

    ////////////////////////////////////////////////////////////////////////////
    // Account group authorization
    ////////////////////////////////////////////////////////////////////////////
    fn check_account_group_permission(
        &self,
        actor: ActorEntityUuid,
        permission: AccountGroupPermission,
        account_group: ActorGroupEntityUuid,
        consistency: Consistency<'_>,
    ) -> impl Future<Output = Result<CheckResponse, Report<CheckError>>> + Send;

    fn get_account_group_relations(
        &self,
        account_group: ActorGroupEntityUuid,
        consistency: Consistency<'_>,
    ) -> impl Future<Output = Result<Vec<AccountGroupRelationAndSubject>, Report<ReadError>>> + Send;

    fn modify_account_group_relations(
        &mut self,
        relationships: impl IntoIterator<
            Item = (
                ModifyRelationshipOperation,
                ActorGroupEntityUuid,
                AccountGroupRelationAndSubject,
            ),
            IntoIter: Send,
        > + Send,
    ) -> impl Future<Output = Result<Zookie<'static>, Report<ModifyRelationError>>> + Send;

    ////////////////////////////////////////////////////////////////////////////
    // Web authorization
    ////////////////////////////////////////////////////////////////////////////
    fn check_web_permission(
        &self,
        actor: ActorEntityUuid,
        permission: WebPermission,
        web: WebId,
        consistency: Consistency<'_>,
    ) -> impl Future<Output = Result<CheckResponse, Report<CheckError>>> + Send;

    fn check_webs_permission(
        &self,
        actor: ActorEntityUuid,
        permission: WebPermission,
        entities: impl IntoIterator<Item = WebId, IntoIter: Send> + Send,
        consistency: Consistency<'_>,
    ) -> impl Future<Output = Result<(HashMap<WebId, bool>, Zookie<'static>), Report<CheckError>>> + Send
    {
        async move {
            let mut zookie = Zookie::empty();
            let mut result = HashMap::new();
            for entity in entities {
                let CheckResponse {
                    has_permission,
                    checked_at,
                } = self
                    .check_web_permission(actor, permission, entity, consistency)
                    .await?;
                result.insert(entity, has_permission);
                zookie = checked_at;
            }
            Ok((result, zookie))
        }
    }

    fn modify_web_relations(
        &mut self,
        relationships: impl IntoIterator<
            Item = (ModifyRelationshipOperation, WebId, WebRelationAndSubject),
            IntoIter: Send,
        > + Send,
    ) -> impl Future<Output = Result<Zookie<'static>, Report<ModifyRelationError>>> + Send;

    fn get_web_relations(
        &self,
        web: WebId,
        consistency: Consistency<'static>,
    ) -> impl Future<Output = Result<Vec<WebRelationAndSubject>, Report<ReadError>>> + Send;

    ////////////////////////////////////////////////////////////////////////////
    // Entity authorization
    ////////////////////////////////////////////////////////////////////////////
    fn check_entity_permission(
        &self,
        actor: ActorEntityUuid,
        permission: EntityPermission,
        entity: EntityId,
        consistency: Consistency<'_>,
    ) -> impl Future<Output = Result<CheckResponse, Report<CheckError>>> + Send;

    fn get_entities(
        &self,
        actor: ActorEntityUuid,
        permission: EntityPermission,
        consistency: Consistency<'_>,
    ) -> impl Future<Output = Result<Vec<EntityUuid>, Report<ReadError>>> + Send;

    fn get_entity_accounts(
        &self,
        entity: EntityUuid,
        permission: EntityPermission,
        consistency: Consistency<'_>,
    ) -> impl Future<Output = Result<Vec<ActorIdOrPublic>, Report<ReadError>>> + Send;

    fn modify_entity_relations(
        &mut self,
        relationships: impl IntoIterator<
            Item = (
                ModifyRelationshipOperation,
                EntityId,
                EntityRelationAndSubject,
            ),
            IntoIter: Send,
        > + Send,
    ) -> impl Future<Output = Result<Zookie<'static>, Report<ModifyRelationError>>> + Send;

    fn check_entities_permission(
        &self,
        actor: ActorEntityUuid,
        permission: EntityPermission,
        entities: impl IntoIterator<Item = EntityId, IntoIter: Send + Sync> + Send,
        consistency: Consistency<'_>,
    ) -> impl Future<
        Output = Result<(HashMap<EntityUuid, bool>, Zookie<'static>), Report<CheckError>>,
    > + Send;

    fn get_entity_relations(
        &self,
        entity: EntityId,
        consistency: Consistency<'static>,
    ) -> impl Future<Output = Result<Vec<EntityRelationAndSubject>, Report<ReadError>>> + Send;

    ////////////////////////////////////////////////////////////////////////////
    // Entity type authorization
    ////////////////////////////////////////////////////////////////////////////
    fn check_entity_type_permission(
        &self,
        actor: ActorEntityUuid,
        permission: EntityTypePermission,
        entity_type: EntityTypeUuid,
        consistency: Consistency<'_>,
    ) -> impl Future<Output = Result<CheckResponse, Report<CheckError>>> + Send;

    fn modify_entity_type_relations(
        &mut self,
        relationships: impl IntoIterator<
            Item = (
                ModifyRelationshipOperation,
                EntityTypeUuid,
                EntityTypeRelationAndSubject,
            ),
            IntoIter: Send,
        > + Send,
    ) -> impl Future<Output = Result<Zookie<'static>, Report<ModifyRelationError>>> + Send;

    fn check_entity_types_permission(
        &self,
        actor: ActorEntityUuid,
        permission: EntityTypePermission,
        entity_types: impl IntoIterator<Item = EntityTypeUuid, IntoIter: Send + Sync> + Send,
        consistency: Consistency<'_>,
    ) -> impl Future<
        Output = Result<(HashMap<EntityTypeUuid, bool>, Zookie<'static>), Report<CheckError>>,
    > + Send;

    fn get_entity_type_relations(
        &self,
        entity_type: EntityTypeUuid,
        consistency: Consistency<'static>,
    ) -> impl Future<Output = Result<Vec<EntityTypeRelationAndSubject>, Report<ReadError>>> + Send;

    ////////////////////////////////////////////////////////////////////////////
    // Property type authorization
    ////////////////////////////////////////////////////////////////////////////
    fn check_property_type_permission(
        &self,
        actor: ActorEntityUuid,
        permission: PropertyTypePermission,
        property_type: PropertyTypeUuid,
        consistency: Consistency<'_>,
    ) -> impl Future<Output = Result<CheckResponse, Report<CheckError>>> + Send;

    fn modify_property_type_relations(
        &mut self,
        relationships: impl IntoIterator<
            Item = (
                ModifyRelationshipOperation,
                PropertyTypeUuid,
                PropertyTypeRelationAndSubject,
            ),
            IntoIter: Send,
        > + Send,
    ) -> impl Future<Output = Result<Zookie<'static>, Report<ModifyRelationError>>> + Send;

    fn check_property_types_permission(
        &self,
        actor: ActorEntityUuid,
        permission: PropertyTypePermission,
        property_types: impl IntoIterator<Item = PropertyTypeUuid, IntoIter: Send + Sync> + Send,
        consistency: Consistency<'_>,
    ) -> impl Future<
        Output = Result<(HashMap<PropertyTypeUuid, bool>, Zookie<'static>), Report<CheckError>>,
    > + Send;

    fn get_property_type_relations(
        &self,
        property_type: PropertyTypeUuid,
        consistency: Consistency<'static>,
    ) -> impl Future<Output = Result<Vec<PropertyTypeRelationAndSubject>, Report<ReadError>>> + Send;

    ////////////////////////////////////////////////////////////////////////////
    // Data type authorization
    ////////////////////////////////////////////////////////////////////////////
    fn check_data_type_permission(
        &self,
        actor: ActorEntityUuid,
        permission: DataTypePermission,
        data_type: DataTypeUuid,
        consistency: Consistency<'_>,
    ) -> impl Future<Output = Result<CheckResponse, Report<CheckError>>> + Send;

    fn modify_data_type_relations(
        &mut self,
        relationships: impl IntoIterator<
            Item = (
                ModifyRelationshipOperation,
                DataTypeUuid,
                DataTypeRelationAndSubject,
            ),
            IntoIter: Send,
        > + Send,
    ) -> impl Future<Output = Result<Zookie<'static>, Report<ModifyRelationError>>> + Send;

    fn check_data_types_permission(
        &self,
        actor: ActorEntityUuid,
        permission: DataTypePermission,
        data_types: impl IntoIterator<Item = DataTypeUuid, IntoIter: Send + Sync> + Send,
        consistency: Consistency<'_>,
    ) -> impl Future<
        Output = Result<(HashMap<DataTypeUuid, bool>, Zookie<'static>), Report<CheckError>>,
    > + Send;

    fn get_data_type_relations(
        &self,
        data_type: DataTypeUuid,
        consistency: Consistency<'static>,
    ) -> impl Future<Output = Result<Vec<DataTypeRelationAndSubject>, Report<ReadError>>> + Send;
}

impl<A: AuthorizationApi> AuthorizationApi for &mut A {
    async fn seed(&mut self) -> Result<Zookie<'static>, Report<ModifyRelationError>> {
        (**self).seed().await
    }

    async fn check_account_group_permission(
        &self,
        actor: ActorEntityUuid,
        permission: AccountGroupPermission,
        account_group: ActorGroupEntityUuid,
        consistency: Consistency<'_>,
    ) -> Result<CheckResponse, Report<CheckError>> {
        (**self)
            .check_account_group_permission(actor, permission, account_group, consistency)
            .await
    }

    async fn get_account_group_relations(
        &self,
        account_group: ActorGroupEntityUuid,
        consistency: Consistency<'_>,
    ) -> Result<Vec<AccountGroupRelationAndSubject>, Report<ReadError>> {
        (**self)
            .get_account_group_relations(account_group, consistency)
            .await
    }

    async fn modify_account_group_relations(
        &mut self,
        relationships: impl IntoIterator<
            Item = (
                ModifyRelationshipOperation,
                ActorGroupEntityUuid,
                AccountGroupRelationAndSubject,
            ),
            IntoIter: Send,
        > + Send,
    ) -> Result<Zookie<'static>, Report<ModifyRelationError>> {
        (**self).modify_account_group_relations(relationships).await
    }

    async fn check_web_permission(
        &self,
        actor: ActorEntityUuid,
        permission: WebPermission,
        web: WebId,
        consistency: Consistency<'_>,
    ) -> Result<CheckResponse, Report<CheckError>> {
        (**self)
            .check_web_permission(actor, permission, web, consistency)
            .await
    }

    async fn modify_web_relations(
        &mut self,
        relationships: impl IntoIterator<
            Item = (ModifyRelationshipOperation, WebId, WebRelationAndSubject),
            IntoIter: Send,
        > + Send,
    ) -> Result<Zookie<'static>, Report<ModifyRelationError>> {
        (**self).modify_web_relations(relationships).await
    }

    async fn get_web_relations(
        &self,
        web: WebId,
        consistency: Consistency<'static>,
    ) -> Result<Vec<WebRelationAndSubject>, Report<ReadError>> {
        (**self).get_web_relations(web, consistency).await
    }

    async fn check_entity_permission(
        &self,
        actor: ActorEntityUuid,
        permission: EntityPermission,
        entity: EntityId,
        consistency: Consistency<'_>,
    ) -> Result<CheckResponse, Report<CheckError>> {
        (**self)
            .check_entity_permission(actor, permission, entity, consistency)
            .await
    }

    async fn modify_entity_relations(
        &mut self,
        relationships: impl IntoIterator<
            Item = (
                ModifyRelationshipOperation,
                EntityId,
                EntityRelationAndSubject,
            ),
            IntoIter: Send,
        > + Send,
    ) -> Result<Zookie<'static>, Report<ModifyRelationError>> {
        (**self).modify_entity_relations(relationships).await
    }

    async fn check_entities_permission(
        &self,
        actor: ActorEntityUuid,
        permission: EntityPermission,
        entities: impl IntoIterator<Item = EntityId, IntoIter: Send + Sync> + Send,
        consistency: Consistency<'_>,
    ) -> Result<(HashMap<EntityUuid, bool>, Zookie<'static>), Report<CheckError>> {
        (**self)
            .check_entities_permission(actor, permission, entities, consistency)
            .await
    }

    async fn get_entity_relations(
        &self,
        entity: EntityId,
        consistency: Consistency<'static>,
    ) -> Result<Vec<EntityRelationAndSubject>, Report<ReadError>> {
        (**self).get_entity_relations(entity, consistency).await
    }

    async fn check_entity_type_permission(
        &self,
        actor: ActorEntityUuid,
        permission: EntityTypePermission,
        entity_type: EntityTypeUuid,
        consistency: Consistency<'_>,
    ) -> Result<CheckResponse, Report<CheckError>> {
        (**self)
            .check_entity_type_permission(actor, permission, entity_type, consistency)
            .await
    }

    async fn modify_entity_type_relations(
        &mut self,
        relationships: impl IntoIterator<
            Item = (
                ModifyRelationshipOperation,
                EntityTypeUuid,
                EntityTypeRelationAndSubject,
            ),
            IntoIter: Send,
        > + Send,
    ) -> Result<Zookie<'static>, Report<ModifyRelationError>> {
        (**self).modify_entity_type_relations(relationships).await
    }

    async fn check_entity_types_permission(
        &self,
        actor: ActorEntityUuid,
        permission: EntityTypePermission,
        entity_types: impl IntoIterator<Item = EntityTypeUuid, IntoIter: Send + Sync> + Send,
        consistency: Consistency<'_>,
    ) -> Result<(HashMap<EntityTypeUuid, bool>, Zookie<'static>), Report<CheckError>> {
        (**self)
            .check_entity_types_permission(actor, permission, entity_types, consistency)
            .await
    }

    async fn get_entity_type_relations(
        &self,
        entity_type: EntityTypeUuid,
        consistency: Consistency<'static>,
    ) -> Result<Vec<EntityTypeRelationAndSubject>, Report<ReadError>> {
        (**self)
            .get_entity_type_relations(entity_type, consistency)
            .await
    }

    async fn check_property_type_permission(
        &self,
        actor: ActorEntityUuid,
        permission: PropertyTypePermission,
        property_type: PropertyTypeUuid,
        consistency: Consistency<'_>,
    ) -> Result<CheckResponse, Report<CheckError>> {
        (**self)
            .check_property_type_permission(actor, permission, property_type, consistency)
            .await
    }

    async fn modify_property_type_relations(
        &mut self,
        relationships: impl IntoIterator<
            Item = (
                ModifyRelationshipOperation,
                PropertyTypeUuid,
                PropertyTypeRelationAndSubject,
            ),
            IntoIter: Send,
        > + Send,
    ) -> Result<Zookie<'static>, Report<ModifyRelationError>> {
        (**self).modify_property_type_relations(relationships).await
    }

    async fn check_property_types_permission(
        &self,
        actor: ActorEntityUuid,
        permission: PropertyTypePermission,
        property_types: impl IntoIterator<Item = PropertyTypeUuid, IntoIter: Send + Sync> + Send,
        consistency: Consistency<'_>,
    ) -> Result<(HashMap<PropertyTypeUuid, bool>, Zookie<'static>), Report<CheckError>> {
        (**self)
            .check_property_types_permission(actor, permission, property_types, consistency)
            .await
    }

    async fn get_property_type_relations(
        &self,
        property_type: PropertyTypeUuid,
        consistency: Consistency<'static>,
    ) -> Result<Vec<PropertyTypeRelationAndSubject>, Report<ReadError>> {
        (**self)
            .get_property_type_relations(property_type, consistency)
            .await
    }

    async fn check_data_type_permission(
        &self,
        actor: ActorEntityUuid,
        permission: DataTypePermission,
        data_type: DataTypeUuid,
        consistency: Consistency<'_>,
    ) -> Result<CheckResponse, Report<CheckError>> {
        (**self)
            .check_data_type_permission(actor, permission, data_type, consistency)
            .await
    }

    async fn modify_data_type_relations(
        &mut self,
        relationships: impl IntoIterator<
            Item = (
                ModifyRelationshipOperation,
                DataTypeUuid,
                DataTypeRelationAndSubject,
            ),
            IntoIter: Send,
        > + Send,
    ) -> Result<Zookie<'static>, Report<ModifyRelationError>> {
        (**self).modify_data_type_relations(relationships).await
    }

    async fn check_data_types_permission(
        &self,
        actor: ActorEntityUuid,
        permission: DataTypePermission,
        data_types: impl IntoIterator<Item = DataTypeUuid, IntoIter: Send + Sync> + Send,
        consistency: Consistency<'_>,
    ) -> Result<(HashMap<DataTypeUuid, bool>, Zookie<'static>), Report<CheckError>> {
        (**self)
            .check_data_types_permission(actor, permission, data_types, consistency)
            .await
    }

    async fn get_data_type_relations(
        &self,
        data_type: DataTypeUuid,
        consistency: Consistency<'static>,
    ) -> Result<Vec<DataTypeRelationAndSubject>, Report<ReadError>> {
        (**self)
            .get_data_type_relations(data_type, consistency)
            .await
    }

    async fn get_entities(
        &self,
        actor: ActorEntityUuid,
        permission: EntityPermission,
        consistency: Consistency<'_>,
    ) -> Result<Vec<EntityUuid>, Report<ReadError>> {
        (**self).get_entities(actor, permission, consistency).await
    }

    async fn get_entity_accounts(
        &self,
        entity: EntityUuid,
        permission: EntityPermission,
        consistency: Consistency<'_>,
    ) -> Result<Vec<ActorIdOrPublic>, Report<ReadError>> {
        (**self)
            .get_entity_accounts(entity, permission, consistency)
            .await
    }
}

/// Managed pool to keep track about [`AuthorizationApi`]s.
pub trait AuthorizationApiPool {
    /// The error returned when acquiring an [`AuthorizationApi`].
    type Error: Error + Send + Sync + 'static;

    /// The [`AuthorizationApi`] returned when acquiring.
    type Api<'pool>: AuthorizationApi;

    /// Retrieves an [`AuthorizationApi`] from the pool.
    fn acquire(&self) -> impl Future<Output = Result<Self::Api<'_>, Report<Self::Error>>> + Send;

    /// Retrieves an owned [`AuthorizationApi`] from the pool.
    ///
    /// Using an owned [`AuthorizationApi`] makes it easier to leak the connection pool and it's not
    /// possible to reuse that connection. Therefore, [`acquire`] (which stores a lifetime-bound
    /// reference to the `AuthorizationApiPool`) should be preferred whenever possible.
    ///
    /// [`acquire`]: Self::acquire
    fn acquire_owned(
        &self,
    ) -> impl Future<Output = Result<Self::Api<'static>, Report<Self::Error>>> + Send;
}
