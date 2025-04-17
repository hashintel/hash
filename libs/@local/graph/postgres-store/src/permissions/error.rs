use core::error::Error;

use hash_graph_authorization::policies::{PolicyId, action::ActionName};
use type_system::principal::{PrincipalId, actor_group::ActorGroupId, role::RoleName};

/// Errors that can occur during principal management operations.
#[derive(Debug, derive_more::Display)]
pub enum PrincipalError {
    #[display("Principal with ID {id} already exists")]
    PrincipalAlreadyExists { id: PrincipalId },
    #[display("Principal with ID {id} doesn't exist")]
    PrincipalNotFound { id: PrincipalId },
    #[display("{name} role in {actor_group_id} doesn't exist")]
    RoleNotFound {
        actor_group_id: ActorGroupId,
        name: RoleName,
    },

    #[display("Context builder error")]
    ContextBuilderError,

    #[display("Database error")]
    StoreError,
}

impl Error for PrincipalError {}

/// Errors that can occur during principal management operations.
#[derive(Debug, derive_more::Display)]
pub enum ActionError {
    #[display("Action `{id}` already exists")]
    AlreadyExists { id: ActionName },
    #[display("Action `{id}` doesn't exist")]
    NotFound { id: ActionName },
    #[display("Action `{id}` has children which must be unregistered first")]
    HasChildren { id: ActionName },
    #[display("Action `{id}` has a self-cycle")]
    HasSelfCycle { id: ActionName },

    #[display("Database error")]
    StoreError,
}

impl Error for ActionError {}

/// Errors that can occur during principal management operations.
#[derive(Debug, derive_more::Display)]
pub enum PolicyError {
    #[display("Principal with ID `{id}` doesn't exist")]
    PrincipalNotFound { id: PrincipalId },
    #[display("Action `{id}` doesn't exist")]
    ActionNotFound { id: ActionName },
    #[display("Policy with ID `{id}` already exists")]
    PolicyAlreadyExists { id: PolicyId },
    #[display("Policy with ID `{id}` doesn't exist")]
    PolicyNotFound { id: PolicyId },

    #[display("No actions specified in policy")]
    PolicyHasNoActions,

    #[display("Invalid principal constraint")]
    InvalidPrincipalConstraint,

    #[display("Database error")]
    StoreError,
}

impl Error for PolicyError {}
