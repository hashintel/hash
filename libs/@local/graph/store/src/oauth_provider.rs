use error_stack::Report;

#[derive(Debug, derive_more::Display, derive_more::Error)]
pub enum OAuthProviderError {
    #[display("failed to revoke sessions for subject `{subject}`")]
    RevocationFailed { subject: String },
}

/// Abstraction over an external OAuth2 provider (e.g. Ory Hydra).
pub trait OAuthProvider: Send + Sync {
    fn revoke_consent_sessions(
        &self,
        subject: &str,
    ) -> impl Future<Output = Result<(), Report<OAuthProviderError>>> + Send;

    fn revoke_login_sessions(
        &self,
        subject: &str,
    ) -> impl Future<Output = Result<(), Report<OAuthProviderError>>> + Send;
}
