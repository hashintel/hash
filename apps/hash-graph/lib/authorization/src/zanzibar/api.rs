use error_stack::{Report, Result};
use graph_types::{
    account::{AccountGroupId, AccountId},
    knowledge::entity::EntityId,
    provenance::OwnedById,
};

use crate::{
    backend::{CheckError, CheckResponse, ModifyRelationError, ZanzibarBackend},
    zanzibar::{Consistency, Zookie},
    AuthorizationApi, VisibilityScope,
};

#[derive(Debug, Clone)]
pub struct ZanzibarClient<B> {
    _backend: B,
}

impl<B> ZanzibarClient<B> {
    pub const fn new(backend: B) -> Self {
        Self { _backend: backend }
    }
}

impl<B> AuthorizationApi for ZanzibarClient<B>
where
    B: ZanzibarBackend + Send + Sync,
{
    async fn add_account_group_admin(
        &mut self,
        _member: AccountId,
        _group: AccountGroupId,
    ) -> Result<Zookie<'static>, ModifyRelationError> {
        Err(Report::new(ModifyRelationError).attach_printable("not implemented"))
    }

    async fn remove_account_group_admin(
        &mut self,
        _member: AccountId,
        _group: AccountGroupId,
    ) -> Result<Zookie<'static>, ModifyRelationError> {
        Err(Report::new(ModifyRelationError).attach_printable("not implemented"))
    }

    async fn can_add_group_members(
        &self,
        _actor: AccountId,
        _account_group: AccountGroupId,
        _consistency: Consistency<'_>,
    ) -> Result<CheckResponse, CheckError> {
        Ok(CheckResponse {
            has_permission: false,
            checked_at: Zookie::empty(),
        })
    }

    async fn can_remove_group_members(
        &self,
        _actor: AccountId,
        _account_group: AccountGroupId,
        _consistency: Consistency<'_>,
    ) -> Result<CheckResponse, CheckError> {
        Ok(CheckResponse {
            has_permission: false,
            checked_at: Zookie::empty(),
        })
    }

    async fn add_account_group_member(
        &mut self,
        _member: AccountId,
        _group: AccountGroupId,
    ) -> Result<Zookie<'static>, ModifyRelationError> {
        Err(Report::new(ModifyRelationError).attach_printable("not implemented"))
    }

    async fn remove_account_group_member(
        &mut self,
        _member: AccountId,
        _group: AccountGroupId,
    ) -> Result<Zookie<'static>, ModifyRelationError> {
        Err(Report::new(ModifyRelationError).attach_printable("not implemented"))
    }

    async fn add_entity_owner(
        &mut self,
        _actor: AccountId,
        _scope: VisibilityScope,
    ) -> Result<Zookie<'static>, ModifyRelationError> {
        Err(Report::new(ModifyRelationError).attach_printable("not implemented"))
    }

    async fn remove_entity_owner(
        &mut self,
        _actor: AccountId,
        _scope: VisibilityScope,
    ) -> Result<Zookie<'static>, ModifyRelationError> {
        Err(Report::new(ModifyRelationError).attach_printable("not implemented"))
    }

    async fn can_create_entity(
        &self,
        _actor: AccountId,
        _web: OwnedById,
        _consistency: Consistency<'_>,
    ) -> Result<CheckResponse, CheckError> {
        Ok(CheckResponse {
            has_permission: false,
            checked_at: Zookie::empty(),
        })
    }

    async fn can_update_entity(
        &self,
        _actor: AccountId,
        _entity: EntityId,
        _consistency: Consistency<'_>,
    ) -> Result<CheckResponse, CheckError> {
        Ok(CheckResponse {
            has_permission: false,
            checked_at: Zookie::empty(),
        })
    }

    async fn can_view_entity(
        &self,
        _actor: AccountId,
        _entity: EntityId,
        _consistency: Consistency<'_>,
    ) -> Result<CheckResponse, CheckError> {
        Ok(CheckResponse {
            has_permission: false,
            checked_at: Zookie::empty(),
        })
    }
}
