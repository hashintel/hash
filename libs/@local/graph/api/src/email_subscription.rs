use alloc::sync::Arc;

use error_stack::{Report, ResultExt as _};
use hash_graph_store::email_subscription::{EmailSubscriptionError, EmailSubscriptionProvider};
use reqwest::Client;

/// Mailchimp implementation of [`EmailSubscriptionProvider`].
///
/// Uses the Mailchimp Marketing API to permanently delete subscribers.
/// The subscriber is identified by `MD5(lowercase(email))`.
pub(crate) struct MailchimpSubscriptionProvider {
    client: Arc<Client>,
    api_key: String,
    list_id: String,
    server: String,
}

impl MailchimpSubscriptionProvider {
    /// Creates a new provider.
    ///
    /// The `server` prefix is typically the suffix of the API key (e.g. `us15`).
    #[must_use]
    pub(crate) const fn new(
        client: Arc<Client>,
        api_key: String,
        list_id: String,
        server: String,
    ) -> Self {
        Self {
            client,
            api_key,
            list_id,
            server,
        }
    }
}

impl EmailSubscriptionProvider for MailchimpSubscriptionProvider {
    #[tracing::instrument(level = "debug", skip(self))]
    async fn delete_subscriber(&self, email: &str) -> Result<(), Report<EmailSubscriptionError>> {
        let subscriber_hash = format!("{:x}", md5::compute(email.to_lowercase().as_bytes()));
        let url = format!(
            "https://{server}.api.mailchimp.com/3.0/lists/{list_id}/members/{subscriber_hash}/actions/delete-permanent",
            server = self.server,
            list_id = self.list_id,
        );

        let response = self
            .client
            .post(&url)
            .basic_auth("hash-graph", Some(&self.api_key))
            .send()
            .await
            .change_context(EmailSubscriptionError::DeletionFailed {
                email: email.to_owned(),
            })?;

        // 404 means the subscriber doesn't exist — that's fine for idempotency
        if response.status() == reqwest::StatusCode::NOT_FOUND {
            return Ok(());
        }

        response
            .error_for_status()
            .change_context(EmailSubscriptionError::DeletionFailed {
                email: email.to_owned(),
            })?;

        Ok(())
    }
}
