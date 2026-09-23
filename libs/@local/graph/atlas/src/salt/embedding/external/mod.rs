//! Card embedding through an external provider.
//!
//! [`ExternalEmbeddingProvider`] adapts an [`EmbeddingGenerator`] to [`CardEmbedder`] with
//! sequential request batches and completed-batch progress. [`EmbeddingContract`] identifies the
//! declared vector configuration, while [`RequestLimits`] controls batch size.
//!
//! For a batch of texts, let tᵢ be the `cl100k_base` token count and bᵢ its UTF-8 byte length.
//! Admission requires both Σtᵢ ≤ L and ⌈Σbᵢ/4⌉ ≤ L, where L is the token limit, together with the
//! document limit. The byte estimate supplements the tokenizer count. These are local sizing rules,
//! and a provider can impose additional restrictions.
//!
//! The adapter calls [`Progress::embedding_batch`] after each batch returns the expected number of
//! canonical-width vectors. The report counts completed texts against the whole workload. A
//! generator can retry internally, and batch reports do not count HTTP attempts.
//!
//! [`ExternalEmbeddingProvider::preflight`] checks one short text before committing to a workload.
//! Success establishes that this call returned one canonical-width vector.

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
/// The fields must describe the generator's actual configuration. The adapter adds
/// [`CANONICAL_DIMENSIONS`] to the fingerprint preimage. Use a model identity that changes when the
/// vector-producing contract changes. A declared model name alone cannot detect provider-side model
/// updates.
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
    /// Each text field has a little-endian byte-length prefix. The preimage therefore distinguishes
    /// field boundaries even when raw field concatenations are equal. SHA-256 hashes that
    /// domain-separated preimage together with the canonical dimension.
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

/// The default maximum of 2,048 texts per batch.
const DEFAULT_DOCUMENT_LIMIT: NonZero<usize> = const { NonZero::new(2_048).unwrap() };
/// The default ceiling of 300,000 tokens under each local accounting.
const DEFAULT_TOKEN_LIMIT: NonZero<usize> = const { NonZero::new(300_000).unwrap() };

/// A short input for checking the generator response count and vector width.
const PREFLIGHT_TEXT: &str = "preflight";

/// Document and token ceilings for each embedding batch.
///
/// Custom limits must keep accumulated token and byte counts, including the next candidate text,
/// representable as `usize`. The default token limit leaves room for these additions.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct RequestLimits {
    /// Maximum texts per batch, 2,048 by default.
    pub documents: NonZero<usize> = DEFAULT_DOCUMENT_LIMIT,
    /// Maximum batch cost under each token accounting, 300,000 by default.
    ///
    /// Applies separately to the sum of `cl100k_base` token counts and the total UTF-8 byte length divided by four, rounded up.
    pub tokens: NonZero<usize> = DEFAULT_TOKEN_LIMIT,
}

/// Accumulated tokenizer and byte counts for the batch under assembly.
#[derive(Default)]
struct RequestCost {
    /// Exact `cl100k_base` tokens.
    tokens: usize,
    /// UTF-8 bytes.
    ///
    /// The admission estimate rounds the batch's total bytes divided by four up to an integer.
    bytes: usize,
}

/// A card embedder with sequential batching and completed-batch progress.
///
/// Under [`RequestLimits`], the workload splits into batches with validated response counts and
/// vector widths. Output retains the order promised by [`EmbeddingGenerator`], and each completed
/// batch reports to the supplied observer. [`super::embed_cards`] checks vector finiteness
/// separately.
///
/// The adapter collects the input text references and all output vectors before returning. A
/// failure returns no partial vector collection, even if earlier batches completed.
#[derive(Debug)]
pub(crate) struct ExternalEmbeddingProvider<G, P> {
    generator: G,
    fingerprint: EmbedderFingerprint,
    limits: RequestLimits,
    progress: P,
}

impl<G, P> ExternalEmbeddingProvider<G, P> {
    /// Configures batching, reuse identity, and progress for `generator`.
    ///
    /// `contract` must describe the generator's configuration. The constructor records its
    /// fingerprint without changing or inspecting that configuration. `limits` must satisfy
    /// [`RequestLimits`]'s arithmetic requirement.
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

    /// Checks one generator call for a single canonical-width response.
    ///
    /// Use this before expensive input preparation to detect provider refusal or incompatible
    /// response shape early. The generator receives one short text and may retry internally. This
    /// check bypasses [`RequestLimits`] and emits no batch progress. It checks only response count
    /// and width. Success does not guarantee that later requests succeed.
    ///
    /// # Errors
    ///
    /// Returns [`ExternalEmbeddingError`] for generator failure, response-count mismatch, or
    /// noncanonical width, in that order.
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

    /// Admits the next text or finishes the batch with a stop reason.
    ///
    /// `cost` must describe `batch`, under [`RequestLimits`]'s arithmetic requirement. `index`
    /// identifies the next text in the workload. Successful admission consumes that text and
    /// returns [`ControlFlow::Continue`], while a break leaves the text unconsumed.
    ///
    /// The break contains `Ok(())` at the document ceiling, iterator exhaustion, or when another
    /// text would exceed an accumulated cost ceiling. An error reports a reserved token or a text
    /// that exceeds the token limit by itself. The batch and cost remain unchanged on a break.
    ///
    /// A nonempty iterator and empty batch either admit a text or return an error. This ensures
    /// that a successful break with remaining texts supplies a nonempty batch.
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
        // collecting references fixes the denominator for every completed-batch report.
        let texts: Vec<&str> = texts.into_iter().collect();
        let total = texts.len();

        let mut iter = texts.into_iter().peekable();
        let mut embeddings = Vec::new();
        // reusing the batch buffer retains its capacity between requests. Its text references
        // borrow the workload.
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

            // With a nonempty iterator, admission either accepts a text or returns an error before
            // a successful break. This loop began with remaining texts and propagated admission
            // errors. Therefore the batch is nonempty.
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

/// Copies a canonical-width provider vector into aligned storage.
///
/// `index` identifies the text for error reporting. Component values copy unchanged, including
/// non-finite values.
///
/// # Errors
///
/// Returns [`ExternalEmbeddingError::Dimensions`] when the width differs from
/// [`CANONICAL_DIMENSIONS`].
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

/// A batching, generator, or response-shape failure during card embedding.
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
    /// A single text exceeds the token ceiling under the stricter local accounting.
    ///
    /// `tokens` is the larger of its tokenizer count and rounded-up byte estimate.
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
