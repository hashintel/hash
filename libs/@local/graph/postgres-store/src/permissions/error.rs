use core::error::Error;

use hash_graph_authorization::policies::principal::{
    machine::MachineId,
    team::{StandaloneTeamId, SubteamId},
    user::UserId,
};
use type_system::web::OwnedById;
use uuid::Uuid;

/// Errors that can occur during principal management operations.
#[derive(Debug, derive_more::Display)]
pub enum PrincipalError {
    #[display("Principal with ID {id} already exists")]
    PrincipalAlreadyExists { id: Uuid },

    #[display("User with ID {id} not found")]
    UserNotFound { id: UserId },
    #[display("Machine with ID {id} not found")]
    MachineNotFound { id: MachineId },

    #[display("Web with ID {id} not found")]
    WebNotFound { id: OwnedById },
    #[display("Standalone team with ID {id} not found")]
    StandaloneTeamNotFound { id: StandaloneTeamId },
    #[display("Subteam with ID {id} not found")]
    SubteamNotFound { id: SubteamId },

    /// The subteam doesn't have any parents left, which is not allowed.
    #[display("Subteam with ID {id} cannot have all parents removed")]
    SubteamRequiresParent { id: SubteamId },

    #[display("Database error")]
    StoreError,
}

impl Error for PrincipalError {}
