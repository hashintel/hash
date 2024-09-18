use authorization::schema::WebOwnerSubject;
use error_stack::Report;
use graph_types::{
    account::{AccountGroupId, AccountId},
    owned_by_id::OwnedById,
};
use serde::Deserialize;
use thiserror::Error;

fn random_account_id() -> AccountId {
    AccountId::new(uuid::Uuid::new_v4())
}

fn random_account_group_id() -> AccountGroupId {
    AccountGroupId::new(uuid::Uuid::new_v4())
}

#[derive(Debug, Error)]
#[error("Could not insert account")]
pub struct AccountInsertionError;

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct InsertAccountIdParams {
    #[serde(default = "random_account_id")]
    pub account_id: AccountId,
}

#[derive(Debug, Error)]
#[error("Could not insert account group")]
pub struct AccountGroupInsertionError;

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct InsertAccountGroupIdParams {
    #[serde(default = "random_account_group_id")]
    pub account_group_id: AccountGroupId,
}

#[derive(Debug, Error)]
#[error("Could not insert web")]
pub struct WebInsertionError;

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct InsertWebIdParams {
    pub owned_by_id: OwnedById,
    pub owner: WebOwnerSubject,
}

#[derive(Debug, Error)]
#[error("Could not query web")]
pub struct QueryWebError;

/// Describes the API of a store implementation for accounts.
pub trait AccountStore {
    /// Inserts the specified [`AccountId`] into the database.
    ///
    /// # Errors
    ///
    /// - if insertion failed, e.g. because the [`AccountId`] already exists.
    fn insert_account_id(
        &mut self,
        actor_id: AccountId,
        params: InsertAccountIdParams,
    ) -> impl Future<Output = Result<(), Report<AccountInsertionError>>> + Send;

    /// Inserts the specified [`AccountGroupId`] into the database.
    ///
    /// # Errors
    ///
    /// - if insertion failed, e.g. because the [`AccountGroupId`] already exists.
    fn insert_account_group_id(
        &mut self,
        actor_id: AccountId,
        params: InsertAccountGroupIdParams,
    ) -> impl Future<Output = Result<(), Report<AccountGroupInsertionError>>> + Send;

    /// Inserts the specified [`OwnedById`] into the database.
    ///
    /// # Errors
    ///
    /// - if insertion failed, e.g. because the [`OwnedById`] already exists.
    fn insert_web_id(
        &mut self,
        actor_id: AccountId,
        params: InsertWebIdParams,
    ) -> impl Future<Output = Result<(), Report<WebInsertionError>>> + Send;

    /// Returns either an [`AccountId`] or an [`AccountGroupId`] for the specified [`OwnedById`].
    ///
    /// # Errors
    ///
    /// - if the [`OwnedById`] does not exist
    /// - if the [`OwnedById`] exists but is both, an [`AccountId`] and an [`AccountGroupId`]
    fn identify_owned_by_id(
        &self,
        owned_by_id: OwnedById,
    ) -> impl Future<Output = Result<WebOwnerSubject, Report<QueryWebError>>> + Send;
}
