//! # HASH Graph Embeddings
//!
//! Generation of text embeddings for semantic search in the HASH Graph.
//!
//! ## Workspace dependencies
#![cfg_attr(doc, doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd"))]

pub use self::{
    error::EmbeddingError,
    openai::{OpenAiEmbeddingClient, OpenAiEmbeddingClientConfig},
};

mod error;
mod openai;

use error_stack::Report;
use hash_graph_types::Embedding;

/// Generates embedding vectors for text inputs.
///
/// Implementations call out to an embedding provider (e.g. OpenAI). The generated embeddings are
/// used for semantic similarity search against the embeddings stored for entities and entity
/// types, so an implementation must produce embeddings from the same model that generated those
/// stored embeddings.
pub trait EmbeddingGenerator {
    /// Generates an embedding for each input, returned in the same order as `inputs`.
    ///
    /// # Errors
    ///
    /// - [`EmbeddingError::Request`] if the request to the provider could not be sent.
    /// - [`EmbeddingError::Unauthorized`] if the provider rejected the configured credentials.
    /// - [`EmbeddingError::RateLimited`] if the provider rate-limited the request.
    /// - [`EmbeddingError::ProviderUnavailable`] if the provider is temporarily unavailable.
    /// - [`EmbeddingError::Response`] if the provider returned an error or an unparseable response.
    /// - [`EmbeddingError::UnexpectedCount`] if the number of returned embeddings does not match
    ///   the number of inputs.
    /// - [`EmbeddingError::UnexpectedDimensions`] if an embedding has an unexpected dimensionality.
    fn create_embeddings(
        &self,
        inputs: &[&str],
    ) -> impl Future<Output = Result<Vec<Embedding<'static>>, Report<EmbeddingError>>> + Send;
}
