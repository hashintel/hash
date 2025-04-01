use error_stack::Report;
use hash_graph_authorization::schema::WebOwnerSubject;
use serde::{Deserialize, Serialize};
use thiserror::Error;
use type_system::{
    knowledge::entity::id::EntityUuid,
    provenance::{ActorEntityUuid, ActorType},
    web::{ActorGroupId, OwnedById},
};

fn random_account_id() -> ActorEntityUuid {
    ActorEntityUuid::new(EntityUuid::new(uuid::Uuid::new_v4()))
}

fn random_account_group_id() -> ActorGroupId {
    ActorGroupId::new(uuid::Uuid::new_v4())
}

#[derive(Debug, Error)]
#[error("Could not insert account")]
pub struct AccountInsertionError;

#[derive(Debug, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct InsertAccountIdParams {
    #[serde(default = "random_account_id")]
    pub account_id: ActorEntityUuid,
    pub actor_type: ActorType,
}

#[derive(Debug, Error)]
#[error("Could not insert account group")]
pub struct AccountGroupInsertionError;

#[derive(Debug, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct InsertAccountGroupIdParams {
    #[serde(default = "random_account_group_id")]
    pub account_group_id: ActorGroupId,
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
    /// Inserts the specified [`ActorEntityUuid`] into the database.
    ///
    /// # Errors
    ///
    /// - if insertion failed, e.g. because the [`ActorEntityUuid`] already exists.
    fn insert_account_id(
        &mut self,
        actor_id: ActorEntityUuid,
        params: InsertAccountIdParams,
    ) -> impl Future<Output = Result<(), Report<AccountInsertionError>>> + Send;

    /// Inserts the specified [`ActorGroupId`] into the database.
    ///
    /// # Errors
    ///
    /// - if insertion failed, e.g. because the [`ActorGroupId`] already exists.
    fn insert_account_group_id(
        &mut self,
        actor_id: ActorEntityUuid,
        params: InsertAccountGroupIdParams,
    ) -> impl Future<Output = Result<(), Report<AccountGroupInsertionError>>> + Send;

    /// Inserts the specified [`OwnedById`] into the database.
    ///
    /// # Errors
    ///
    /// - if insertion failed, e.g. because the [`OwnedById`] already exists.
    fn insert_web_id(
        &mut self,
        actor_id: ActorEntityUuid,
        params: InsertWebIdParams,
    ) -> impl Future<Output = Result<(), Report<WebInsertionError>>> + Send;

    /// Returns either an [`ActorEntityUuid`] or an [`ActorGroupId`] for the specified
    /// [`OwnedById`].
    ///
    /// # Errors
    ///
    /// - if the [`OwnedById`] does not exist
    /// - if the [`OwnedById`] exists but is both, an [`ActorEntityUuid`] and an [`ActorGroupId`]
    fn identify_owned_by_id(
        &self,
        owned_by_id: OwnedById,
    ) -> impl Future<Output = Result<WebOwnerSubject, Report<QueryWebError>>> + Send;
}
