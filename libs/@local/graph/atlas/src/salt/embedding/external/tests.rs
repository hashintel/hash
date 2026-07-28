#![expect(
    clippy::float_cmp,
    reason = "fixture vectors use exactly representable components, so ordering and conversion \
              must reproduce them bit-identically"
)]
use core::{assert_matches, future::ready, num::NonZero};
use std::sync::Mutex;

use error_stack::Report;
use hash_graph_embeddings::{EmbeddingError, EmbeddingGenerator};
use hash_graph_types::Embedding;

use super::{EmbeddingContract, ExternalEmbeddingError, ExternalEmbeddingProvider, RequestLimits};
use crate::{
    dataset::{
        CANONICAL_DIMENSIONS,
        card::{Cl100kTokenizer, Tokenizer as _},
    },
    salt::embedding::CardEmbedder as _,
};

fn contract() -> EmbeddingContract<'static> {
    EmbeddingContract {
        provider: "openai",
        endpoint: "https://api.openai.com/v1/embeddings",
        model: "text-embedding-3-large",
        encoding: "float",
    }
}

/// A deterministic vector for one text: component 0 is the text length.
#[expect(
    clippy::cast_precision_loss,
    reason = "fixture texts are a handful of bytes, exactly representable in f32"
)]
fn vector_for(text: &str) -> Vec<f32> {
    let mut components = vec![0.0_f32; CANONICAL_DIMENSIONS];
    components[0] = text.len() as f32;
    components
}

/// Generates deterministically via [`vector_for`] and records requests.
#[derive(Default)]
struct RecordingGenerator {
    requests: Mutex<Vec<Vec<String>>>,
}

impl RecordingGenerator {
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

/// Returns vectors of a wrong width.
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

/// Fails every request.
struct FailingGenerator;

impl EmbeddingGenerator for FailingGenerator {
    fn create_embeddings(
        &self,
        _: &[&str],
    ) -> impl Future<Output = Result<Vec<Embedding<'static>>, Report<EmbeddingError>>> + Send {
        ready(Err(Report::new(EmbeddingError::RateLimited)))
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
    // Both contracts concatenate to the same bytes; the length prefixes
    // must keep them apart.
    let mut left = contract();
    left.provider = "ab";
    left.endpoint = "c";
    let mut right = contract();
    right.provider = "a";
    right.endpoint = "bc";

    assert_ne!(left.fingerprint(), right.fingerprint());
}

#[tokio::test]
#[cfg_attr(
    miri,
    ignore = "tokio's I/O driver calls foreign functions Miri cannot emulate"
)]
async fn embeds_in_input_order_within_one_request() {
    let generator = RecordingGenerator::default();
    let provider = ExternalEmbeddingProvider::new(generator, &contract(), RequestLimits { .. });

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
#[cfg_attr(
    miri,
    ignore = "tokio's I/O driver calls foreign functions Miri cannot emulate"
)]
async fn splits_requests_at_the_document_ceiling() {
    let generator = RecordingGenerator::default();
    let provider = ExternalEmbeddingProvider::new(
        generator,
        &contract(),
        RequestLimits {
            documents: NonZero::new(2).expect("two is nonzero"),
            ..
        },
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
#[cfg_attr(
    miri,
    ignore = "tokio's I/O driver calls foreign functions Miri cannot emulate"
)]
async fn splits_requests_at_the_token_ceiling() {
    let generator = RecordingGenerator::default();
    // Each fixture word counts one cl100k token in at most four bytes, so
    // the exact count is the binding accounting and a ceiling of two
    // tokens admits two words per request.
    let provider = ExternalEmbeddingProvider::new(
        generator,
        &contract(),
        RequestLimits {
            tokens: NonZero::new(2).expect("two is nonzero"),
            ..
        },
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
#[cfg_attr(
    miri,
    ignore = "tokio's I/O driver calls foreign functions Miri cannot emulate"
)]
async fn splits_requests_at_the_byte_estimate_ceiling() {
    // A word whose byte estimate exceeds its exact count: the provider's
    // admission gate, not the tokenizer, is the binding accounting.
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
    // Six estimated tokens per request: two twelve-byte words fit
    // (⌈24 / 4⌉ = 6), a third crosses; the exact count alone would
    // admit all five in one request.
    let provider = ExternalEmbeddingProvider::new(
        generator,
        &contract(),
        RequestLimits {
            tokens: NonZero::new(6).expect("six is nonzero"),
            ..
        },
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
#[cfg_attr(
    miri,
    ignore = "tokio's I/O driver calls foreign functions Miri cannot emulate"
)]
async fn rejects_a_text_above_the_token_ceiling() {
    let provider = ExternalEmbeddingProvider::new(
        RecordingGenerator::default(),
        &contract(),
        RequestLimits {
            tokens: NonZero::new(1).expect("one is nonzero"),
            ..
        },
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
#[cfg_attr(
    miri,
    ignore = "tokio's I/O driver calls foreign functions Miri cannot emulate"
)]
async fn rejects_a_text_above_the_byte_estimate_ceiling() {
    let provider = ExternalEmbeddingProvider::new(
        RecordingGenerator::default(),
        &contract(),
        RequestLimits {
            tokens: NonZero::new(3).expect("three is nonzero"),
            ..
        },
    );

    // Two exact tokens in twenty-four bytes: legal by the tokenizer,
    // above the ceiling in the gate's estimate (⌈24 / 4⌉ = 6).
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
#[cfg_attr(
    miri,
    ignore = "tokio's I/O driver calls foreign functions Miri cannot emulate"
)]
async fn rejects_reserved_tokens_before_any_request() {
    let generator = RecordingGenerator::default();
    let provider = ExternalEmbeddingProvider::new(generator, &contract(), RequestLimits { .. });

    let result = provider.embed(["<|endoftext|>"]).await;

    assert_matches!(
        result,
        Err(ExternalEmbeddingError::ReservedToken { index: 0, .. })
    );
    assert!(provider.generator.requests().is_empty());
}

#[tokio::test]
#[cfg_attr(
    miri,
    ignore = "tokio's I/O driver calls foreign functions Miri cannot emulate"
)]
async fn rejects_vectors_of_the_wrong_width() {
    let provider =
        ExternalEmbeddingProvider::new(NarrowGenerator, &contract(), RequestLimits { .. });

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
#[cfg_attr(
    miri,
    ignore = "tokio's I/O driver calls foreign functions Miri cannot emulate"
)]
async fn surfaces_provider_failures() {
    let provider =
        ExternalEmbeddingProvider::new(FailingGenerator, &contract(), RequestLimits { .. });

    let result = provider.embed(["alpha"]).await;

    assert_matches!(
        result,
        Err(ExternalEmbeddingError::Provider(report))
            if matches!(report.current_context(), EmbeddingError::RateLimited)
    );
}
