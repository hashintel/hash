use alloc::sync::Arc;

use error_stack::{Report, ResultExt as _};
use hash_graph_store::identity_provider::{IdentityProvider, IdentityProviderError};
use reqwest::{Client, Url};

/// Ory Kratos implementation of [`IdentityProvider`].
pub(crate) struct KratosIdentityProvider {
    client: Arc<Client>,
    admin_url: Url,
}

impl KratosIdentityProvider {
    #[must_use]
    pub(crate) const fn new(client: Arc<Client>, admin_url: Url) -> Self {
        Self { client, admin_url }
    }
}

impl IdentityProvider for KratosIdentityProvider {
    #[tracing::instrument(level = "debug", skip(self), fields(kratos_url = %self.admin_url))]
    async fn delete_identity(
        &self,
        identity_id: &str,
    ) -> Result<(), Report<IdentityProviderError>> {
        let mut url = self.admin_url.clone();
        url.path_segments_mut()
            .expect("admin URL is not a cannot-be-a-base URL")
            .extend(["admin", "identities", identity_id]);

        let response = self
            .client
            .delete(url)
            .send()
            .await
            .change_context(IdentityProviderError::DeletionFailed)?;

        if response.status() == reqwest::StatusCode::NOT_FOUND {
            return Err(Report::new(IdentityProviderError::NotFound {
                identity_id: identity_id.to_owned(),
            }));
        }

        response
            .error_for_status()
            .change_context(IdentityProviderError::DeletionFailed)?;

        Ok(())
    }
}
