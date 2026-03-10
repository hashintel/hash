use alloc::sync::Arc;

use error_stack::{Report, ResultExt as _};
use hash_graph_store::oauth_provider::{OAuthProvider, OAuthProviderError};
use reqwest::{Client, Url};

/// Ory Hydra implementation of [`OAuthProvider`].
pub(crate) struct HydraOAuthProvider {
    client: Arc<Client>,
    admin_url: Url,
}

impl HydraOAuthProvider {
    #[must_use]
    pub(crate) const fn new(client: Arc<Client>, admin_url: Url) -> Self {
        Self { client, admin_url }
    }
}

impl HydraOAuthProvider {
    async fn revoke_sessions(
        &self,
        subject: &str,
        kind: &str,
    ) -> Result<(), Report<OAuthProviderError>> {
        let mut url = self.admin_url.clone();
        url.path_segments_mut()
            .expect("admin URL is not a cannot-be-a-base URL")
            .extend(["admin", "oauth2", "auth", "sessions", kind]);
        url.query_pairs_mut().append_pair("subject", subject);

        self.client
            .delete(url)
            .send()
            .await
            .change_context(OAuthProviderError::RevocationFailed {
                subject: subject.to_owned(),
            })?
            .error_for_status()
            .change_context(OAuthProviderError::RevocationFailed {
                subject: subject.to_owned(),
            })?;

        Ok(())
    }
}

impl OAuthProvider for HydraOAuthProvider {
    #[tracing::instrument(level = "debug", skip(self), fields(hydra_url = %self.admin_url))]
    async fn revoke_consent_sessions(
        &self,
        subject: &str,
    ) -> Result<(), Report<OAuthProviderError>> {
        self.revoke_sessions(subject, "consent").await
    }

    #[tracing::instrument(level = "debug", skip(self), fields(hydra_url = %self.admin_url))]
    async fn revoke_login_sessions(&self, subject: &str) -> Result<(), Report<OAuthProviderError>> {
        self.revoke_sessions(subject, "login").await
    }
}
