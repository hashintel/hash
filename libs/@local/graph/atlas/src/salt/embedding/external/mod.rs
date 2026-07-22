//! Card embedding through an external provider.
//!
//! [`ExternalEmbeddingProvider`] adapts any [`EmbeddingGenerator`] into a [`CardEmbedder`]. The
//! generator family already pins the vector type, the error type, and the input-order contract, so
//! backends differ only in data: the [`EmbeddingContract`] naming the configuration the fingerprint
//! commits to, and the [`RequestLimits`] the proxy packs requests under. One request never exceeds
//! the document ceiling or the summed token ceiling; token counts are exact `cl100k_base` counts,
//! the encoding of the embedding models this crate targets.

use core::{error::Error, fmt, iter::Peekable, num::NonZero, ops::ControlFlow};

use error_stack::Report;
use hash_graph_embeddings::{EmbeddingError, EmbeddingGenerator};
use hash_graph_types::Embedding;

use super::{CANONICAL_DIMENSIONS, CardEmbedder, EmbedderFingerprint};
use crate::{
    dataset::card::{Cl100kTokenizer, Tokenizer as _},
    integrity::{Sha256, Update as _},
    math::{BoxedVecN, VecN},
};

#[cfg(test)]
mod tests;

/// The configuration an [`EmbedderFingerprint`] commits to.
///
/// The fields name everything that determines the vector a text embeds to, as the caller configured
/// the generator; the adapter adds the dimension it enforces. Stating a contract that differs from
/// the generator's actual configuration poisons cross-generation reuse, so construct it beside the
/// generator, from the same values.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct EmbeddingContract<'text> {
    /// The provider organization, e.g. `openai`.
    pub provider: &'text str,
    /// The endpoint the generator sends requests to.
    pub endpoint: &'text str,
    /// The model identity, e.g. `text-embedding-3-large`.
    pub model: &'text str,
    /// The wire encoding of returned vectors, e.g. `float`.
    pub encoding: &'text str,
}

impl EmbeddingContract<'_> {
    /// Returns the fingerprint of this contract.
    ///
    /// Every field is length-prefixed in the preimage, so fingerprints distinguish contracts that
    /// concatenate to equal bytes.
    #[expect(
        clippy::little_endian_bytes,
        reason = "the preimage is pinned to canonical little-endian length prefixes on every \
                  platform"
    )]
    #[must_use]
    pub(crate) fn fingerprint(&self) -> EmbedderFingerprint {
        let Self {
            provider,
            endpoint,
            model,
            encoding,
        } = self;

        let mut hasher = Sha256::new();
        hasher.update(b"atlas/embedding-contract/v0");
        for field in [provider, endpoint, model, encoding] {
            hasher.update(&(field.len() as u64).to_le_bytes());
            hasher.update(field.as_bytes());
        }
        hasher.update(&(CANONICAL_DIMENSIONS as u64).to_le_bytes());

        EmbedderFingerprint::new(hasher.finalize())
    }
}

const DEFAULT_DOCUMENT_LIMIT: NonZero<usize> = const { NonZero::new(2_048).unwrap() };
const DEFAULT_TOKEN_LIMIT: NonZero<usize> = const { NonZero::new(300_000).unwrap() };

/// Ceilings one provider request must stay under.
///
/// The defaults are the OpenAI embeddings API's published per-request ceilings.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct RequestLimits {
    /// Maximum texts per request.
    pub documents: NonZero<usize> = DEFAULT_DOCUMENT_LIMIT,
    /// Maximum summed tokens per request.
    pub tokens: NonZero<usize> = DEFAULT_TOKEN_LIMIT,
}

/// A [`CardEmbedder`] over an external [`EmbeddingGenerator`].
///
/// The proxy owns request sizing: a workload splits into requests that respect both
/// [`RequestLimits`] ceilings, each text's cost measured by its exact `cl100k_base` token count.
/// Returned vectors are re-validated to the canonical width and handed back in input order.
#[derive(Debug)]
pub(crate) struct ExternalEmbeddingProvider<G> {
    generator: G,
    fingerprint: EmbedderFingerprint,
    limits: RequestLimits,
}

impl<G> ExternalEmbeddingProvider<G> {
    /// Creates a provider embedding under `contract` within `limits`.
    #[must_use]
    pub(crate) fn new(generator: G, contract: &EmbeddingContract, limits: RequestLimits) -> Self {
        Self {
            generator,
            fingerprint: contract.fingerprint(),
            limits,
        }
    }

    /// Admits the workload's next text into the request under assembly, or breaks.
    ///
    /// Breaks with `Ok` when the request is full - a further text would cross a ceiling, or the
    /// workload is exhausted - and with the workload-stopping error when the next text cannot
    /// embed at all. An empty request admits any text that fits the token ceiling alone, so a
    /// break with texts on the iterator always leaves a non-empty request; `index` locates the
    /// next text in the workload for error reports.
    fn admit<'text>(
        &self,
        batch: &mut Vec<&'text str>,
        token_count: &mut usize,
        index: usize,
        iter: &mut Peekable<impl Iterator<Item = &'text str>>,
    ) -> ControlFlow<Result<(), ExternalEmbeddingError>> {
        if batch.len() >= self.limits.documents.get() {
            return ControlFlow::Break(Ok(()));
        }

        let Some(&next) = iter.peek() else {
            return ControlFlow::Break(Ok(()));
        };
        let tokens = match Cl100kTokenizer.count_tokens(next) {
            Ok(tokens) => tokens,
            Err(error) => {
                return ControlFlow::Break(Err(ExternalEmbeddingError::ReservedToken {
                    index,
                    token: error.token,
                }));
            }
        };

        if tokens > self.limits.tokens.get() {
            return ControlFlow::Break(Err(ExternalEmbeddingError::OversizedText {
                index,
                tokens,
            }));
        }
        if *token_count + tokens > self.limits.tokens.get() {
            return ControlFlow::Break(Ok(()));
        }

        *token_count += tokens;
        batch.push(
            iter.next()
                .unwrap_or_else(|| unreachable!("the peek just returned a text")),
        );

        ControlFlow::Continue(())
    }
}

impl<G: EmbeddingGenerator + Sync> CardEmbedder for ExternalEmbeddingProvider<G> {
    type Error = ExternalEmbeddingError;

    fn fingerprint(&self) -> EmbedderFingerprint {
        self.fingerprint
    }

    async fn embed<'text>(
        &self,
        texts: impl IntoIterator<Item = &'text str, IntoIter: Send> + Send,
    ) -> Result<Vec<BoxedVecN<CANONICAL_DIMENSIONS>>, Self::Error> {
        let mut iter = texts.into_iter().peekable();
        let mut embeddings = Vec::new();
        // One request buffer serves the whole workload, cleared between
        // requests; the workload lifetime is shared, so reuse is free.
        let mut batch: Vec<&str> = Vec::new();
        let mut offset = 0;

        while iter.peek().is_some() {
            batch.clear();
            let mut token_count = 0;
            loop {
                let index = offset + batch.len();
                match self.admit(&mut batch, &mut token_count, index, &mut iter) {
                    ControlFlow::Continue(()) => {}
                    ControlFlow::Break(Ok(())) => break,
                    ControlFlow::Break(Err(error)) => return Err(error),
                }
            }

            // Texts were on the iterator, so the admission contract
            // guarantees a non-empty request here.
            let generated = self
                .generator
                .create_embeddings(&batch)
                .await
                .map_err(ExternalEmbeddingError::Provider)?;
            if generated.len() != batch.len() {
                return Err(ExternalEmbeddingError::BatchCount {
                    expected: batch.len(),
                    actual: generated.len(),
                });
            }

            for (position, embedding) in generated.into_iter().enumerate() {
                embeddings.push(canonical(embedding, offset + position)?);
            }

            offset += batch.len();
        }

        Ok(embeddings)
    }
}

/// Converts one provider vector to the canonical width.
fn canonical(
    embedding: Embedding<'static>,
    index: usize,
) -> Result<BoxedVecN<CANONICAL_DIMENSIONS>, ExternalEmbeddingError> {
    let components = embedding.into_vec();
    let Ok(components) = <&[f32; CANONICAL_DIMENSIONS]>::try_from(components.as_slice()) else {
        return Err(ExternalEmbeddingError::Dimensions {
            index,
            actual: components.len(),
        });
    };

    Ok(BoxedVecN::new(VecN::from_ref(components)))
}

/// An [`ExternalEmbeddingProvider`] workload failed.
#[derive(Debug)]
pub(crate) enum ExternalEmbeddingError {
    /// The generator failed a request.
    Provider(Report<EmbeddingError>),
    /// A request returned a different number of rows than it carried.
    BatchCount { expected: usize, actual: usize },
    /// A returned vector does not have the canonical width.
    Dimensions { index: usize, actual: usize },
    /// A text contains a token the encoding reserves for protocol use.
    ReservedToken { index: usize, token: &'static str },
    /// A single text exceeds the per-request token ceiling.
    OversizedText { index: usize, tokens: usize },
}

impl fmt::Display for ExternalEmbeddingError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Provider(report) => write!(fmt, "the embedding request failed: {report}"),
            Self::BatchCount { expected, actual } => {
                write!(fmt, "a request for {expected} embeddings returned {actual}")
            }
            Self::Dimensions { index, actual } => write!(
                fmt,
                "the embedding for text {index} has {actual} components instead of \
                 {CANONICAL_DIMENSIONS}",
            ),
            Self::ReservedToken { index, token } => {
                write!(fmt, "text {index} contains the reserved token {token}")
            }
            Self::OversizedText { index, tokens } => write!(
                fmt,
                "text {index} counts {tokens} tokens, above the per-request ceiling",
            ),
        }
    }
}

impl Error for ExternalEmbeddingError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Provider(report) => Some(report.current_context()),
            Self::BatchCount { .. }
            | Self::Dimensions { .. }
            | Self::ReservedToken { .. }
            | Self::OversizedText { .. } => None,
        }
    }
}
