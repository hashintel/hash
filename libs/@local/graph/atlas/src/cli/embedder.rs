//! The embedding provider the operator commands construct.
//!
//! The fit and dump commands each dial the same external embedding provider before touching the
//! store, and the provider they record must be the provider their requests hit. [`EmbedderArgs`]
//! is the credential flag those commands carry, declared once so every host spells it the same
//! way. [`openai`] builds the client over one endpoint constant and fingerprints the contract
//! from that same constant. A preflight request proves the credentials, so a refused key fails
//! the command before anything expensive happens.

use core::{error::Error, fmt};

use clap::Args;
use error_stack::Report;
use hash_graph_embeddings::{EmbeddingError, OpenAiEmbeddingClient, OpenAiEmbeddingClientConfig};

use crate::{
    integrity::SecretString,
    salt::embedding::external::{
        EmbeddingContract, ExternalEmbeddingError, ExternalEmbeddingProvider, RequestLimits,
    },
};

/// The embedding endpoint the operator commands dial.
///
/// One constant feeds both the client's base URL and the fingerprinted contract, so the recorded
/// contract names the endpoint the requests actually hit.
const EMBEDDING_ENDPOINT: &str = "https://api.openai.com/v1";

/// The embedding provider's credential, the flag every provider-dialing command carries.
#[derive(Debug, Args)]
pub struct EmbedderArgs {
    /// The OpenAI API key the embedding provider authenticates with.
    #[arg(long, env = "OPENAI_API_KEY", hide_env_values = true)]
    openai_api_key: SecretString,
}

impl EmbedderArgs {
    /// Wraps a key a host resolved outside this flag, exactly as the flag would carry it.
    pub(crate) const fn new(openai_api_key: SecretString) -> Self {
        Self { openai_api_key }
    }

    /// Takes the key out for the provider constructor.
    pub(crate) fn into_key(self) -> SecretString {
        self.openai_api_key
    }
}

/// A failure to produce a working embedding provider, by step.
#[derive(Debug)]
pub enum EmbedderError {
    /// Constructing the embedding provider failed.
    Construct(Report<EmbeddingError>),
    /// The embedding provider failed its preflight request.
    Preflight(ExternalEmbeddingError),
}

impl fmt::Display for EmbedderError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Construct(_) => fmt.write_str("the embedding provider could not be constructed"),
            Self::Preflight(_) => {
                fmt.write_str("the embedding provider failed its preflight request")
            }
        }
    }
}

impl Error for EmbedderError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Construct(report) => Some(report.current_context()),
            Self::Preflight(error) => Some(error),
        }
    }
}

/// Constructs and preflights the OpenAI embedding provider, reporting to `progress`.
///
/// The returned provider has already answered one request through the same generator, contract,
/// and canonical validation the workload will use. A command holding one can spend on reading the
/// store knowing that the credentials and the endpoint answer and that the model's vectors are
/// the canonical width.
///
/// # Errors
///
/// Returns [`EmbedderError::Construct`] when the client refuses its configuration and
/// [`EmbedderError::Preflight`] when the preflight request fails.
pub(crate) async fn openai<P>(
    api_key: SecretString,
    progress: P,
) -> Result<ExternalEmbeddingProvider<OpenAiEmbeddingClient, P>, EmbedderError> {
    let generator = OpenAiEmbeddingClient::new(OpenAiEmbeddingClientConfig {
        api_key: api_key.into_unguarded().as_ref().to_owned(),
        base_url: Some(EMBEDDING_ENDPOINT.to_owned()),
    })
    .map_err(EmbedderError::Construct)?;

    let embedder = ExternalEmbeddingProvider::new(
        generator,
        &EmbeddingContract {
            provider: "openai",
            endpoint: EMBEDDING_ENDPOINT,
            model: "text-embedding-3-large",
            encoding: "float",
        },
        RequestLimits { .. },
        progress,
    );

    // The preflight runs before the command reads the store, because a refused key costs minutes
    // less here than at the first workload request.
    embedder
        .preflight()
        .await
        .map_err(EmbedderError::Preflight)?;

    Ok(embedder)
}
