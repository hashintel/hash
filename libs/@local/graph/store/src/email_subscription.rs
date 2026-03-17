use error_stack::Report;

#[derive(Debug, derive_more::Display, derive_more::Error)]
pub enum EmailSubscriptionError {
    #[display("failed to delete subscriber `{email}`")]
    DeletionFailed { email: String },
}

/// Abstraction over an external email subscription service (e.g. Mailchimp).
pub trait EmailSubscriptionProvider: Send + Sync {
    /// Permanently deletes a subscriber by email address.
    ///
    /// Implementations should be idempotent — deleting a non-existent subscriber is not an error.
    fn delete_subscriber(
        &self,
        email: &str,
    ) -> impl Future<Output = Result<(), Report<EmailSubscriptionError>>> + Send;
}
