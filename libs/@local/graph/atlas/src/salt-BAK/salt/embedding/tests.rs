use std::{collections::HashMap, num::NonZeroUsize, sync::Mutex};

use error_stack::Report;
use hash_graph_embeddings::{EmbeddingError, EmbeddingGenerator};
use hash_graph_types::Embedding;

use crate::salt::{
    card::{
        CardBudgets, HeuristicTokenCounter, NaiveSentenceSplitter, RelationCard, RelationCardInput,
        RelationConstraints, RelationDirection, build_card,
    },
    embedding::{
        CardEmbeddingCache, CardEmbeddingError, CardEmbeddingKey, EmbeddingProducerIdentity,
        embed_cards,
    },
    hash::ContentHash,
    representation::{CANONICAL_DIMENSIONS, OwnedCanonicalEmbedding},
};

#[derive(Debug, Copy, Clone)]
enum ResponseShape {
    Valid,
    Short,
    NonFinite,
}

#[derive(Debug)]
struct RecordingGenerator {
    calls: Mutex<Vec<Vec<String>>>,
    shape: ResponseShape,
}

impl RecordingGenerator {
    fn new(shape: ResponseShape) -> Self {
        Self {
            calls: Mutex::new(Vec::new()),
            shape,
        }
    }
}

impl EmbeddingGenerator for RecordingGenerator {
    async fn create_embeddings(
        &self,
        inputs: &[&str],
    ) -> Result<Vec<Embedding<'static>>, Report<EmbeddingError>> {
        self.calls
            .lock()
            .expect("recording mutex should not be poisoned")
            .push(inputs.iter().map(|input| (*input).to_owned()).collect());
        Ok(inputs
            .iter()
            .map(|input| {
                let dimensions = match self.shape {
                    ResponseShape::Valid | ResponseShape::NonFinite => CANONICAL_DIMENSIONS,
                    ResponseShape::Short => CANONICAL_DIMENSIONS - 1,
                };
                let value = if input.contains("Alpha") { 1.0 } else { 3.0 };
                let mut values = vec![value; dimensions];
                if matches!(self.shape, ResponseShape::NonFinite) {
                    values[1_031] = f32::NAN;
                }
                Embedding::from(values)
            })
            .collect())
    }
}

#[derive(Debug, Default)]
struct MemoryCache {
    values: HashMap<CardEmbeddingKey, OwnedCanonicalEmbedding>,
    stores: Vec<CardEmbeddingKey>,
}

impl CardEmbeddingCache for MemoryCache {
    fn load(
        &mut self,
        key: CardEmbeddingKey,
    ) -> Result<Option<OwnedCanonicalEmbedding>, Report<CardEmbeddingError>> {
        Ok(self.values.get(&key).cloned())
    }

    fn store(
        &mut self,
        key: CardEmbeddingKey,
        embedding: &OwnedCanonicalEmbedding,
    ) -> Result<(), Report<CardEmbeddingError>> {
        self.values.insert(key, embedding.clone());
        self.stores.push(key);
        Ok(())
    }
}

#[tokio::test]
async fn cache_key_deduplicates_cards_and_preserves_input_order() {
    let alpha = card("Alpha");
    let beta = card("Beta");
    let cards = vec![alpha.clone(), beta.clone(), alpha];
    let producer = producer("openai:text-embedding-3-large:3072:f32:2026-07");
    let beta_key = CardEmbeddingKey {
        producer,
        card: beta.hash(),
    };
    let mut cache = MemoryCache::default();
    cache.values.insert(
        beta_key,
        OwnedCanonicalEmbedding::from_vec(vec![2.0; CANONICAL_DIMENSIONS])
            .expect("cache fixture should validate"),
    );
    let generator = RecordingGenerator::new(ResponseShape::Valid);

    let embedded = embed_cards(
        &generator,
        &mut cache,
        producer,
        &cards,
        NonZeroUsize::new(8).unwrap(),
    )
    .await
    .expect("cache hit and provider miss should embed");

    let calls = generator
        .calls
        .lock()
        .expect("recording mutex should not be poisoned");
    assert_eq!(calls.len(), 1);
    assert_eq!(calls[0].len(), 1);
    assert!(calls[0][0].starts_with("Relation: Alpha\n"));
    assert_eq!(cache.stores.len(), 1);
    assert_eq!(embedded[0].embedding().as_array()[0], 1.0);
    assert_eq!(embedded[1].embedding().as_array()[0], 2.0);
    assert_eq!(embedded[2].embedding().as_array()[0], 1.0);
    assert_eq!(embedded[1].key(), beta_key);
}

#[tokio::test]
async fn rejects_wrong_width_and_non_finite_provider_rows() {
    let cards = [card("Alpha")];
    let producer = producer("fixture");

    let mut cache = MemoryCache::default();
    let error = embed_cards(
        &RecordingGenerator::new(ResponseShape::Short),
        &mut cache,
        producer,
        &cards,
        NonZeroUsize::new(1).unwrap(),
    )
    .await
    .expect_err("short embedding must fail");
    assert!(matches!(
        error.current_context(),
        CardEmbeddingError::InvalidDimensions {
            card_index: 0,
            expected: CANONICAL_DIMENSIONS,
            actual,
        } if *actual == CANONICAL_DIMENSIONS - 1
    ));

    let mut cache = MemoryCache::default();
    let error = embed_cards(
        &RecordingGenerator::new(ResponseShape::NonFinite),
        &mut cache,
        producer,
        &cards,
        NonZeroUsize::new(1).unwrap(),
    )
    .await
    .expect_err("non-finite embedding must fail");
    assert!(matches!(
        error.current_context(),
        CardEmbeddingError::NonFinite {
            card_index: 0,
            component: 1_031
        }
    ));
}

fn card(title: &str) -> RelationCard {
    build_card(
        RelationCardInput {
            language: "en",
            title,
            description: None,
            aliases: &[],
            inverse: None,
            ancestors: &[],
            source_types: &[],
            target_types: &[],
            constraints: RelationConstraints {
                symmetric: None,
                transitive: None,
                single_value: None,
                distinct_values: None,
                direction: RelationDirection::SourceToTarget,
            },
            examples: &[],
            slug: None,
        },
        CardBudgets::default(),
        &HeuristicTokenCounter,
        &NaiveSentenceSplitter,
        &[],
    )
    .expect("minimal card should render")
}

fn producer(identifier: &str) -> EmbeddingProducerIdentity {
    EmbeddingProducerIdentity::new(ContentHash::digest(identifier.as_bytes()))
}
