use async_trait::async_trait;
use authorization::{schema::OwnerId, AuthorizationApi, EntitySubject};
use error_stack::Result;
use graph_types::{
    account::{AccountGroupId, AccountId},
    provenance::OwnedById,
};
use serde::Serialize;

use crate::store::{InsertionError, QueryError};

/// Describes the API of a store implementation for accounts.
#[async_trait]
pub trait AccountStore {
    /// Inserts the specified [`AccountId`] into the database.
    ///
    /// # Errors
    ///
    /// - if insertion failed, e.g. because the [`AccountId`] already exists.
    async fn insert_account_id<A: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut A,
        account_id: AccountId,
    ) -> Result<(), InsertionError>;

    /// Inserts the specified [`AccountGroupId`] into the database.
    ///
    /// # Errors
    ///
    /// - if insertion failed, e.g. because the [`AccountGroupId`] already exists.
    async fn insert_account_group_id<A: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut A,
        account_group_id: AccountGroupId,
    ) -> Result<(), InsertionError>;

    /// Returns either an [`AccountId`] or an [`AccountGroupId`] for the specified [`OwnedById`].
    ///
    /// # Errors
    ///
    /// - if the [`OwnedById`] does not exist
    /// - if the [`OwnedById`] exists but is both, an [`AccountId`] and an [`AccountGroupId`]
    async fn identify_owned_by_id(
        &self,
        owned_by_id: OwnedById,
    ) -> Result<AccountOrAccountGroup, QueryError>;
}

#[derive(Debug, Copy, Clone, Serialize)]
#[serde(untagged)]
pub enum AccountOrAccountGroup {
    Account(AccountId),
    AccountGroup(AccountGroupId),
}

impl From<AccountOrAccountGroup> for EntitySubject {
    fn from(id: AccountOrAccountGroup) -> Self {
        match id {
            AccountOrAccountGroup::Account(account_id) => Self::Account(account_id),
            AccountOrAccountGroup::AccountGroup(account_group_id) => {
                Self::AccountGroupMembers(account_group_id)
            }
        }
    }
}

impl From<AccountOrAccountGroup> for OwnerId {
    fn from(id: AccountOrAccountGroup) -> Self {
        match id {
            AccountOrAccountGroup::Account(account_id) => Self::Account(account_id),
            AccountOrAccountGroup::AccountGroup(account_group_id) => {
                Self::AccountGroup(account_group_id)
            }
        }
    }
}
