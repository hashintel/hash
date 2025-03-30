use core::error::Error;

use hash_graph_authorization::policies::principal::{
    ActorId, PrincipalId, role::RoleId, team::TeamId,
};

/// Errors that can occur during principal management operations.
#[derive(Debug, derive_more::Display)]
pub enum PrincipalError {
    #[display("Principal with ID {id} already exists")]
    PrincipalAlreadyExists { id: PrincipalId },
    #[display("Principal with ID {id} doesn't exist")]
    PrincipalNotFound { id: PrincipalId },

    #[display("Team with ID {id} has children and cannot be deleted")]
    TeamHasChildren { id: TeamId },

    #[display("Role with ID {role_id} is already assigned to actor with ID {actor_id}")]
    RoleAlreadyAssigned { actor_id: ActorId, role_id: RoleId },
    #[display("Role with ID {role_id} is not assigned to actor with ID {actor_id}")]
    RoleNotAssigned { actor_id: ActorId, role_id: RoleId },

    #[display("Database error")]
    StoreError,
}

impl Error for PrincipalError {}
