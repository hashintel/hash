use core::error::Error;

use type_system::web::OwnedById;

use crate::policies::principal::{ActorId, role::RoleId, team::StandaloneTeamId, web::WebTeamId};

#[derive(Debug, derive_more::Display)]
#[display("Could not create actor: {_variant}")]
pub enum ActorCreationError {
    #[display("Web with ID `{web_id}` does not exist")]
    WebNotFound { web_id: OwnedById },
    #[display("Web with ID `{web_id}` is already assigned")]
    WebOccupied { web_id: OwnedById },
    #[display("Store operation failed")]
    StoreError,
}

impl Error for ActorCreationError {}

#[derive(Debug, derive_more::Display)]
#[display("Could not create web: {_variant}")]
pub enum WebCreationError {
    #[display("Store operation failed")]
    StoreError,
}

impl Error for WebCreationError {}

#[derive(Debug, derive_more::Display)]
#[display("Could not create web role: {_variant}")]
pub enum WebRoleCreationError {
    #[display("Web with ID `{web_id}` does not exist")]
    WebNotFound { web_id: OwnedById },
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
    TeamNotFound { team_id: StandaloneTeamId },
    #[display("Store operation failed")]
    StoreError,
}

impl Error for TeamRoleCreationError {}

#[derive(Debug, derive_more::Display)]
#[display("Could not create web-team: {_variant}")]
pub enum WebTeamCreationError {
    #[display("Web with ID `{web_id}` does not exist")]
    WebNotFound { web_id: OwnedById },
    #[display("Store operation failed")]
    StoreError,
}

impl Error for WebTeamCreationError {}

#[derive(Debug, derive_more::Display)]
#[display("Could not create web-team role: {_variant}")]
pub enum WebTeamRoleCreationError {
    #[display("Web with ID `{web_id}` does not exist")]
    WebNotFound { web_id: OwnedById },
    #[display("Team with ID `{team_id}` does not exist")]
    TeamNotFound { team_id: WebTeamId },
    #[display("Store operation failed")]
    StoreError,
}

impl Error for WebTeamRoleCreationError {}

#[derive(Debug, derive_more::Display)]
#[display("Could change role assignment: {_variant}")]
pub enum RoleAssignmentError {
    #[display("Actor with ID `{actor_id}` does not exist")]
    ActorNotFound { actor_id: ActorId },
    #[display("Role with ID `{role_id}` does not exist")]
    RoleNotFound { role_id: RoleId },
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
