use error_stack::{Result, ResultExt};
use graph_types::{
    account::{AccountGroupId, AccountId},
    knowledge::entity::{EntityId, EntityUuid},
    web::WebId,
};

use crate::{
    backend::{
        CheckError, CheckResponse, ModifyRelationError, ModifyRelationshipOperation, ReadError,
        ZanzibarBackend,
    },
    schema::{
        AccountGroupPermission, AccountGroupRelation, EntityPermission, EntityRelationAndSubject,
        WebPermission, WebRelationAndSubject,
    },
    zanzibar::{types::RelationshipFilter, Consistency, Zookie},
    AuthorizationApi,
};

#[derive(Debug, Clone)]
pub struct ZanzibarClient<B> {
    backend: B,
}

impl<B> ZanzibarClient<B> {
    pub const fn new(backend: B) -> Self {
        Self { backend }
    }
}

impl<B> AuthorizationApi for ZanzibarClient<B>
where
    B: ZanzibarBackend + Send + Sync,
{
    ////////////////////////////////////////////////////////////////////////////
    // Account group authorization
    ////////////////////////////////////////////////////////////////////////////
    async fn check_account_group_permission(
        &self,
        actor: AccountId,
        permission: AccountGroupPermission,
        account_group: AccountGroupId,
        consistency: Consistency<'_>,
    ) -> Result<CheckResponse, CheckError> {
        self.backend
            .check(&account_group, &permission, &actor, consistency)
            .await
    }

    async fn add_account_group_owner(
        &mut self,
        member: AccountId,
        account_group: AccountGroupId,
    ) -> Result<Zookie<'static>, ModifyRelationError> {
        Ok(self
            .backend
            .create_relationships([(account_group, AccountGroupRelation::DirectOwner, member)])
            .await
            .change_context(ModifyRelationError)?
            .written_at)
    }

    async fn remove_account_group_owner(
        &mut self,
        member: AccountId,
        account_group: AccountGroupId,
    ) -> Result<Zookie<'static>, ModifyRelationError> {
        Ok(self
            .backend
            .delete_relationships([(account_group, AccountGroupRelation::DirectOwner, member)])
            .await
            .change_context(ModifyRelationError)?
            .written_at)
    }

    async fn add_account_group_admin(
        &mut self,
        member: AccountId,
        account_group: AccountGroupId,
    ) -> Result<Zookie<'static>, ModifyRelationError> {
        Ok(self
            .backend
            .create_relationships([(account_group, AccountGroupRelation::DirectAdmin, member)])
            .await
            .change_context(ModifyRelationError)?
            .written_at)
    }

    async fn remove_account_group_admin(
        &mut self,
        member: AccountId,
        account_group: AccountGroupId,
    ) -> Result<Zookie<'static>, ModifyRelationError> {
        Ok(self
            .backend
            .delete_relationships([(account_group, AccountGroupRelation::DirectAdmin, member)])
            .await
            .change_context(ModifyRelationError)?
            .written_at)
    }

    async fn add_account_group_member(
        &mut self,
        member: AccountId,
        account_group: AccountGroupId,
    ) -> Result<Zookie<'static>, ModifyRelationError> {
        Ok(self
            .backend
            .create_relationships([(account_group, AccountGroupRelation::DirectMember, member)])
            .await
            .change_context(ModifyRelationError)?
            .written_at)
    }

    async fn remove_account_group_member(
        &mut self,
        member: AccountId,
        account_group: AccountGroupId,
    ) -> Result<Zookie<'static>, ModifyRelationError> {
        Ok(self
            .backend
            .delete_relationships([(account_group, AccountGroupRelation::DirectMember, member)])
            .await
            .change_context(ModifyRelationError)?
            .written_at)
    }

    ////////////////////////////////////////////////////////////////////////////
    // Web authorization
    ////////////////////////////////////////////////////////////////////////////
    async fn check_web_permission(
        &self,
        actor: AccountId,
        permission: WebPermission,
        web: WebId,
        consistency: Consistency<'_>,
    ) -> Result<CheckResponse, CheckError> {
        self.backend
            .check(&web, &permission, &actor, consistency)
            .await
    }

    async fn modify_web_relations(
        &mut self,
        relationships: impl IntoIterator<
            Item = (ModifyRelationshipOperation, WebId, WebRelationAndSubject),
            IntoIter: Send,
        > + Send,
    ) -> Result<Zookie<'static>, ModifyRelationError> {
        Ok(self
            .backend
            .modify_relationships(
                relationships
                    .into_iter()
                    .map(|(operation, web_id, relation)| (operation, (web_id, relation))),
            )
            .await
            .change_context(ModifyRelationError)?
            .written_at)
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
    ) -> Result<Zookie<'static>, ModifyRelationError> {
        Ok(self
            .backend
            .modify_relationships(relationships.into_iter().map(
                |(operation, entity_id, relation)| (operation, (entity_id.entity_uuid, relation)),
            ))
            .await
            .change_context(ModifyRelationError)?
            .written_at)
    }

    async fn check_entity_permission(
        &self,
        actor: AccountId,
        permission: EntityPermission,
        entity: EntityId,
        consistency: Consistency<'_>,
    ) -> Result<CheckResponse, CheckError> {
        self.backend
            .check(&entity.entity_uuid, &permission, &actor, consistency)
            .await
    }

    async fn get_entity_relations(
        &self,
        entity: EntityId,
        consistency: Consistency<'static>,
    ) -> Result<Vec<EntityRelationAndSubject>, ReadError> {
        Ok(self
            .backend
            .read_relations::<(EntityUuid, EntityRelationAndSubject)>(
                RelationshipFilter::from_resource(entity.entity_uuid),
                consistency,
            )
            .await
            .change_context(ReadError)?
            .into_iter()
            .map(|(_, relation)| relation)
            .collect())
    }
}
