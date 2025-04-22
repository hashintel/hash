use error_stack::Report;
use hash_graph_authorization::schema::WebOwnerSubject;
use serde::{Deserialize, Serialize};
use thiserror::Error;
use type_system::{
    knowledge::entity::id::EntityUuid,
    principal::{
        actor::{ActorEntityUuid, ActorType},
        actor_group::{ActorGroupEntityUuid, WebId},
    },
};

fn random_account_id() -> ActorEntityUuid {
    ActorEntityUuid::new(uuid::Uuid::new_v4())
}

fn random_account_group_entity_uuid() -> ActorGroupEntityUuid {
    ActorGroupEntityUuid::new(uuid::Uuid::new_v4())
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
    pub account_type: ActorType,
}

#[derive(Debug, Error)]
#[error("Could not insert account group")]
pub struct AccountGroupInsertionError;

fn random_web_id() -> WebId {
    WebId::new(uuid::Uuid::new_v4())
}

#[derive(Debug, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct InsertAccountGroupIdParams {
    #[serde(default = "random_account_group_entity_uuid")]
    pub account_group_id: ActorGroupEntityUuid,
}

#[derive(Debug, Error)]
#[error("Could not insert web")]
pub struct WebInsertionError;

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct InsertWebIdParams {
    #[serde(default = "random_web_id")]
    pub web_id: WebId,
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

    /// Inserts the specified [`ActorGroupEntityUuid`] into the database.
    ///
    /// # Errors
    ///
    /// - if insertion failed, e.g. because the [`ActorGroupEntityUuid`] already exists.
    fn insert_account_group_id(
        &mut self,
        actor_id: ActorEntityUuid,
        params: InsertAccountGroupIdParams,
    ) -> impl Future<Output = Result<(), Report<AccountGroupInsertionError>>> + Send;

    /// Inserts the specified [`WebId`] into the database.
    ///
    /// # Errors
    ///
    /// - if insertion failed, e.g. because the [`WebId`] already exists.
    fn insert_web_id(
        &mut self,
        actor_id: ActorEntityUuid,
        params: InsertWebIdParams,
    ) -> impl Future<Output = Result<(), Report<WebInsertionError>>> + Send;

    /// Returns either an [`Account`] or an [`AccountGroup`] for the specified
    /// [`WebId`].
    ///
    /// [`Account`]: WebOwnerSubject::Account
    /// [`AccountGroup`]: WebOwnerSubject::AccountGroup
    ///
    /// # Errors
    ///
    /// - if the [`WebId`] does not exist
    fn identify_subject_id(
        &self,
        subject_id: EntityUuid,
    ) -> impl Future<Output = Result<WebOwnerSubject, Report<QueryWebError>>> + Send;
}
