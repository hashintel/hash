use core::error::Error;

use type_system::{provenance::ActorId, web::OwnedById};

use crate::policies::principal::{role::RoleId, team::SubteamId};

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
    #[display("Web with ID `{web_id}` already exists")]
    AlreadyExists { web_id: OwnedById },
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
pub enum SubteamCreationError {
    #[display("Store operation failed")]
    StoreError,
}

impl Error for SubteamCreationError {}

#[derive(Debug, derive_more::Display)]
#[display("Could not create team role: {_variant}")]
pub enum SubteamRoleCreationError {
    #[display("Subteam with ID `{subteam_id}` does not exist")]
    SubteamNotFound { subteam_id: SubteamId },
    #[display("Store operation failed")]
    StoreError,
}

impl Error for SubteamRoleCreationError {}

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
