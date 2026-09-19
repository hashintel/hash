#![allow(
    clippy::float_cmp,
    reason = "ordering and conversion must preserve the fixture's exactly representable components"
)]
use alloc::sync::Arc;
use core::{assert_matches, future::ready};
use std::sync::Mutex;

use error_stack::Report;
use hash_graph_embeddings::{EmbeddingError, EmbeddingGenerator};
use hash_graph_types::Embedding;

use super::{
    EmbeddingContract, ExternalEmbeddingError, ExternalEmbeddingProvider, PREFLIGHT_TEXT,
    RequestLimits,
};
use crate::{
    dataset::{
        CANONICAL_DIMENSIONS,
        card::{Cl100kTokenizer, Tokenizer as _},
    },
    math::nz,
    progress::{Batch, NoProgress, Progress},
    salt::embedding::CardEmbedder as _,
};

/// Declares the OpenAI model and float encoding named by the fixtures.
fn contract() -> EmbeddingContract<'static> {
    EmbeddingContract {
        provider: "openai",
        endpoint: "https://api.openai.com/v1/embeddings",
        model: "text-embedding-3-large",
        encoding: "float",
    }
}

/// Builds a zero vector with the text's byte length in component zero.
#[expect(
    clippy::cast_precision_loss,
    reason = "fixture texts are a handful of bytes, exactly representable in f32"
)]
fn vector_for(text: &str) -> Vec<f32> {
    let mut components = vec![0.0_f32; CANONICAL_DIMENSIONS];
    components[0] = text.len() as f32;
    components
}

/// A deterministic fixture generator with a request log.
///
/// # Panics
///
/// Recording or reading requests panics if the fixture mutex is poisoned.
#[derive(Default)]
struct RecordingGenerator {
    requests: Mutex<Vec<Vec<String>>>,
}

impl RecordingGenerator {
    /// Returns the recorded text batches in request order.
    ///
    /// # Panics
    ///
    /// Panics if the fixture mutex is poisoned.
    fn requests(&self) -> Vec<Vec<String>> {
        self.requests
            .lock()
            .expect("the fixture mutex should not be poisoned")
            .clone()
    }
}

impl EmbeddingGenerator for RecordingGenerator {
    fn create_embeddings(
        &self,
        inputs: &[&str],
    ) -> impl Future<Output = Result<Vec<Embedding<'static>>, Report<EmbeddingError>>> + Send {
        self.requests
            .lock()
            .expect("the fixture mutex should not be poisoned")
            .push(inputs.iter().map(|&input| input.to_owned()).collect());

        ready(Ok(inputs
            .iter()
            .map(|&input| Embedding::from(vector_for(input)))
            .collect()))
    }
}

/// A shared observer log of completed embedding batches.
///
/// # Panics
///
/// Recording or reading batches panics if the fixture mutex is poisoned.
#[derive(Debug, Default, Clone)]
struct RecordingProgress {
    batches: Arc<Mutex<Vec<Batch>>>,
}

impl RecordingProgress {
    /// Returns the completed-batch reports in report order.
    ///
    /// # Panics
    ///
    /// Panics if the fixture mutex is poisoned.
    fn batches(&self) -> Vec<Batch> {
        self.batches
            .lock()
            .expect("the fixture mutex should not be poisoned")
            .clone()
    }
}

impl Progress for RecordingProgress {
    type Detached = NoProgress;

    fn detach(&self) -> NoProgress {
        NoProgress
    }

    fn embedding_batch(&self, batch: Batch) {
        self.batches
            .lock()
            .expect("the fixture mutex should not be poisoned")
            .push(batch);
    }
}

/// A fixture generator returning 512-component vectors.
struct NarrowGenerator;

impl EmbeddingGenerator for NarrowGenerator {
    fn create_embeddings(
        &self,
        inputs: &[&str],
    ) -> impl Future<Output = Result<Vec<Embedding<'static>>, Report<EmbeddingError>>> + Send {
        ready(Ok(inputs
            .iter()
            .map(|_| Embedding::from(vec![0.0_f32; 512]))
            .collect()))
    }
}

/// A fixture generator returning a rate-limit error for every request.
struct FailingGenerator;

impl EmbeddingGenerator for FailingGenerator {
    fn create_embeddings(
        &self,
        _: &[&str],
    ) -> impl Future<Output = Result<Vec<Embedding<'static>>, Report<EmbeddingError>>> + Send {
        ready(Err(Report::new(EmbeddingError::RateLimited)))
    }
}

/// A fixture generator returning an empty vector collection.
struct SilentGenerator;

impl EmbeddingGenerator for SilentGenerator {
    fn create_embeddings(
        &self,
        _: &[&str],
    ) -> impl Future<Output = Result<Vec<Embedding<'static>>, Report<EmbeddingError>>> + Send {
        ready(Ok(Vec::new()))
    }
}

#[test]
fn fingerprints_commit_to_every_contract_field() {
    let base = contract();
    assert_eq!(base.fingerprint(), contract().fingerprint());

    for change in [
        |contract: &mut EmbeddingContract| contract.provider = "azure",
        |contract: &mut EmbeddingContract| contract.endpoint = "https://other",
        |contract: &mut EmbeddingContract| contract.model = "text-embedding-3-small",
        |contract: &mut EmbeddingContract| contract.encoding = "base64",
    ] {
        let mut changed = contract();
        change(&mut changed);
        assert_ne!(base.fingerprint(), changed.fingerprint());
    }
}

#[test]
fn fingerprints_distinguish_field_boundaries() {
    // the raw field concatenations are equal. Length prefixes distinguish their boundaries.
    let mut left = contract();
    left.provider = "ab";
    left.endpoint = "c";
    let mut right = contract();
    right.provider = "a";
    right.endpoint = "bc";

    assert_ne!(left.fingerprint(), right.fingerprint());
}

#[tokio::test]
async fn embeds_in_input_order_within_one_request() {
    let generator = RecordingGenerator::default();
    let provider =
        ExternalEmbeddingProvider::new(generator, &contract(), RequestLimits { .. }, NoProgress);

    let embeddings = provider
        .embed(["alpha", "beta"])
        .await
        .expect("the fixture generator should embed both texts");

    assert_eq!(provider.generator.requests(), [["alpha", "beta"]]);
    assert_eq!(embeddings.len(), 2);
    assert_eq!(embeddings[0].as_array()[0], 5.0);
    assert_eq!(embeddings[1].as_array()[0], 4.0);
}

#[tokio::test]
async fn splits_requests_at_the_document_ceiling() {
    let generator = RecordingGenerator::default();
    let provider = ExternalEmbeddingProvider::new(
        generator,
        &contract(),
        RequestLimits {
            documents: nz!(2),
            ..
        },
        NoProgress,
    );

    let embeddings = provider
        .embed(["a", "bb", "ccc", "dddd", "eeeee"])
        .await
        .expect("the fixture generator should embed every text");

    assert_eq!(
        provider.generator.requests(),
        [
            vec!["a".to_owned(), "bb".to_owned()],
            vec!["ccc".to_owned(), "dddd".to_owned()],
            vec!["eeeee".to_owned()],
        ]
    );
    assert_eq!(embeddings.len(), 5);
    assert_eq!(embeddings[4].as_array()[0], 5.0);
}

#[tokio::test]
async fn every_completed_request_reports_its_position_in_the_workload() {
    let progress = RecordingProgress::default();
    let provider = ExternalEmbeddingProvider::new(
        RecordingGenerator::default(),
        &contract(),
        RequestLimits {
            documents: nz!(2),
            ..
        },
        progress.clone(),
    );

    provider
        .embed(["a", "bb", "ccc", "dddd", "eeeee"])
        .await
        .expect("the fixture generator should embed every text");

    assert_eq!(
        progress.batches(),
        [
            Batch { done: 2, total: 5 },
            Batch { done: 4, total: 5 },
            Batch { done: 5, total: 5 },
        ]
    );
}

#[tokio::test]
async fn a_failed_request_reports_nothing() {
    let progress = RecordingProgress::default();
    let provider = ExternalEmbeddingProvider::new(
        FailingGenerator,
        &contract(),
        RequestLimits { .. },
        progress.clone(),
    );

    provider
        .embed(["alpha"])
        .await
        .expect_err("the fixture generator fails every request");

    assert_eq!(progress.batches(), []);
}

#[tokio::test]
async fn splits_requests_at_the_token_ceiling() {
    let generator = RecordingGenerator::default();
    // each word counts one cl100k token in at most four bytes. At limit two, both accountings admit
    // two words and the token count excludes a third.
    let provider = ExternalEmbeddingProvider::new(
        generator,
        &contract(),
        RequestLimits { tokens: nz!(2), .. },
        NoProgress,
    );

    let embeddings = provider
        .embed(["beta", "cat", "dog"])
        .await
        .expect("the fixture generator should embed every text");

    assert_eq!(
        provider.generator.requests(),
        [
            vec!["beta".to_owned(), "cat".to_owned()],
            vec!["dog".to_owned()],
        ]
    );
    assert_eq!(embeddings.len(), 3);
}

#[tokio::test]
async fn splits_requests_at_the_byte_estimate_ceiling() {
    // this word's byte estimate exceeds its tokenizer count.
    let word = " information";
    let tokens = Cl100kTokenizer
        .count_tokens(word)
        .expect("the fixture word carries no reserved token");
    assert!(
        tokens * 4 < word.len(),
        "the fixture must overshoot the byte estimate: {tokens} tokens over {} bytes",
        word.len()
    );

    let generator = RecordingGenerator::default();
    // two twelve-byte words meet the limit six: ⌈24 / 4⌉ = 6. A third exceeds it. Each word is one
    // token, allowing all five under the tokenizer count alone.
    let provider = ExternalEmbeddingProvider::new(
        generator,
        &contract(),
        RequestLimits { tokens: nz!(6), .. },
        NoProgress,
    );

    let embeddings = provider
        .embed([word; 5])
        .await
        .expect("the fixture generator should embed every text");

    let requests = provider.generator.requests();
    assert_eq!(requests.iter().map(Vec::len).collect::<Vec<_>>(), [2, 2, 1]);
    for request in &requests {
        let bytes: usize = request.iter().map(String::len).sum();
        assert!(bytes.div_ceil(4) <= 6);
    }
    assert_eq!(embeddings.len(), 5);
}

#[tokio::test]
async fn rejects_a_text_above_the_token_ceiling() {
    let provider = ExternalEmbeddingProvider::new(
        RecordingGenerator::default(),
        &contract(),
        RequestLimits { tokens: nz!(1), .. },
        NoProgress,
    );

    let result = provider.embed(["cat", "beta cat"]).await;

    assert_matches!(
        result,
        Err(ExternalEmbeddingError::OversizedText {
            index: 1,
            tokens: 2
        })
    );
}

#[tokio::test]
async fn rejects_a_text_above_the_byte_estimate_ceiling() {
    let provider = ExternalEmbeddingProvider::new(
        RecordingGenerator::default(),
        &contract(),
        RequestLimits { tokens: nz!(3), .. },
        NoProgress,
    );

    // the text has two tokens in twenty-four bytes. The byte estimate ⌈24 / 4⌉ = 6 exceeds limit
    // three.
    let result = provider.embed([" information information"]).await;

    assert_matches!(
        result,
        Err(ExternalEmbeddingError::OversizedText {
            index: 0,
            tokens: 6
        })
    );
}

#[tokio::test]
async fn rejects_reserved_tokens_before_any_request() {
    let generator = RecordingGenerator::default();
    let provider =
        ExternalEmbeddingProvider::new(generator, &contract(), RequestLimits { .. }, NoProgress);

    let result = provider.embed(["<|endoftext|>"]).await;

    assert_matches!(
        result,
        Err(ExternalEmbeddingError::ReservedToken { index: 0, .. })
    );
    assert_eq!(
        provider.generator.requests(),
        [] as [std::vec::Vec<std::string::String>; 0]
    );
}

#[tokio::test]
async fn rejects_vectors_of_the_wrong_width() {
    let provider = ExternalEmbeddingProvider::new(
        NarrowGenerator,
        &contract(),
        RequestLimits { .. },
        NoProgress,
    );

    let result = provider.embed(["alpha"]).await;

    assert_matches!(
        result,
        Err(ExternalEmbeddingError::Dimensions {
            index: 0,
            actual: 512,
        })
    );
}

#[tokio::test]
async fn surfaces_provider_failures() {
    let provider = ExternalEmbeddingProvider::new(
        FailingGenerator,
        &contract(),
        RequestLimits { .. },
        NoProgress,
    );

    let result = provider.embed(["alpha"]).await;

    assert_matches!(
        result,
        Err(ExternalEmbeddingError::Provider(report))
            if matches!(report.current_context(), EmbeddingError::RateLimited)
    );
}

#[tokio::test]
async fn a_preflight_spends_one_request_on_one_text() {
    let progress = RecordingProgress::default();
    let provider = ExternalEmbeddingProvider::new(
        RecordingGenerator::default(),
        &contract(),
        RequestLimits { .. },
        progress.clone(),
    );

    provider
        .preflight()
        .await
        .expect("the fixture generator should answer the preflight");

    assert_eq!(provider.generator.requests(), [[PREFLIGHT_TEXT]]);
    assert_eq!(progress.batches(), []);
}

#[tokio::test]
async fn a_preflight_surfaces_provider_failures() {
    let provider = ExternalEmbeddingProvider::new(
        FailingGenerator,
        &contract(),
        RequestLimits { .. },
        NoProgress,
    );

    let result = provider.preflight().await;

    assert_matches!(
        result,
        Err(ExternalEmbeddingError::Provider(report))
            if matches!(report.current_context(), EmbeddingError::RateLimited)
    );
}

#[tokio::test]
async fn a_preflight_rejects_vectors_of_the_wrong_width() {
    let provider = ExternalEmbeddingProvider::new(
        NarrowGenerator,
        &contract(),
        RequestLimits { .. },
        NoProgress,
    );

    let result = provider.preflight().await;

    assert_matches!(
        result,
        Err(ExternalEmbeddingError::Dimensions {
            index: 0,
            actual: 512,
        })
    );
}

#[tokio::test]
async fn a_preflight_refuses_an_answer_of_the_wrong_length() {
    let provider = ExternalEmbeddingProvider::new(
        SilentGenerator,
        &contract(),
        RequestLimits { .. },
        NoProgress,
    );

    let result = provider.preflight().await;

    assert_matches!(
        result,
        Err(ExternalEmbeddingError::BatchCount {
            expected: 1,
            actual: 0,
        })
    );
}
