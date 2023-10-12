use error_stack::{Result, ResultExt};
use graph_types::{
    account::{AccountGroupId, AccountId},
    knowledge::entity::{EntityId, EntityUuid},
    web::WebId,
};

use crate::{
    backend::{CheckError, CheckResponse, ModifyRelationError, ReadError, ZanzibarBackend},
    schema::{
        AccountGroupPermission, AccountGroupRelation, EntityPermission, EntityRelation, OwnerId,
        PublicAccess, WebPermission, WebRelation,
    },
    zanzibar::{Consistency, Zookie},
    AccountOrPublic, AuthorizationApi, EntitySubject,
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
    async fn can_add_group_owner(
        &self,
        actor: AccountId,
        account_group: AccountGroupId,
        consistency: Consistency<'_>,
    ) -> Result<CheckResponse, CheckError> {
        self.backend
            .check(
                &(account_group, AccountGroupPermission::AddOwner, actor),
                consistency,
            )
            .await
    }

    async fn add_account_group_owner(
        &mut self,
        member: AccountId,
        account_group: AccountGroupId,
    ) -> Result<Zookie<'static>, ModifyRelationError> {
        Ok(self
            .backend
            .create_relations([(account_group, AccountGroupRelation::DirectOwner, member)])
            .await
            .change_context(ModifyRelationError)?
            .written_at)
    }

    async fn can_remove_group_owner(
        &self,
        actor: AccountId,
        account_group: AccountGroupId,
        consistency: Consistency<'_>,
    ) -> Result<CheckResponse, CheckError> {
        self.backend
            .check(
                &(account_group, AccountGroupPermission::RemoveOwner, actor),
                consistency,
            )
            .await
    }

    async fn remove_account_group_owner(
        &mut self,
        member: AccountId,
        account_group: AccountGroupId,
    ) -> Result<Zookie<'static>, ModifyRelationError> {
        Ok(self
            .backend
            .delete_relations([(account_group, AccountGroupRelation::DirectOwner, member)])
            .await
            .change_context(ModifyRelationError)?
            .deleted_at)
    }

    async fn add_web_owner(
        &mut self,
        owner: OwnerId,
        web: WebId,
    ) -> Result<Zookie<'static>, ModifyRelationError> {
        Ok(match owner {
            OwnerId::Account(account) => {
                self.backend
                    .create_relations([(web, WebRelation::DirectOwner, account)])
                    .await
            }
            OwnerId::AccountGroup(account_group) => {
                self.backend
                    .create_relations([(
                        web,
                        WebRelation::DirectOwner,
                        account_group,
                        AccountGroupPermission::Member,
                    )])
                    .await
            }
        }
        .change_context(ModifyRelationError)?
        .written_at)
    }

    async fn remove_web_owner(
        &mut self,
        owner: OwnerId,
        web: WebId,
    ) -> Result<Zookie<'static>, ModifyRelationError> {
        Ok(match owner {
            OwnerId::Account(account) => {
                self.backend
                    .delete_relations([(web, WebRelation::DirectOwner, account)])
                    .await
            }
            OwnerId::AccountGroup(account_group) => {
                self.backend
                    .delete_relations([(
                        web,
                        WebRelation::DirectOwner,
                        account_group,
                        AccountGroupPermission::Member,
                    )])
                    .await
            }
        }
        .change_context(ModifyRelationError)?
        .deleted_at)
    }

    async fn add_web_editor(
        &mut self,
        editor: OwnerId,
        web: WebId,
    ) -> Result<Zookie<'static>, ModifyRelationError> {
        Ok(match editor {
            OwnerId::Account(account) => {
                self.backend
                    .create_relations([(web, WebRelation::DirectEditor, account)])
                    .await
            }
            OwnerId::AccountGroup(account_group) => {
                self.backend
                    .create_relations([(
                        web,
                        WebRelation::DirectEditor,
                        account_group,
                        AccountGroupPermission::Member,
                    )])
                    .await
            }
        }
        .change_context(ModifyRelationError)?
        .written_at)
    }

    async fn remove_web_editor(
        &mut self,
        editor: OwnerId,
        web: WebId,
    ) -> Result<Zookie<'static>, ModifyRelationError> {
        Ok(match editor {
            OwnerId::Account(account) => {
                self.backend
                    .delete_relations([(web, WebRelation::DirectEditor, account)])
                    .await
            }
            OwnerId::AccountGroup(account_group) => {
                self.backend
                    .delete_relations([(
                        web,
                        WebRelation::DirectEditor,
                        account_group,
                        AccountGroupPermission::Member,
                    )])
                    .await
            }
        }
        .change_context(ModifyRelationError)?
        .deleted_at)
    }

    async fn can_add_group_admin(
        &self,
        actor: AccountId,
        account_group: AccountGroupId,
        consistency: Consistency<'_>,
    ) -> Result<CheckResponse, CheckError> {
        self.backend
            .check(
                &(account_group, AccountGroupPermission::AddAdmin, actor),
                consistency,
            )
            .await
    }

    async fn add_account_group_admin(
        &mut self,
        member: AccountId,
        account_group: AccountGroupId,
    ) -> Result<Zookie<'static>, ModifyRelationError> {
        Ok(self
            .backend
            .create_relations([(account_group, AccountGroupRelation::DirectAdmin, member)])
            .await
            .change_context(ModifyRelationError)?
            .written_at)
    }

    async fn can_remove_group_admin(
        &self,
        actor: AccountId,
        account_group: AccountGroupId,
        consistency: Consistency<'_>,
    ) -> Result<CheckResponse, CheckError> {
        self.backend
            .check(
                &(account_group, AccountGroupPermission::RemoveAdmin, actor),
                consistency,
            )
            .await
    }

    async fn remove_account_group_admin(
        &mut self,
        member: AccountId,
        account_group: AccountGroupId,
    ) -> Result<Zookie<'static>, ModifyRelationError> {
        Ok(self
            .backend
            .delete_relations([(account_group, AccountGroupRelation::DirectAdmin, member)])
            .await
            .change_context(ModifyRelationError)?
            .deleted_at)
    }

    async fn can_add_group_member(
        &self,
        actor: AccountId,
        account_group: AccountGroupId,
        consistency: Consistency<'_>,
    ) -> Result<CheckResponse, CheckError> {
        self.backend
            .check(
                &(account_group, AccountGroupPermission::AddMember, actor),
                consistency,
            )
            .await
    }

    async fn add_account_group_member(
        &mut self,
        member: AccountId,
        account_group: AccountGroupId,
    ) -> Result<Zookie<'static>, ModifyRelationError> {
        Ok(self
            .backend
            .create_relations([(account_group, AccountGroupRelation::DirectMember, member)])
            .await
            .change_context(ModifyRelationError)?
            .written_at)
    }

    async fn can_remove_group_member(
        &self,
        actor: AccountId,
        account_group: AccountGroupId,
        consistency: Consistency<'_>,
    ) -> Result<CheckResponse, CheckError> {
        self.backend
            .check(
                &(account_group, AccountGroupPermission::RemoveMember, actor),
                consistency,
            )
            .await
    }

    async fn remove_account_group_member(
        &mut self,
        member: AccountId,
        account_group: AccountGroupId,
    ) -> Result<Zookie<'static>, ModifyRelationError> {
        Ok(self
            .backend
            .delete_relations([(account_group, AccountGroupRelation::DirectMember, member)])
            .await
            .change_context(ModifyRelationError)?
            .deleted_at)
    }

    async fn add_entity_owner(
        &mut self,
        scope: OwnerId,
        entity: EntityId,
    ) -> Result<Zookie<'static>, ModifyRelationError> {
        Ok(match scope {
            OwnerId::Account(account) => {
                self.backend
                    .create_relations([(entity.entity_uuid, EntityRelation::DirectOwner, account)])
                    .await
            }
            OwnerId::AccountGroup(account_group) => {
                self.backend
                    .create_relations([(
                        entity.entity_uuid,
                        EntityRelation::DirectOwner,
                        account_group,
                        AccountGroupPermission::Member,
                    )])
                    .await
            }
        }
        .change_context(ModifyRelationError)?
        .written_at)
    }

    async fn remove_entity_owner(
        &mut self,
        scope: OwnerId,
        entity: EntityId,
    ) -> Result<Zookie<'static>, ModifyRelationError> {
        Ok(match scope {
            OwnerId::Account(account) => {
                self.backend
                    .delete_relations([(entity.entity_uuid, EntityRelation::DirectOwner, account)])
                    .await
            }
            OwnerId::AccountGroup(account_group) => {
                self.backend
                    .delete_relations([(
                        entity.entity_uuid,
                        EntityRelation::DirectOwner,
                        account_group,
                        AccountGroupPermission::Member,
                    )])
                    .await
            }
        }
        .change_context(ModifyRelationError)?
        .deleted_at)
    }

    async fn add_entity_editor(
        &mut self,
        scope: OwnerId,
        entity: EntityId,
    ) -> Result<Zookie<'static>, ModifyRelationError> {
        Ok(match scope {
            OwnerId::Account(account) => {
                self.backend
                    .create_relations([(entity.entity_uuid, EntityRelation::DirectEditor, account)])
                    .await
            }
            OwnerId::AccountGroup(account_group) => {
                self.backend
                    .create_relations([(
                        entity.entity_uuid,
                        EntityRelation::DirectEditor,
                        account_group,
                        AccountGroupPermission::Member,
                    )])
                    .await
            }
        }
        .change_context(ModifyRelationError)?
        .written_at)
    }

    async fn remove_entity_editor(
        &mut self,
        scope: OwnerId,
        entity: EntityId,
    ) -> Result<Zookie<'static>, ModifyRelationError> {
        Ok(match scope {
            OwnerId::Account(account) => {
                self.backend
                    .delete_relations([(entity.entity_uuid, EntityRelation::DirectEditor, account)])
                    .await
            }
            OwnerId::AccountGroup(account_group) => {
                self.backend
                    .delete_relations([(
                        entity.entity_uuid,
                        EntityRelation::DirectEditor,
                        account_group,
                        AccountGroupPermission::Member,
                    )])
                    .await
            }
        }
        .change_context(ModifyRelationError)?
        .deleted_at)
    }

    async fn add_entity_viewer(
        &mut self,
        scope: EntitySubject,
        entity: EntityId,
    ) -> Result<Zookie<'static>, ModifyRelationError> {
        Ok(match scope {
            EntitySubject::Public => {
                self.backend
                    .create_relations([(
                        entity.entity_uuid,
                        EntityRelation::DirectViewer,
                        PublicAccess::Public,
                    )])
                    .await
            }
            EntitySubject::Account(account) => {
                self.backend
                    .create_relations([(entity.entity_uuid, EntityRelation::DirectViewer, account)])
                    .await
            }
            EntitySubject::AccountGroupMembers(account_group) => {
                self.backend
                    .create_relations([(
                        entity.entity_uuid,
                        EntityRelation::DirectViewer,
                        account_group,
                        AccountGroupPermission::Member,
                    )])
                    .await
            }
        }
        .change_context(ModifyRelationError)?
        .written_at)
    }

    async fn remove_entity_viewer(
        &mut self,
        scope: EntitySubject,
        entity: EntityId,
    ) -> Result<Zookie<'static>, ModifyRelationError> {
        Ok(match scope {
            EntitySubject::Public => {
                self.backend
                    .delete_relations([(
                        entity.entity_uuid,
                        EntityRelation::DirectViewer,
                        PublicAccess::Public,
                    )])
                    .await
            }
            EntitySubject::Account(account) => {
                self.backend
                    .delete_relations([(entity.entity_uuid, EntityRelation::DirectViewer, account)])
                    .await
            }
            EntitySubject::AccountGroupMembers(account_group) => {
                self.backend
                    .delete_relations([(
                        entity.entity_uuid,
                        EntityRelation::DirectViewer,
                        account_group,
                        AccountGroupPermission::Member,
                    )])
                    .await
            }
        }
        .change_context(ModifyRelationError)?
        .deleted_at)
    }

    async fn can_create_entity(
        &self,
        actor: AccountId,
        web: impl Into<WebId> + Send,
        consistency: Consistency<'_>,
    ) -> Result<CheckResponse, CheckError> {
        self.backend
            .check(
                &(web.into(), WebPermission::CreateEntity, actor),
                consistency,
            )
            .await
    }

    async fn can_update_entity(
        &self,
        actor: AccountId,
        entity: EntityId,
        consistency: Consistency<'_>,
    ) -> Result<CheckResponse, CheckError> {
        self.backend
            .check(
                &(entity.entity_uuid, EntityPermission::Update, actor),
                consistency,
            )
            .await
    }

    async fn can_view_entity(
        &self,
        actor: AccountId,
        entity: EntityId,
        consistency: Consistency<'_>,
    ) -> Result<CheckResponse, CheckError> {
        self.backend
            .check(
                &(entity.entity_uuid, EntityPermission::View, actor),
                consistency,
            )
            .await
    }

    async fn get_entity_relations(
        &self,
        entity: EntityId,
        consistency: Consistency<'static>,
    ) -> Result<Vec<(EntitySubject, EntityRelation)>, ReadError> {
        let accounts = self
            .backend
            .read_relations::<EntityUuid, EntityRelation, AccountOrPublic, ()>(
                Some(entity.entity_uuid),
                None,
                None,
                None,
                consistency,
            )
            .await
            .change_context(ReadError)?
            .into_iter()
            .map(|(entity_uuid, relation, account, account_relation)| {
                debug_assert_eq!(entity_uuid, entity.entity_uuid);
                assert!(account_relation.is_none());
                (EntitySubject::from(account), relation)
            });

        let account_groups = self
            .backend
            .read_relations::<EntityUuid, EntityRelation, AccountGroupId, AccountGroupPermission>(
                Some(entity.entity_uuid),
                None,
                None,
                None,
                consistency,
            )
            .await
            .change_context(ReadError)?
            .into_iter()
            .map(|(entity_uuid, relation, account_group, account_relation)| {
                debug_assert_eq!(entity_uuid, entity.entity_uuid);
                assert_eq!(account_relation, Some(AccountGroupPermission::Member));
                (EntitySubject::AccountGroupMembers(account_group), relation)
            });

        Ok(accounts.chain(account_groups).collect())
    }
}
