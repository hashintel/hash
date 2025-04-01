use core::error::Error;

use hash_graph_authorization::policies::principal::PrincipalId;

/// Errors that can occur during principal management operations.
#[derive(Debug, derive_more::Display)]
pub enum PrincipalError {
    #[display("Principal with ID {id} already exists")]
    PrincipalAlreadyExists { id: PrincipalId },
    #[display("Principal with ID {id} doesn't exist")]
    PrincipalNotFound { id: PrincipalId },

    #[display("Database error")]
    StoreError,
}

impl Error for PrincipalError {}
