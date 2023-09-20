use std::{collections::HashMap, future::Future};

use error_stack::Result;
use graph_types::{
    account::{AccountGroupId, AccountId},
    knowledge::entity::EntityId,
    web::WebId,
};

use crate::{
    backend::{CheckError, CheckResponse, ModifyRelationError},
    schema::OwnerId,
    zanzibar::{Consistency, Zookie},
};

// TODO: Replace with something permission specific which can directly be reused once permissions
//       are implemented.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum VisibilityScope {
    Public,
    Account(AccountId),
    AccountGroup(AccountGroupId),
}

pub trait AuthorizationApi {
    fn add_account_group_admin(
        &mut self,
        member: AccountId,
        account_group: AccountGroupId,
    ) -> impl Future<Output = Result<Zookie<'static>, ModifyRelationError>> + Send;

    fn remove_account_group_admin(
        &mut self,
        member: AccountId,
        account_group: AccountGroupId,
    ) -> impl Future<Output = Result<Zookie<'static>, ModifyRelationError>> + Send;

    fn add_web_owner(
        &mut self,
        owner: OwnerId,
        web: WebId,
    ) -> impl Future<Output = Result<Zookie<'static>, ModifyRelationError>> + Send;

    fn remove_web_owner(
        &mut self,
        owner: OwnerId,
        web: WebId,
    ) -> impl Future<Output = Result<Zookie<'static>, ModifyRelationError>> + Send;

    fn can_add_group_members(
        &self,
        actor: AccountId,
        account_group: AccountGroupId,
        consistency: Consistency<'_>,
    ) -> impl Future<Output = Result<CheckResponse, CheckError>> + Send;

    fn can_remove_group_members(
        &self,
        actor: AccountId,
        account_group: AccountGroupId,
        consistency: Consistency<'_>,
    ) -> impl Future<Output = Result<CheckResponse, CheckError>> + Send;

    fn add_account_group_member(
        &mut self,
        member: AccountId,
        account_group: AccountGroupId,
    ) -> impl Future<Output = Result<Zookie<'static>, ModifyRelationError>> + Send;

    fn remove_account_group_member(
        &mut self,
        member: AccountId,
        account_group: AccountGroupId,
    ) -> impl Future<Output = Result<Zookie<'static>, ModifyRelationError>> + Send;

    fn add_entity_owner(
        &mut self,
        scope: VisibilityScope,
        entity: EntityId,
    ) -> impl Future<Output = Result<Zookie<'static>, ModifyRelationError>> + Send;

    fn remove_entity_owner(
        &mut self,
        scope: VisibilityScope,
        entity: EntityId,
    ) -> impl Future<Output = Result<Zookie<'static>, ModifyRelationError>> + Send;

    fn can_create_entity(
        &self,
        actor: AccountId,
        web: impl Into<WebId> + Send,
        consistency: Consistency<'_>,
    ) -> impl Future<Output = Result<CheckResponse, CheckError>> + Send;

    fn can_update_entity(
        &self,
        actor: AccountId,
        entity: EntityId,
        consistency: Consistency<'_>,
    ) -> impl Future<Output = Result<CheckResponse, CheckError>> + Send;

    fn can_view_entity(
        &self,
        actor: AccountId,
        entity: EntityId,
        consistency: Consistency<'_>,
    ) -> impl Future<Output = Result<CheckResponse, CheckError>> + Send;

    fn can_view_entities(
        &self,
        actor: AccountId,
        entities: impl IntoIterator<Item = EntityId, IntoIter: Send> + Send,
        consistency: Consistency<'_>,
    ) -> impl Future<Output = Result<(HashMap<EntityId, bool>, Zookie<'static>), CheckError>> + Send
    where
        Self: Sync,
    {
        async move {
            let mut zookie = Zookie::empty();
            let mut result = HashMap::new();
            for entity_id in entities {
                let CheckResponse {
                    has_permission,
                    checked_at,
                } = self.can_view_entity(actor, entity_id, consistency).await?;
                result.insert(entity_id, has_permission);
                zookie = checked_at;
            }
            Ok((result, zookie))
        }
    }
}

/// Managed pool to keep track about [`AuthorizationApi`]s.
pub trait AuthorizationApiPool {
    /// The error returned when acquiring an [`AuthorizationApi`].
    type Error;

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
    async fn acquire_owned(&self) -> Result<Self::Api<'static>, Self::Error>;
}
