use error_stack::Report;

#[derive(Debug, derive_more::Display, derive_more::Error)]
pub enum IdentityProviderError {
    #[display("failed to delete identity")]
    DeletionFailed,
    #[display("failed to read the identity")]
    LookupFailed,
}

/// Abstraction over an external identity management system (e.g. Ory Kratos).
pub trait IdentityProvider: Send + Sync {
    fn delete_identity(
        &self,
        identity_id: &str,
    ) -> impl Future<Output = Result<(), Report<IdentityProviderError>>> + Send;

    /// Returns the email addresses the identity holds.
    ///
    /// The provider owns the addresses a user signs up and signs in with, so they are read from
    /// there rather than from the copy the graph carries.
    fn get_identity_emails(
        &self,
        identity_id: &str,
    ) -> impl Future<Output = Result<Vec<String>, Report<IdentityProviderError>>> + Send;
}
