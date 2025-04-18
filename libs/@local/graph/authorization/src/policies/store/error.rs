use core::error::Error;

use type_system::principal::{
    actor::ActorId,
    actor_group::{ActorGroupId, TeamId, WebId},
    role::RoleName,
};

#[derive(Debug, derive_more::Display)]
#[display("Could not get system account: {_variant}")]
pub enum GetSystemAccountError {
    #[display("Creating system account failed")]
    CreateSystemAccountFailed,

    #[display("Store operation failed")]
    StoreError,
}

impl Error for GetSystemAccountError {}

#[derive(Debug, derive_more::Display)]
#[display("Could not create actor: {_variant}")]
pub enum ActorCreationError {
    #[display("Web with ID `{web_id}` does not exist")]
    WebNotFound { web_id: WebId },
    #[display("Web with ID `{web_id}` is already assigned")]
    WebOccupied { web_id: WebId },
    #[display("Store operation failed")]
    StoreError,
}

impl Error for ActorCreationError {}

#[derive(Debug, derive_more::Display)]
#[display("Could not create web: {_variant}")]
pub enum WebCreationError {
    #[display("Web with ID `{web_id}` already exists")]
    AlreadyExists { web_id: WebId },
    #[display("Permission to create web was denied")]
    NotAuthorized,
    #[display("Could not create web role")]
    WebRoleCreationError,
    #[display("Could not assign web role")]
    WebRoleAssignmentError,
    #[display("Store operation failed")]
    StoreError,
}

impl Error for WebCreationError {}

#[derive(Debug, derive_more::Display)]
#[display("Could not create web role: {_variant}")]
pub enum WebRoleCreationError {
    #[display("Web with ID `{web_id}` does not exist")]
    WebNotFound { web_id: WebId },
    #[display("Store operation failed")]
    StoreError,
}

impl Error for WebRoleCreationError {}

#[derive(Debug, derive_more::Display)]
#[display("Could not create team: {_variant}")]
pub enum TeamCreationError {
    #[display("Store operation failed")]
    StoreError,
}

impl Error for TeamCreationError {}

#[derive(Debug, derive_more::Display)]
#[display("Could not create team role: {_variant}")]
pub enum TeamRoleCreationError {
    #[display("Team with ID `{team_id}` does not exist")]
    TeamNotFound { team_id: TeamId },
    #[display("Store operation failed")]
    StoreError,
}

impl Error for TeamRoleCreationError {}

#[derive(Debug, derive_more::Display)]
#[display("Could change role assignment: {_variant}")]
pub enum RoleAssignmentError {
    #[display("Actor with ID `{actor_id}` does not exist")]
    ActorNotFound { actor_id: ActorId },
    #[display("{name} role for `{actor_group_id}` does not exist")]
    RoleNotFound {
        actor_group_id: ActorGroupId,
        name: RoleName,
    },
    #[display("Permission to add member to account group was denied")]
    PermissionDenied,
    #[display("Store operation failed")]
    StoreError,
}

impl Error for RoleAssignmentError {}

#[derive(Debug, derive_more::Display)]
#[display("Could not create context: {_variant}")]
pub enum ContextCreationError {
    #[display("Actor with ID `{actor_id}` does not exist")]
    ActorNotFound { actor_id: ActorId },
    #[display("Store operation failed")]
    StoreError,
}

impl Error for ContextCreationError {}

#[derive(Debug, derive_more::Display)]
#[display("Could not store policy: {_variant}")]
pub enum PolicyStoreError {
    #[display("Store operation failed")]
    StoreError,
}

impl Error for PolicyStoreError {}

#[derive(Debug, derive_more::Display)]
#[display("Could not get policies for actor: {_variant}")]
pub enum GetPoliciesError {
    #[display("Actor with ID `{actor_id}` does not exist")]
    ActorNotFound { actor_id: ActorId },
    #[display("Store operation failed")]
    StoreError,
}

impl Error for GetPoliciesError {}
