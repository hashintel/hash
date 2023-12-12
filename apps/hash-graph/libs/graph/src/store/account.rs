use async_trait::async_trait;
use authorization::{schema::WebOwnerSubject, AuthorizationApi};
use error_stack::Result;
use graph_types::{
    account::{AccountGroupId, AccountId},
    provenance::OwnedById,
};

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

    /// Inserts the specified [`OwnedById`] into the database.
    ///
    /// # Errors
    ///
    /// - if insertion failed, e.g. because the [`OwnedById`] already exists.
    async fn insert_web_id<A: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut A,
        owned_by_id: OwnedById,
        owner: WebOwnerSubject,
    ) -> Result<(), InsertionError>;

    /// Returns if the [`AccountId`] exists in the database.
    ///
    /// # Errors
    ///
    /// - if querying failed
    async fn has_account(&self, account_id: AccountId) -> Result<bool, QueryError>;

    /// Returns either an [`AccountId`] or an [`AccountGroupId`] for the specified [`OwnedById`].
    ///
    /// # Errors
    ///
    /// - if the [`OwnedById`] does not exist
    /// - if the [`OwnedById`] exists but is both, an [`AccountId`] and an [`AccountGroupId`]
    async fn identify_owned_by_id(
        &self,
        owned_by_id: OwnedById,
    ) -> Result<WebOwnerSubject, QueryError>;
}
