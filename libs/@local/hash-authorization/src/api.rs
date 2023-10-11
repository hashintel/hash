use std::{collections::HashMap, fmt, future::Future};

use error_stack::Result;
use graph_types::{
    account::{AccountGroupId, AccountId},
    knowledge::entity::EntityId,
    web::WebId,
};
use serde::{Deserialize, Serialize};

use crate::{
    backend::{CheckError, CheckResponse, ModifyRelationError},
    schema::{OwnerId, PublicAccess},
    zanzibar::{Consistency, Resource, Zookie},
};

// TODO: Replace with something permission specific which can directly be reused once permissions
//       are implemented.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "type", content = "id")]
pub enum VisibilityScope {
    Public,
    Account(AccountId),
    AccountGroup(AccountGroupId),
}

#[derive(Debug, Copy, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum AccountOrPublic {
    Public(PublicAccess),
    Account(AccountId),
}

impl From<AccountOrPublic> for VisibilityScope {
    fn from(account_or_public: AccountOrPublic) -> Self {
        match account_or_public {
            AccountOrPublic::Public(_) => Self::Public,
            AccountOrPublic::Account(account_id) => Self::Account(account_id),
        }
    }
}

impl fmt::Display for AccountOrPublic {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Public(access) => fmt::Display::fmt(access.id(), fmt),
            Self::Account(account_id) => fmt::Display::fmt(account_id, fmt),
        }
    }
}

impl Resource for AccountOrPublic {
    type Id = Self;

    fn namespace() -> &'static str {
        AccountId::namespace()
    }

    fn id(&self) -> Self::Id {
        *self
    }
}

pub trait AuthorizationApi {
    ////////////////////////////////////////////////////////////////////////////
    // Account group authorization
    ////////////////////////////////////////////////////////////////////////////
    fn can_add_group_owner(
        &self,
        actor: AccountId,
        account_group: AccountGroupId,
        consistency: Consistency<'_>,
    ) -> impl Future<Output = Result<CheckResponse, CheckError>> + Send;
    fn add_account_group_owner(
        &mut self,
        member: AccountId,
        account_group: AccountGroupId,
    ) -> impl Future<Output = Result<Zookie<'static>, ModifyRelationError>> + Send;

    fn can_remove_group_owner(
        &self,
        actor: AccountId,
        account_group: AccountGroupId,
        consistency: Consistency<'_>,
    ) -> impl Future<Output = Result<CheckResponse, CheckError>> + Send;
    fn remove_account_group_owner(
        &mut self,
        member: AccountId,
        account_group: AccountGroupId,
    ) -> impl Future<Output = Result<Zookie<'static>, ModifyRelationError>> + Send;

    fn can_add_group_admin(
        &self,
        actor: AccountId,
        account_group: AccountGroupId,
        consistency: Consistency<'_>,
    ) -> impl Future<Output = Result<CheckResponse, CheckError>> + Send;
    fn add_account_group_admin(
        &mut self,
        member: AccountId,
        account_group: AccountGroupId,
    ) -> impl Future<Output = Result<Zookie<'static>, ModifyRelationError>> + Send;

    fn can_remove_group_admin(
        &self,
        actor: AccountId,
        account_group: AccountGroupId,
        consistency: Consistency<'_>,
    ) -> impl Future<Output = Result<CheckResponse, CheckError>> + Send;
    fn remove_account_group_admin(
        &mut self,
        member: AccountId,
        account_group: AccountGroupId,
    ) -> impl Future<Output = Result<Zookie<'static>, ModifyRelationError>> + Send;

    fn can_add_group_member(
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

    fn can_remove_group_member(
        &self,
        actor: AccountId,
        account_group: AccountGroupId,
        consistency: Consistency<'_>,
    ) -> impl Future<Output = Result<CheckResponse, CheckError>> + Send;
    fn remove_account_group_member(
        &mut self,
        member: AccountId,
        account_group: AccountGroupId,
    ) -> impl Future<Output = Result<Zookie<'static>, ModifyRelationError>> + Send;

    ////////////////////////////////////////////////////////////////////////////
    // Web authorization
    ////////////////////////////////////////////////////////////////////////////
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

    fn add_web_editor(
        &mut self,
        editor: OwnerId,
        web: WebId,
    ) -> impl Future<Output = Result<Zookie<'static>, ModifyRelationError>> + Send;

    fn remove_web_editor(
        &mut self,
        editor: OwnerId,
        web: WebId,
    ) -> impl Future<Output = Result<Zookie<'static>, ModifyRelationError>> + Send;

    fn can_create_entity(
        &self,
        actor: AccountId,
        namespace: impl Into<WebId> + Send,
        consistency: Consistency<'_>,
    ) -> impl Future<Output = Result<CheckResponse, CheckError>> + Send;

    ////////////////////////////////////////////////////////////////////////////
    // Entity authorization
    ////////////////////////////////////////////////////////////////////////////
    fn add_entity_owner(
        &mut self,
        scope: OwnerId,
        entity: EntityId,
    ) -> impl Future<Output = Result<Zookie<'static>, ModifyRelationError>> + Send;
    fn remove_entity_owner(
        &mut self,
        scope: OwnerId,
        entity: EntityId,
    ) -> impl Future<Output = Result<Zookie<'static>, ModifyRelationError>> + Send;

    fn add_entity_editor(
        &mut self,
        scope: OwnerId,
        entity: EntityId,
    ) -> impl Future<Output = Result<Zookie<'static>, ModifyRelationError>> + Send;
    fn remove_entity_editor(
        &mut self,
        scope: OwnerId,
        entity: EntityId,
    ) -> impl Future<Output = Result<Zookie<'static>, ModifyRelationError>> + Send;

    fn add_entity_viewer(
        &mut self,
        scope: VisibilityScope,
        entity: EntityId,
    ) -> impl Future<Output = Result<Zookie<'static>, ModifyRelationError>> + Send;
    fn remove_entity_viewer(
        &mut self,
        scope: VisibilityScope,
        entity: EntityId,
    ) -> impl Future<Output = Result<Zookie<'static>, ModifyRelationError>> + Send;

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
    fn acquire_owned(&self)
    -> impl Future<Output = Result<Self::Api<'static>, Self::Error>> + Send;
}
