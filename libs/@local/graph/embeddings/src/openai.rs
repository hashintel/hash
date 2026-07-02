use core::{fmt, time::Duration};

use error_stack::{Report, ResultExt as _};
use hash_graph_types::Embedding;
use reqwest::{Client, StatusCode};
use reqwest_middleware::{ClientBuilder, ClientWithMiddleware};
use reqwest_retry::{RetryTransientMiddleware, policies::ExponentialBackoff};
use reqwest_tracing::TracingMiddleware;
use serde::{Deserialize, Serialize};

use crate::{EmbeddingError, EmbeddingGenerator};

/// An OpenAI text-embedding model.
#[derive(Debug, Clone, Copy, Serialize)]
enum EmbeddingModel {
    #[serde(rename = "text-embedding-3-large")]
    TextEmbedding3Large,
}

/// The encoding of the embedding values returned by the provider.
#[derive(Debug, Clone, Copy, Serialize)]
enum EncodingFormat {
    #[serde(rename = "float")]
    Float,
}

/// The OpenAI embedding model used to generate query embeddings.
///
/// This **must** match the model used to generate the stored entity and entity-type embeddings in
/// `apps/hash-ai-worker-ts/src/activities/shared/embeddings.ts`. The two are compared via cosine
/// distance during search, so a mismatch produces meaningless results. Changing the model requires
/// re-generating all stored embeddings on both sides.
const EMBEDDING_MODEL: EmbeddingModel = EmbeddingModel::TextEmbedding3Large;

/// The default base URL of the OpenAI API.
const DEFAULT_BASE_URL: &str = "https://api.openai.com/v1";

/// Per-request timeout for the embedding endpoint.
///
/// The embedding call sits in the synchronous search request path, so the timeout is kept short to
/// avoid blocking an interactive search on a struggling upstream.
const REQUEST_TIMEOUT: Duration = Duration::from_secs(10);

/// The maximum number of retries for transient failures (HTTP 408, 429, 5xx, connection errors).
const MAX_RETRIES: u32 = 2;

/// The shortest and longest backoff interval between retries.
const MIN_RETRY_INTERVAL: Duration = Duration::from_millis(250);
const MAX_RETRY_INTERVAL: Duration = Duration::from_secs(2);

/// Configuration for an [`OpenAiEmbeddingClient`].
#[derive(Clone)]
pub struct OpenAiEmbeddingClientConfig {
    /// The OpenAI API key used to authenticate requests.
    pub api_key: String,
    /// Overrides the OpenAI API base URL. Defaults to `https://api.openai.com/v1`.
    pub base_url: Option<String>,
}

impl fmt::Debug for OpenAiEmbeddingClientConfig {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.debug_struct("OpenAiEmbeddingClientConfig")
            .field("api_key", &"[redacted]")
            .field("base_url", &self.base_url)
            .finish()
    }
}

/// An [`EmbeddingGenerator`] backed by the OpenAI embeddings API.
#[derive(Clone)]
pub struct OpenAiEmbeddingClient {
    client: ClientWithMiddleware,
    api_key: String,
    base_url: String,
}

impl fmt::Debug for OpenAiEmbeddingClient {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.debug_struct("OpenAiEmbeddingClient")
            .field("base_url", &self.base_url)
            .finish_non_exhaustive()
    }
}

impl OpenAiEmbeddingClient {
    /// Creates a new client from the given configuration.
    ///
    /// Requests are retried on transient failures with exponential backoff. The retry policy is
    /// deliberately conservative because the client is used in the interactive search path:
    /// `Retry-After` headers are intentionally not honored, so a rate-limited or struggling
    /// provider fails fast (within the bounded backoff) rather than blocking the search on a
    /// provider-suggested delay.
    ///
    /// # Errors
    ///
    /// Returns [`EmbeddingError::Request`] if the underlying HTTP client could not be built.
    pub fn new(config: OpenAiEmbeddingClientConfig) -> Result<Self, Report<EmbeddingError>> {
        let client = Client::builder()
            .timeout(REQUEST_TIMEOUT)
            .build()
            .change_context(EmbeddingError::Request)?;

        let retry_policy = ExponentialBackoff::builder()
            .retry_bounds(MIN_RETRY_INTERVAL, MAX_RETRY_INTERVAL)
            .build_with_max_retries(MAX_RETRIES);

        let client = ClientBuilder::new(client)
            .with(TracingMiddleware::default())
            .with(RetryTransientMiddleware::new_with_policy(retry_policy))
            .build();

        // Normalize away any trailing slash so joining with `/embeddings` never yields a double
        // slash, regardless of whether the configured base URL ends in `/`.
        let base_url = config
            .base_url
            .as_deref()
            .unwrap_or(DEFAULT_BASE_URL)
            .trim_end_matches('/')
            .to_owned();

        Ok(Self {
            client,
            api_key: config.api_key,
            base_url,
        })
    }
}

#[derive(Debug, Serialize)]
struct EmbeddingRequest<'a> {
    model: EmbeddingModel,
    input: &'a [&'a str],
    encoding_format: EncodingFormat,
}

#[derive(Debug, Deserialize)]
struct EmbeddingResponse {
    data: Vec<EmbeddingDatum>,
}

#[derive(Debug, Deserialize)]
struct EmbeddingDatum {
    index: usize,
    embedding: Vec<f32>,
}

impl EmbeddingGenerator for OpenAiEmbeddingClient {
    async fn create_embeddings(
        &self,
        inputs: &[&str],
    ) -> Result<Vec<Embedding<'static>>, Report<EmbeddingError>> {
        let response = self
            .client
            .post(format!("{}/embeddings", self.base_url))
            .bearer_auth(&self.api_key)
            .json(&EmbeddingRequest {
                model: EMBEDDING_MODEL,
                input: inputs,
                encoding_format: EncodingFormat::Float,
            })
            .send()
            .await
            .change_context(EmbeddingError::Request)?;

        let status = response.status();
        if !status.is_success() {
            let body = response
                .text()
                .await
                .unwrap_or_else(|error| format!("<failed to read error body: {error}>"));
            // Classify the provider status so the API layer can surface an appropriate HTTP
            // status (e.g. rate-limit vs. outage vs. misconfiguration) rather than a blanket 500.
            let context = if status == StatusCode::UNAUTHORIZED || status == StatusCode::FORBIDDEN {
                EmbeddingError::Unauthorized
            } else if status == StatusCode::TOO_MANY_REQUESTS {
                EmbeddingError::RateLimited
            } else if status.is_server_error() || status == StatusCode::REQUEST_TIMEOUT {
                EmbeddingError::ProviderUnavailable
            } else {
                EmbeddingError::Response
            };
            // Log the provider response server-side rather than attaching it to the returned
            // `Report`: the API layer serializes error reports back to clients, so the body (which
            // can echo request details) must not ride along on the error.
            tracing::error!(%status, %body, "OpenAI embeddings request failed");
            return Err(Report::new(context));
        }

        let mut response = response
            .json::<EmbeddingResponse>()
            .await
            .change_context(EmbeddingError::Response)?;

        if response.data.len() != inputs.len() {
            return Err(Report::new(EmbeddingError::UnexpectedCount)).attach(format!(
                "expected {} embeddings, got {}",
                inputs.len(),
                response.data.len()
            ));
        }

        // The OpenAI API returns embeddings in input order, but we sort defensively by `index` and
        // verify the indices form a contiguous `0..n` range, so a malformed-but-count-correct
        // response cannot silently pair an input with the wrong embedding.
        response.data.sort_unstable_by_key(|datum| datum.index);
        if response
            .data
            .iter()
            .enumerate()
            .any(|(position, datum)| datum.index != position)
        {
            return Err(Report::new(EmbeddingError::Response))
                .attach("provider returned non-contiguous embedding indices");
        }

        response
            .data
            .into_iter()
            .map(|datum| {
                if datum.embedding.len() != Embedding::DIM {
                    return Err(Report::new(EmbeddingError::UnexpectedDimensions)).attach(format!(
                        "expected {} dimensions, got {}",
                        Embedding::DIM,
                        datum.embedding.len()
                    ));
                }
                Ok(Embedding::from(datum.embedding))
            })
            .collect()
    }
}
