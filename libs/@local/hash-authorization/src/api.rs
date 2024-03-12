use std::collections::HashMap;

use error_stack::{Context, Result};
use graph_types::{
    account::{AccountGroupId, AccountId},
    knowledge::entity::{EntityId, EntityUuid},
    owned_by_id::OwnedById,
};

use crate::{
    backend::{
        CheckError, CheckResponse, ModifyRelationError, ModifyRelationshipOperation, ReadError,
    },
    schema::{
        AccountGroupPermission, AccountGroupRelationAndSubject, DataTypeId, DataTypePermission,
        DataTypeRelationAndSubject, EntityPermission, EntityRelationAndSubject, EntityTypeId,
        EntityTypePermission, EntityTypeRelationAndSubject, PropertyTypeId, PropertyTypePermission,
        PropertyTypeRelationAndSubject, WebPermission, WebRelationAndSubject,
    },
    zanzibar::{Consistency, Zookie},
};

pub trait AuthorizationApi {
    fn seed(&mut self)
    -> impl Future<Output = Result<Zookie<'static>, ModifyRelationError>> + Send;

    ////////////////////////////////////////////////////////////////////////////
    // Account group authorization
    ////////////////////////////////////////////////////////////////////////////
    fn check_account_group_permission(
        &self,
        actor: AccountId,
        permission: AccountGroupPermission,
        account_group: AccountGroupId,
        consistency: Consistency<'_>,
    ) -> impl Future<Output = Result<CheckResponse, CheckError>> + Send;

    fn modify_account_group_relations(
        &mut self,
        relationships: impl IntoIterator<
            Item = (
                ModifyRelationshipOperation,
                AccountGroupId,
                AccountGroupRelationAndSubject,
            ),
            IntoIter: Send,
        > + Send,
    ) -> impl Future<Output = Result<Zookie<'static>, ModifyRelationError>> + Send;

    ////////////////////////////////////////////////////////////////////////////
    // Web authorization
    ////////////////////////////////////////////////////////////////////////////
    fn check_web_permission(
        &self,
        actor: AccountId,
        permission: WebPermission,
        web: OwnedById,
        consistency: Consistency<'_>,
    ) -> impl Future<Output = Result<CheckResponse, CheckError>> + Send;

    fn check_webs_permission(
        &self,
        actor: AccountId,
        permission: WebPermission,
        entities: impl IntoIterator<Item = OwnedById, IntoIter: Send> + Send,
        consistency: Consistency<'_>,
    ) -> impl Future<Output = Result<(HashMap<OwnedById, bool>, Zookie<'static>), CheckError>> + Send
    where
        Self: Sync,
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
            Item = (
                ModifyRelationshipOperation,
                OwnedById,
                WebRelationAndSubject,
            ),
            IntoIter: Send,
        > + Send,
    ) -> impl Future<Output = Result<Zookie<'static>, ModifyRelationError>> + Send;

    fn get_web_relations(
        &self,
        web: OwnedById,
        consistency: Consistency<'static>,
    ) -> impl Future<Output = Result<Vec<WebRelationAndSubject>, ReadError>> + Send;

    ////////////////////////////////////////////////////////////////////////////
    // Entity authorization
    ////////////////////////////////////////////////////////////////////////////
    fn check_entity_permission(
        &self,
        actor: AccountId,
        permission: EntityPermission,
        entity: EntityId,
        consistency: Consistency<'_>,
    ) -> impl Future<Output = Result<CheckResponse, CheckError>> + Send;

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
    ) -> impl Future<Output = Result<Zookie<'static>, ModifyRelationError>> + Send;

    fn check_entities_permission(
        &self,
        actor: AccountId,
        permission: EntityPermission,
        entities: impl IntoIterator<Item = EntityId, IntoIter: Send> + Send,
        consistency: Consistency<'_>,
    ) -> impl Future<Output = Result<(HashMap<EntityUuid, bool>, Zookie<'static>), CheckError>> + Send;

    fn get_entity_relations(
        &self,
        entity: EntityId,
        consistency: Consistency<'static>,
    ) -> impl Future<Output = Result<Vec<EntityRelationAndSubject>, ReadError>> + Send;

    ////////////////////////////////////////////////////////////////////////////
    // Entity type authorization
    ////////////////////////////////////////////////////////////////////////////
    fn check_entity_type_permission(
        &self,
        actor: AccountId,
        permission: EntityTypePermission,
        entity_type: EntityTypeId,
        consistency: Consistency<'_>,
    ) -> impl Future<Output = Result<CheckResponse, CheckError>> + Send;

    fn modify_entity_type_relations(
        &mut self,
        relationships: impl IntoIterator<
            Item = (
                ModifyRelationshipOperation,
                EntityTypeId,
                EntityTypeRelationAndSubject,
            ),
            IntoIter: Send,
        > + Send,
    ) -> impl Future<Output = Result<Zookie<'static>, ModifyRelationError>> + Send;

    fn check_entity_types_permission(
        &self,
        actor: AccountId,
        permission: EntityTypePermission,
        entity_types: impl IntoIterator<Item = EntityTypeId, IntoIter: Send> + Send,
        consistency: Consistency<'_>,
    ) -> impl Future<Output = Result<(HashMap<EntityTypeId, bool>, Zookie<'static>), CheckError>> + Send;

    fn get_entity_type_relations(
        &self,
        entity_type: EntityTypeId,
        consistency: Consistency<'static>,
    ) -> impl Future<Output = Result<Vec<EntityTypeRelationAndSubject>, ReadError>> + Send;

    ////////////////////////////////////////////////////////////////////////////
    // Property type authorization
    ////////////////////////////////////////////////////////////////////////////
    fn check_property_type_permission(
        &self,
        actor: AccountId,
        permission: PropertyTypePermission,
        property_type: PropertyTypeId,
        consistency: Consistency<'_>,
    ) -> impl Future<Output = Result<CheckResponse, CheckError>> + Send;

    fn modify_property_type_relations(
        &mut self,
        relationships: impl IntoIterator<
            Item = (
                ModifyRelationshipOperation,
                PropertyTypeId,
                PropertyTypeRelationAndSubject,
            ),
            IntoIter: Send,
        > + Send,
    ) -> impl Future<Output = Result<Zookie<'static>, ModifyRelationError>> + Send;

    fn check_property_types_permission(
        &self,
        actor: AccountId,
        permission: PropertyTypePermission,
        property_types: impl IntoIterator<Item = PropertyTypeId, IntoIter: Send> + Send,
        consistency: Consistency<'_>,
    ) -> impl Future<Output = Result<(HashMap<PropertyTypeId, bool>, Zookie<'static>), CheckError>> + Send;

    fn get_property_type_relations(
        &self,
        property_type: PropertyTypeId,
        consistency: Consistency<'static>,
    ) -> impl Future<Output = Result<Vec<PropertyTypeRelationAndSubject>, ReadError>> + Send;

    ////////////////////////////////////////////////////////////////////////////
    // Data type authorization
    ////////////////////////////////////////////////////////////////////////////
    fn check_data_type_permission(
        &self,
        actor: AccountId,
        permission: DataTypePermission,
        data_type: DataTypeId,
        consistency: Consistency<'_>,
    ) -> impl Future<Output = Result<CheckResponse, CheckError>> + Send;

    fn modify_data_type_relations(
        &mut self,
        relationships: impl IntoIterator<
            Item = (
                ModifyRelationshipOperation,
                DataTypeId,
                DataTypeRelationAndSubject,
            ),
            IntoIter: Send,
        > + Send,
    ) -> impl Future<Output = Result<Zookie<'static>, ModifyRelationError>> + Send;

    fn check_data_types_permission(
        &self,
        actor: AccountId,
        permission: DataTypePermission,
        data_types: impl IntoIterator<Item = DataTypeId, IntoIter: Send> + Send,
        consistency: Consistency<'_>,
    ) -> impl Future<Output = Result<(HashMap<DataTypeId, bool>, Zookie<'static>), CheckError>> + Send;

    fn get_data_type_relations(
        &self,
        data_type: DataTypeId,
        consistency: Consistency<'static>,
    ) -> impl Future<Output = Result<Vec<DataTypeRelationAndSubject>, ReadError>> + Send;
}

/// Managed pool to keep track about [`AuthorizationApi`]s.
pub trait AuthorizationApiPool {
    /// The error returned when acquiring an [`AuthorizationApi`].
    type Error: Context;

    /// The [`AuthorizationApi`] returned when acquiring.
    type Api<'pool>: AuthorizationApi + Send + Sync;

    /// Retrieves an [`AuthorizationApi`] from the pool.
    fn acquire(&self) -> impl Future<Output = Result<Self::Api<'_>, Self::Error>> + Send;

    /// Retrieves an owned [`AuthorizationApi`] from the pool.
    ///
    /// Using an owned [`AuthorizationApi`] makes it easier to leak the connection pool and it's not
    /// possible to reuse that connection. Therefore, [`acquire`] (which stores a lifetime-bound
    /// reference to the `AuthorizationApiPool`) should be preferred whenever possible.
    ///
    /// [`acquire`]: Self::acquire
    fn acquire_owned(&self)
    -> impl Future<Output = Result<Self::Api<'static>, Self::Error>> + Send;
}
