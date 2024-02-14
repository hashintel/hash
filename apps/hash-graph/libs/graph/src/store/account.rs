use async_trait::async_trait;
use authorization::{schema::WebOwnerSubject, AuthorizationApi};
use error_stack::Result;
use graph_types::{
    account::{AccountGroupId, AccountId},
    owned_by_id::OwnedById,
};
use serde::{Deserialize, Serialize};

use crate::store::{InsertionError, QueryError};

fn random_account_id() -> AccountId {
    AccountId::new(uuid::Uuid::new_v4())
}

fn random_account_group_id() -> AccountGroupId {
    AccountGroupId::new(uuid::Uuid::new_v4())
}

#[derive(Debug, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct InsertAccountIdParams {
    #[serde(default = "random_account_id")]
    pub account_id: AccountId,
}

#[derive(Debug, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct InsertAccountGroupIdParams {
    #[serde(default = "random_account_group_id")]
    pub account_group_id: AccountGroupId,
}

#[derive(Debug, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct InsertWebIdParams {
    pub owned_by_id: OwnedById,
    pub owner: WebOwnerSubject,
}

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
        params: InsertAccountIdParams,
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
        params: InsertAccountGroupIdParams,
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
        params: InsertWebIdParams,
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
    ) -> Result<WebOwnerSubject, QueryError>;
}
