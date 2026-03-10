use error_stack::Report;

#[derive(Debug, derive_more::Display, derive_more::Error)]
pub enum IdentityProviderError {
    #[display("identity `{identity_id}` not found")]
    NotFound { identity_id: String },
    #[display("failed to delete identity")]
    DeletionFailed,
}

/// Abstraction over an external identity management system (e.g. Ory Kratos).
pub trait IdentityProvider: Send + Sync {
    fn delete_identity(
        &self,
        identity_id: &str,
    ) -> impl Future<Output = Result<(), Report<IdentityProviderError>>> + Send;
}
