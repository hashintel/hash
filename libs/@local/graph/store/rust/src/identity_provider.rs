use error_stack::Report;

#[derive(Debug, derive_more::Display, derive_more::Error)]
pub enum IdentityProviderError {
    /// The identity could not be deleted from the provider.
    #[display("failed to delete identity")]
    DeletionFailed,
    /// The identity could not be read from the provider.
    #[display("failed to read the identity")]
    LookupFailed,
}

/// The observable outcome of an identity deletion.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum IdentityDeletion {
    /// The provider held the identity and deleted it.
    Deleted,
    /// The provider held no such identity.
    AlreadyAbsent,
}

/// Abstraction over an external identity management system (e.g. Ory Kratos).
pub trait IdentityProvider: Send + Sync {
    /// Deletes the identity from the provider, reporting whether the provider held it.
    ///
    /// # Errors
    ///
    /// - [`DeletionFailed`] if the provider fails the deletion
    ///
    /// [`DeletionFailed`]: IdentityProviderError::DeletionFailed
    fn delete_identity(
        &self,
        identity_id: &str,
    ) -> impl Future<Output = Result<IdentityDeletion, Report<IdentityProviderError>>> + Send;

    /// Returns the email addresses the identity holds, or [`None`] where the provider holds no
    /// such identity.
    ///
    /// The provider owns the addresses a user signs up and signs in with. An absent identity is
    /// distinct from one without addresses: the first leaves the addresses unknown.
    ///
    /// # Errors
    ///
    /// - [`LookupFailed`] if the identity cannot be read from the provider
    ///
    /// [`LookupFailed`]: IdentityProviderError::LookupFailed
    fn get_identity_emails(
        &self,
        identity_id: &str,
    ) -> impl Future<Output = Result<Option<Vec<String>>, Report<IdentityProviderError>>> + Send;
}
