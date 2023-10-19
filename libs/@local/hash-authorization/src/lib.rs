#![feature(
    associated_type_bounds,
    impl_trait_in_assoc_type,
    lint_reasons,
    never_type
)]

pub mod backend;
pub mod schema;
pub mod zanzibar;

pub use self::api::{AuthorizationApi, AuthorizationApiPool};
use crate::schema::EntityRelationAndSubject;

mod api;

use error_stack::Result;
use graph_types::{
    account::{AccountGroupId, AccountId},
    knowledge::entity::EntityId,
    web::WebId,
};

use crate::{
    backend::{
        CheckError, CheckResponse, ModifyRelationError, ModifyRelationshipOperation, ReadError,
    },
    schema::{AccountGroupPermission, EntityPermission, OwnerId, WebPermission},
    zanzibar::{Consistency, Zookie},
};

#[derive(Debug, Default, Copy, Clone)]
pub struct NoAuthorization;

impl AuthorizationApi for NoAuthorization {
    async fn check_account_group_permission(
        &self,
        _actor: AccountId,
        _permission: AccountGroupPermission,
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

    async fn remove_account_group_owner(
        &mut self,
        _member: AccountId,
        _account_group: AccountGroupId,
    ) -> Result<Zookie<'static>, ModifyRelationError> {
        Ok(Zookie::empty())
    }

    async fn add_account_group_admin(
        &mut self,
        _member: AccountId,
        _group: AccountGroupId,
    ) -> Result<Zookie<'static>, ModifyRelationError> {
        Ok(Zookie::empty())
    }

    async fn remove_account_group_admin(
        &mut self,
        _member: AccountId,
        _group: AccountGroupId,
    ) -> Result<Zookie<'static>, ModifyRelationError> {
        Ok(Zookie::empty())
    }

    async fn add_account_group_member(
        &mut self,
        _member: AccountId,
        _group: AccountGroupId,
    ) -> Result<Zookie<'static>, ModifyRelationError> {
        Ok(Zookie::empty())
    }

    async fn remove_account_group_member(
        &mut self,
        _member: AccountId,
        _group: AccountGroupId,
    ) -> Result<Zookie<'static>, ModifyRelationError> {
        Ok(Zookie::empty())
    }

    async fn check_web_permission(
        &self,
        _actor: AccountId,
        _permission: WebPermission,
        _web: WebId,
        _consistency: Consistency<'_>,
    ) -> Result<CheckResponse, CheckError> {
        Ok(CheckResponse {
            has_permission: true,
            checked_at: Zookie::empty(),
        })
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

    async fn check_entity_permission(
        &self,
        _actor: AccountId,
        _permission: EntityPermission,
        _entity: EntityId,
        _consistency: Consistency<'_>,
    ) -> Result<CheckResponse, CheckError> {
        Ok(CheckResponse {
            has_permission: true,
            checked_at: Zookie::empty(),
        })
    }

    async fn modify_entity_relations(
        &mut self,
        _relationships: impl IntoIterator<
            Item = (
                ModifyRelationshipOperation,
                EntityId,
                EntityRelationAndSubject,
            ),
            IntoIter: Send,
        > + Send,
    ) -> Result<Zookie<'static>, ModifyRelationError> {
        Ok(Zookie::empty())
    }

    async fn get_entity_relations(
        &self,
        _entity: EntityId,
        _consistency: Consistency<'static>,
    ) -> Result<Vec<EntityRelationAndSubject>, ReadError> {
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
