use derive_more::{Display, Error};

/// An error that can occur while generating embeddings.
#[derive(Debug, Display, Error)]
pub enum EmbeddingError {
    /// The request to the embedding provider could not be sent.
    #[display("Could not send the embedding request to the provider")]
    Request,
    /// The provider rejected the configured credentials (HTTP 401/403).
    #[display("The embedding provider rejected the configured API key")]
    Unauthorized,
    /// The provider rate-limited the request (HTTP 429).
    #[display("The embedding provider rate-limited the request")]
    RateLimited,
    /// The provider is temporarily unavailable (HTTP 5xx).
    #[display("The embedding provider is temporarily unavailable")]
    ProviderUnavailable,
    /// The provider responded with an unexpected error status or an unparseable body.
    #[display("The embedding provider returned an error response")]
    Response,
    /// The provider returned a different number of embeddings than the number of inputs.
    #[display("The embedding provider returned an unexpected number of embeddings")]
    UnexpectedCount,
    /// An embedding did not have the expected dimensionality.
    #[display("The embedding provider returned an embedding with an unexpected dimensionality")]
    UnexpectedDimensions,
}
