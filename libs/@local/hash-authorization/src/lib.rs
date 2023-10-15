#![feature(
    associated_type_bounds,
    async_fn_in_trait,
    impl_trait_in_assoc_type,
    lint_reasons,
    never_type,
    return_position_impl_trait_in_trait
)]

pub mod backend;
pub mod schema;
pub mod zanzibar;

pub use self::api::{AccountOrPublic, AuthorizationApi, AuthorizationApiPool, EntitySubject};

mod api;

use error_stack::Result;
use graph_types::{
    account::{AccountGroupId, AccountId},
    knowledge::entity::EntityId,
    web::WebId,
};

use crate::{
    backend::{CheckError, CheckResponse, ModifyRelationError, ReadError},
    schema::{EntityRelation, OwnerId},
    zanzibar::{Consistency, Zookie},
};

#[derive(Debug, Default, Copy, Clone)]
pub struct NoAuthorization;

impl AuthorizationApi for NoAuthorization {
    async fn can_add_group_owner(
        &self,
        _actor: AccountId,
        _account_group: AccountGroupId,
        _consistency: Consistency<'_>,
    ) -> Result<CheckResponse, CheckError> {
        Ok(CheckResponse {
            has_permission: true,
            checked_at: Zookie::empty(),
        })
    }

    async fn add_account_group_owner(
        &mut self,
        _member: AccountId,
        _account_group: AccountGroupId,
    ) -> Result<Zookie<'static>, ModifyRelationError> {
        Ok(Zookie::empty())
    }

    async fn can_remove_group_owner(
        &self,
        _actor: AccountId,
        _account_group: AccountGroupId,
        _consistency: Consistency<'_>,
    ) -> Result<CheckResponse, CheckError> {
        Ok(CheckResponse {
            has_permission: true,
            checked_at: Zookie::empty(),
        })
    }

    async fn remove_account_group_owner(
        &mut self,
        _member: AccountId,
        _account_group: AccountGroupId,
    ) -> Result<Zookie<'static>, ModifyRelationError> {
        Ok(Zookie::empty())
    }

    async fn add_web_owner(
        &mut self,
        _owner: OwnerId,
        _web: WebId,
    ) -> Result<Zookie<'static>, ModifyRelationError> {
        Ok(Zookie::empty())
    }

    async fn remove_web_owner(
        &mut self,
        _owner: OwnerId,
        _web: WebId,
    ) -> Result<Zookie<'static>, ModifyRelationError> {
        Ok(Zookie::empty())
    }

    async fn add_web_editor(
        &mut self,
        _editor: OwnerId,
        _web: WebId,
    ) -> Result<Zookie<'static>, ModifyRelationError> {
        Ok(Zookie::empty())
    }

    async fn remove_web_editor(
        &mut self,
        _editor: OwnerId,
        _web: WebId,
    ) -> Result<Zookie<'static>, ModifyRelationError> {
        Ok(Zookie::empty())
    }

    async fn can_add_group_admin(
        &self,
        _actor: AccountId,
        _account_group: AccountGroupId,
        _consistency: Consistency<'_>,
    ) -> Result<CheckResponse, CheckError> {
        Ok(CheckResponse {
            has_permission: true,
            checked_at: Zookie::empty(),
        })
    }

    async fn add_account_group_admin(
        &mut self,
        _member: AccountId,
        _group: AccountGroupId,
    ) -> Result<Zookie<'static>, ModifyRelationError> {
        Ok(Zookie::empty())
    }

    async fn can_remove_group_admin(
        &self,
        _actor: AccountId,
        _account_group: AccountGroupId,
        _consistency: Consistency<'_>,
    ) -> Result<CheckResponse, CheckError> {
        Ok(CheckResponse {
            has_permission: true,
            checked_at: Zookie::empty(),
        })
    }

    async fn remove_account_group_admin(
        &mut self,
        _member: AccountId,
        _group: AccountGroupId,
    ) -> Result<Zookie<'static>, ModifyRelationError> {
        Ok(Zookie::empty())
    }

    async fn can_add_group_member(
        &self,
        _actor: AccountId,
        _account_group: AccountGroupId,
        _consistency: Consistency<'_>,
    ) -> Result<CheckResponse, CheckError> {
        Ok(CheckResponse {
            has_permission: true,
            checked_at: Zookie::empty(),
        })
    }

    async fn add_account_group_member(
        &mut self,
        _member: AccountId,
        _group: AccountGroupId,
    ) -> Result<Zookie<'static>, ModifyRelationError> {
        Ok(Zookie::empty())
    }

    async fn can_remove_group_member(
        &self,
        _actor: AccountId,
        _account_group: AccountGroupId,
        _consistency: Consistency<'_>,
    ) -> Result<CheckResponse, CheckError> {
        Ok(CheckResponse {
            has_permission: true,
            checked_at: Zookie::empty(),
        })
    }

    async fn remove_account_group_member(
        &mut self,
        _member: AccountId,
        _group: AccountGroupId,
    ) -> Result<Zookie<'static>, ModifyRelationError> {
        Ok(Zookie::empty())
    }

    async fn add_entity_owner(
        &mut self,
        _scope: OwnerId,
        _entity: EntityId,
    ) -> Result<Zookie<'static>, ModifyRelationError> {
        Ok(Zookie::empty())
    }

    async fn remove_entity_owner(
        &mut self,
        _scope: OwnerId,
        _entity: EntityId,
    ) -> Result<Zookie<'static>, ModifyRelationError> {
        Ok(Zookie::empty())
    }

    async fn add_entity_editor(
        &mut self,
        _scope: OwnerId,
        _entity: EntityId,
    ) -> Result<Zookie<'static>, ModifyRelationError> {
        Ok(Zookie::empty())
    }

    async fn remove_entity_editor(
        &mut self,
        _scope: OwnerId,
        _entity: EntityId,
    ) -> Result<Zookie<'static>, ModifyRelationError> {
        Ok(Zookie::empty())
    }

    async fn add_entity_viewer(
        &mut self,
        _scope: EntitySubject,
        _entity: EntityId,
    ) -> Result<Zookie<'static>, ModifyRelationError> {
        Ok(Zookie::empty())
    }

    async fn remove_entity_viewer(
        &mut self,
        _scope: EntitySubject,
        _entity: EntityId,
    ) -> Result<Zookie<'static>, ModifyRelationError> {
        Ok(Zookie::empty())
    }

    async fn can_create_entity(
        &self,
        _actor: AccountId,
        _web: impl Into<WebId> + Send,
        _consistency: Consistency<'_>,
    ) -> Result<CheckResponse, CheckError> {
        Ok(CheckResponse {
            has_permission: true,
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
            has_permission: true,
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
            has_permission: true,
            checked_at: Zookie::empty(),
        })
    }

    async fn get_entity_relations(
        &self,
        _entity: EntityId,
        _consistency: Consistency<'static>,
    ) -> Result<Vec<(EntitySubject, EntityRelation)>, ReadError> {
        Ok(Vec::new())
    }
}

impl<A> AuthorizationApiPool for A
where
    A: AuthorizationApi + Clone + Send + Sync,
{
    type Api<'pool> = Self;
    type Error = std::convert::Infallible;

    async fn acquire(&self) -> Result<Self::Api<'_>, Self::Error> {
        Ok(self.clone())
    }

    async fn acquire_owned(&self) -> Result<Self::Api<'static>, Self::Error> {
        Ok(self.clone())
    }
}
