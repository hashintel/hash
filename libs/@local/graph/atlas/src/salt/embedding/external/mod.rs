//! Card embedding through an external provider.
//!
//! [`ExternalEmbeddingProvider`] adapts any [`EmbeddingGenerator`] into a [`CardEmbedder`]. The
//! generator family already pins the vector type, the error type, and the input-order contract, so
//! backends differ only in data: the [`EmbeddingContract`] naming the configuration the fingerprint
//! commits to, and the [`RequestLimits`] the proxy packs requests under. One request never exceeds
//! the document ceiling or the summed token ceiling; token counts are exact `cl100k_base` counts,
//! the encoding of the embedding models this crate targets. The provider additionally gates
//! admission on a byte estimate of the token count - UTF-8 bytes divided by four, measured
//! bit-exact against its rejections - so requests stay under the token ceiling in both
//! accountings.
//!
//! The request boundary is also the workload's only observable progress, so the proxy carries the
//! run's [`Progress`] observer and reports each request it completes against the workload it was
//! handed. Nothing above it can report that: a caller hands over the whole workload in one call.
//!
//! Because the workload arrives whole, the first request is also the first proof that the provider
//! is reachable under the configured credentials - by which point a run has already read the store
//! and assembled its cards. [`ExternalEmbeddingProvider::preflight`] buys that proof up front, for
//! one text.

use core::{error::Error, fmt, iter::Peekable, num::NonZero, ops::ControlFlow};

use error_stack::Report;
use hash_graph_embeddings::{EmbeddingError, EmbeddingGenerator};
use hash_graph_types::Embedding;

use super::{CANONICAL_DIMENSIONS, CardEmbedder, EmbedderFingerprint};
use crate::{
    dataset::card::{Cl100kTokenizer, Tokenizer as _},
    integrity::{Sha256, Update as _},
    math::{BoxedVecN, VecN},
    progress::{Batch, Progress},
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

/// The text a preflight request carries.
///
/// Its content is immaterial - what is under test is whether the provider answers at all - so it is
/// one short word, the cheapest request the endpoint accepts.
const PREFLIGHT_TEXT: &str = "preflight";

/// Ceilings one provider request must stay under.
///
/// The defaults are the OpenAI embeddings API's published per-request ceilings.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct RequestLimits {
    /// Maximum texts per request.
    pub documents: NonZero<usize> = DEFAULT_DOCUMENT_LIMIT,
    /// Maximum summed tokens per request.
    ///
    /// Held in both provider accountings: the exact `cl100k_base` count and the admission gate's
    /// byte estimate (UTF-8 bytes divided by four).
    pub tokens: NonZero<usize> = DEFAULT_TOKEN_LIMIT,
}

/// The running cost of the request under assembly, in both provider accountings.
#[derive(Default)]
struct RequestCost {
    /// Exact `cl100k_base` tokens.
    tokens: usize,
    /// UTF-8 bytes; the admission gate estimates tokens as bytes divided by four.
    bytes: usize,
}

/// A [`CardEmbedder`] over an external [`EmbeddingGenerator`].
///
/// The proxy owns request sizing: a workload splits into requests that respect both
/// [`RequestLimits`] ceilings, each text's cost measured by its exact `cl100k_base` token count.
/// Returned vectors are re-validated to the canonical width and handed back in input order.
///
/// Owning the split makes the proxy the only place a workload's advance is visible, so it reports
/// every completed request to the run's observer.
#[derive(Debug)]
pub(crate) struct ExternalEmbeddingProvider<G, P> {
    generator: G,
    fingerprint: EmbedderFingerprint,
    limits: RequestLimits,
    progress: P,
}

impl<G, P> ExternalEmbeddingProvider<G, P> {
    /// Creates a provider embedding under `contract` within `limits`, reporting to `progress`.
    #[must_use]
    pub(crate) fn new(
        generator: G,
        contract: &EmbeddingContract,
        limits: RequestLimits,
        progress: P,
    ) -> Self {
        Self {
            generator,
            fingerprint: contract.fingerprint(),
            limits,
            progress,
        }
    }

    /// Proves the provider answers, before anything expensive happens.
    ///
    /// One request for one short text, through the same generator, contract and canonical
    /// validation the workload uses. It settles the three things a run cannot recover from and
    /// otherwise discovers late: credentials the provider refuses, an endpoint that does not
    /// answer, and a model whose vectors are not the canonical width.
    ///
    /// The check is unconditional, including for runs that turn out to reuse every card. Whether
    /// anything needs embedding is known only after the store is read and the cards are assembled
    /// - which is exactly the work whose cost this exists to avoid paying twice.
    ///
    /// # Errors
    ///
    /// Returns the same [`ExternalEmbeddingError`] a workload would: [`Provider`] when the request
    /// fails, [`BatchCount`] when one text does not return one vector, and [`Dimensions`] when the
    /// returned vector is not [`CANONICAL_DIMENSIONS`] wide.
    ///
    /// [`Provider`]: ExternalEmbeddingError::Provider
    /// [`BatchCount`]: ExternalEmbeddingError::BatchCount
    /// [`Dimensions`]: ExternalEmbeddingError::Dimensions
    pub(crate) async fn preflight(&self) -> Result<(), ExternalEmbeddingError>
    where
        G: EmbeddingGenerator,
    {
        let generated = self
            .generator
            .create_embeddings(&[PREFLIGHT_TEXT])
            .await
            .map_err(ExternalEmbeddingError::Provider)?;

        let [embedding] = <[_; 1]>::try_from(generated).map_err(|generated: Vec<_>| {
            ExternalEmbeddingError::BatchCount {
                expected: 1,
                actual: generated.len(),
            }
        })?;
        canonical(embedding, 0)?;

        Ok(())
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
        cost: &mut RequestCost,
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
        let bytes = next.len();

        if tokens.max(bytes.div_ceil(4)) > self.limits.tokens.get() {
            return ControlFlow::Break(Err(ExternalEmbeddingError::OversizedText {
                index,
                tokens: tokens.max(bytes.div_ceil(4)),
            }));
        }
        if cost.tokens + tokens > self.limits.tokens.get()
            || (cost.bytes + bytes).div_ceil(4) > self.limits.tokens.get()
        {
            return ControlFlow::Break(Ok(()));
        }

        cost.tokens += tokens;
        cost.bytes += bytes;
        batch.push(
            iter.next()
                .unwrap_or_else(|| unreachable!("the peek just returned a text")),
        );

        ControlFlow::Continue(())
    }
}

impl<G: EmbeddingGenerator + Sync, P: Progress + Sync> CardEmbedder
    for ExternalEmbeddingProvider<G, P>
{
    type Error = ExternalEmbeddingError;

    fn fingerprint(&self) -> EmbedderFingerprint {
        self.fingerprint
    }

    async fn embed<'text>(
        &self,
        texts: impl IntoIterator<Item = &'text str, IntoIter: Send> + Send,
    ) -> Result<Vec<BoxedVecN<CANONICAL_DIMENSIONS>>, Self::Error> {
        // The workload is counted before the first request goes out:
        // every report states its position against the whole.
        let texts: Vec<&str> = texts.into_iter().collect();
        let total = texts.len();

        let mut iter = texts.into_iter().peekable();
        let mut embeddings = Vec::new();
        // One request buffer serves the whole workload, cleared between
        // requests; the workload lifetime is shared, so reuse is free.
        let mut batch: Vec<&str> = Vec::new();
        let mut offset = 0;

        while iter.peek().is_some() {
            batch.clear();
            let mut cost = RequestCost::default();
            loop {
                let index = offset + batch.len();
                match self.admit(&mut batch, &mut cost, index, &mut iter) {
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
            self.progress.embedding_batch(Batch {
                done: offset,
                total,
            });
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
pub enum ExternalEmbeddingError {
    /// The generator failed a request.
    Provider(Report<EmbeddingError>),
    /// A request returned a different number of rows than it carried.
    BatchCount { expected: usize, actual: usize },
    /// A returned vector does not have the canonical width.
    Dimensions { index: usize, actual: usize },
    /// A text contains a token the encoding reserves for protocol use.
    ReservedToken { index: usize, token: &'static str },
    /// A single text exceeds the per-request token ceiling in the stricter provider accounting.
    OversizedText { index: usize, tokens: usize },
}

impl fmt::Display for ExternalEmbeddingError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Provider(_) => fmt.write_str("the embedding request failed"),
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
