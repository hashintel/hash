use error_stack::Report;
use hash_graph_authorization::{policies::store::CreateWebResponse, schema::WebOwnerSubject};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use type_system::{
    knowledge::entity::id::EntityUuid,
    principal::{
        actor::{ActorEntityUuid, Ai, AiId, Machine, MachineId, User, UserId},
        actor_group::{ActorGroupId, Team, TeamId, Web, WebId},
    },
};

#[derive(Debug, Error)]
#[error("Could not insert account")]
pub struct AccountInsertionError;

#[derive(Debug, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateUserActorParams {
    pub shortname: Option<String>,
    pub registration_complete: bool,
}

#[derive(Debug, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateUserActorResponse {
    pub user_id: UserId,
    pub machine_id: MachineId,
}

#[derive(Debug, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateMachineActorParams {
    pub identifier: String,
}

#[derive(Debug, Error)]
#[error("Could not retrieve actor")]
pub struct GetActorError;

#[derive(Debug, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateAiActorParams {
    pub identifier: String,
}

#[derive(Debug, Error)]
#[error("Could not insert account group")]
pub struct AccountGroupInsertionError;

#[derive(Debug, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateTeamParams {
    pub parent: ActorGroupId,
    pub name: String,
}

#[derive(Debug, Error)]
#[error("Could not retrieve team")]
pub struct TeamRetrievalError;

#[derive(Debug, Error)]
#[error("Could not retrieve web")]
pub struct WebRetrievalError;

#[derive(Debug, Error)]
#[error("Could not insert web")]
pub struct WebInsertionError;

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateOrgWebParams {
    pub shortname: String,
    pub administrator: Option<ActorEntityUuid>,
}

#[derive(Debug, Error)]
#[error("Could not query web")]
pub struct QueryWebError;

/// Describes the API of a store implementation for accounts.
pub trait AccountStore {
    /// Creates a user actor with the specified [`ActorEntityUuid`] in the database.
    ///
    /// # Errors
    ///
    /// - if creation failed, e.g. because the [`ActorEntityUuid`] already exists.
    fn create_user_actor(
        &mut self,
        actor_id: ActorEntityUuid,
        params: CreateUserActorParams,
    ) -> impl Future<Output = Result<CreateUserActorResponse, Report<AccountInsertionError>>> + Send;

    /// Creates a machine actor with the specified [`ActorEntityUuid`] in the database.
    ///
    /// # Errors
    ///
    /// - if creation failed, e.g. because the [`ActorEntityUuid`] already exists.
    fn create_machine_actor(
        &mut self,
        actor_id: ActorEntityUuid,
        params: CreateMachineActorParams,
    ) -> impl Future<Output = Result<MachineId, Report<AccountInsertionError>>> + Send;

    /// Returns a [`User`] actor by its [`UserId`].
    ///
    /// # Errors
    ///
    /// - [`GetActorError`] if the actor could not be retrieved.
    fn get_user_by_id(
        &self,
        actor_id: ActorEntityUuid,
        id: UserId,
    ) -> impl Future<Output = Result<Option<User>, Report<GetActorError>>> + Send;

    /// Returns a [`Machine`] actor by its [`MachineId`].
    ///
    /// # Errors
    ///
    /// - [`GetActorError`] if the actor could not be retrieved.
    fn get_machine_by_id(
        &self,
        actor_id: ActorEntityUuid,
        id: MachineId,
    ) -> impl Future<Output = Result<Option<Machine>, Report<GetActorError>>> + Send;

    /// Returns a [`Machine`] actor by its identifier.
    ///
    /// # Errors
    ///
    /// - [`GetActorError`] if the actor could not be retrieved.
    fn get_machine_by_identifier(
        &self,
        actor_id: ActorEntityUuid,
        identifier: &str,
    ) -> impl Future<Output = Result<Option<Machine>, Report<GetActorError>>> + Send;

    /// Returns a [`Ai`] actor by its [`AiId`].
    ///
    /// # Errors
    ///
    /// - [`GetActorError`] if the actor could not be retrieved.
    fn get_ai_by_id(
        &self,
        actor_id: ActorEntityUuid,
        id: AiId,
    ) -> impl Future<Output = Result<Option<Ai>, Report<GetActorError>>> + Send;

    /// Returns a [`Ai`] actor by its identifier.
    ///
    /// # Errors
    ///
    /// - [`GetActorError`] if the actor could not be retrieved.
    fn get_ai_by_identifier(
        &self,
        actor_id: ActorEntityUuid,
        identifier: &str,
    ) -> impl Future<Output = Result<Option<Ai>, Report<GetActorError>>> + Send;

    /// Creates an AI actor with the specified [`ActorEntityUuid`] in the database.
    ///
    /// # Errors
    ///
    /// - if creation failed, e.g. because the [`ActorEntityUuid`] already exists.
    fn create_ai_actor(
        &mut self,
        actor_id: ActorEntityUuid,
        params: CreateAiActorParams,
    ) -> impl Future<Output = Result<AiId, Report<AccountInsertionError>>> + Send;

    /// Retrieves the web as specified by its [`WebId`].
    ///
    /// # Errors
    ///
    /// - If reading the web failed.
    fn get_web_by_id(
        &self,
        actor_id: ActorEntityUuid,
        id: WebId,
    ) -> impl Future<Output = Result<Option<Web>, Report<WebRetrievalError>>> + Send;

    /// Retrieves the web as specified by the `shortname`.
    ///
    /// # Errors
    ///
    /// - If reading the web failed.
    fn get_web_by_shortname(
        &self,
        actor_id: ActorEntityUuid,
        shortname: &str,
    ) -> impl Future<Output = Result<Option<Web>, Report<WebRetrievalError>>> + Send;

    /// Inserts the specified [`WebId`] into the database.
    ///
    /// # Errors
    ///
    /// - if insertion failed, e.g. because the [`WebId`] already exists.
    fn create_org_web(
        &mut self,
        actor_id: ActorEntityUuid,
        params: CreateOrgWebParams,
    ) -> impl Future<Output = Result<CreateWebResponse, Report<WebInsertionError>>> + Send;

    /// Inserts the specified [`TeamId`] into the database.
    ///
    /// # Errors
    ///
    /// - if insertion failed, e.g. because the [`TeamId`] already exists.
    fn create_team(
        &mut self,
        actor_id: ActorEntityUuid,
        params: CreateTeamParams,
    ) -> impl Future<Output = Result<TeamId, Report<AccountGroupInsertionError>>> + Send;

    /// Retrieves the team as specified by the `id`.
    ///
    /// # Errors
    ///
    /// - If reading the team failed.
    fn get_team_by_id(
        &self,
        actor_id: ActorEntityUuid,
        id: TeamId,
    ) -> impl Future<Output = Result<Option<Team>, Report<TeamRetrievalError>>> + Send;

    /// Retrieves the team as specified by the `name`.
    ///
    /// # Errors
    ///
    /// - If reading the team failed.
    fn get_team_by_name(
        &self,
        actor_id: ActorEntityUuid,
        name: &str,
    ) -> impl Future<Output = Result<Option<Team>, Report<TeamRetrievalError>>> + Send;

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
