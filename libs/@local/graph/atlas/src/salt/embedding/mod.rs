//! Batched relation-card embedding with content-addressed caching.
//!
//! Cache identity is the pair `(embedding producer identity, card hash)`. The
//! producer identity covers transport, model, dimension, and serialization
//! configuration rather than a mutable model name alone. Provider rows are
//! matched to cards by position, validated as finite 3,072-component vectors,
//! and retained in provider order.
//!
//! Duplicate card hashes are requested once per call. Cache hits bypass the
//! provider, and misses are submitted in bounded batches. Converting a provider
//! vector into [`OwnedCanonicalEmbedding`] reuses its allocation.

use std::{
    collections::{HashMap, hash_map::Entry},
    num::NonZeroUsize,
};

use error_stack::{Report, ResultExt as _};
use hash_graph_embeddings::EmbeddingGenerator;

use crate::salt::{
    card::RelationCard,
    hash::ContentHash,
    representation::{
        CANONICAL_DIMENSIONS, CanonicalEmbedding, OwnedCanonicalEmbedding, RepresentationError,
    },
};

mod error;

pub(crate) use self::error::CardEmbeddingError;

/// Content identity of the complete embedding producer contract.
///
/// The hashed preimage includes producer revision, endpoint, requested and
/// returned model identities, dimension, encoding format, and vector encoding.
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[repr(transparent)]
pub(crate) struct EmbeddingProducerIdentity(ContentHash);

impl EmbeddingProducerIdentity {
    /// Wraps the pinned producer-contract hash.
    #[must_use]
    #[inline]
    pub(crate) const fn new(hash: ContentHash) -> Self {
        Self(hash)
    }

    /// Returns the pinned producer-contract hash.
    #[must_use]
    #[inline]
    pub(crate) const fn content_hash(self) -> ContentHash {
        self.0
    }
}

/// Key for one canonical relation-card embedding.
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub(crate) struct CardEmbeddingKey {
    pub producer: EmbeddingProducerIdentity,
    pub card: ContentHash,
}

/// Persistent cache boundary for relation-card embeddings.
pub(crate) trait CardEmbeddingCache {
    /// Loads one validated canonical embedding.
    fn load(
        &mut self,
        key: CardEmbeddingKey,
    ) -> Result<Option<OwnedCanonicalEmbedding>, Report<CardEmbeddingError>>;

    /// Stores one validated canonical embedding under its complete cache key.
    fn store(
        &mut self,
        key: CardEmbeddingKey,
        embedding: &OwnedCanonicalEmbedding,
    ) -> Result<(), Report<CardEmbeddingError>>;
}

/// One card embedding returned in input order.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct CardEmbedding {
    key: CardEmbeddingKey,
    embedding: OwnedCanonicalEmbedding,
}

impl CardEmbedding {
    /// Returns the model-and-card cache key.
    #[must_use]
    #[inline]
    pub(crate) const fn key(&self) -> CardEmbeddingKey {
        self.key
    }

    /// Borrows the validated canonical embedding.
    #[must_use]
    #[inline]
    pub(crate) fn embedding(&self) -> CanonicalEmbedding<'_> {
        self.embedding.as_borrowed()
    }
}

#[derive(Debug)]
struct UniqueCard<'card> {
    key: CardEmbeddingKey,
    text: &'card str,
    positions: Vec<usize>,
}

/// Embeds cards in bounded batches while preserving input order.
///
/// # Errors
///
/// Returns an error when cache access or provider generation fails, when the
/// provider changes row count, or when a row has the wrong width or a
/// non-finite component.
pub(crate) async fn embed_cards(
    generator: &impl EmbeddingGenerator,
    cache: &mut impl CardEmbeddingCache,
    producer: EmbeddingProducerIdentity,
    cards: &[RelationCard],
    batch_size: NonZeroUsize,
) -> Result<Vec<CardEmbedding>, Report<CardEmbeddingError>> {
    let mut unique = Vec::<UniqueCard<'_>>::new();
    let mut by_key = HashMap::<CardEmbeddingKey, usize>::with_capacity(cards.len());
    for (position, card) in cards.iter().enumerate() {
        let key = CardEmbeddingKey {
            producer,
            card: card.hash(),
        };
        match by_key.entry(key) {
            Entry::Occupied(entry) => unique[*entry.get()].positions.push(position),
            Entry::Vacant(entry) => {
                entry.insert(unique.len());
                unique.push(UniqueCard {
                    key,
                    text: card.text(),
                    positions: vec![position],
                });
            }
        }
    }

    let mut output: Vec<Option<CardEmbedding>> =
        core::iter::repeat_with(|| None).take(cards.len()).collect();
    let mut misses = Vec::new();
    for (unique_index, card) in unique.iter().enumerate() {
        if let Some(embedding) = cache.load(card.key)? {
            distribute(&mut output, &card.positions, card.key, embedding);
        } else {
            misses.push(unique_index);
        }
    }

    for batch in misses.chunks(batch_size.get()) {
        let texts: Vec<_> = batch.iter().map(|index| unique[*index].text).collect();
        let generated = generator
            .create_embeddings(&texts)
            .await
            .change_context(CardEmbeddingError::Generation)?;
        if generated.len() != batch.len() {
            return Err(Report::new(CardEmbeddingError::UnexpectedCount {
                expected: batch.len(),
                actual: generated.len(),
            }));
        }

        for (&unique_index, embedding) in batch.iter().zip(generated) {
            let card = &unique[unique_index];
            let embedding = validate_embedding(embedding.into_vec(), card.positions[0])?;
            cache.store(card.key, &embedding)?;
            distribute(&mut output, &card.positions, card.key, embedding);
        }
    }

    Ok(output
        .into_iter()
        .map(|embedding| embedding.expect("every card should be loaded or generated"))
        .collect())
}

fn validate_embedding(
    values: Vec<f32>,
    card_index: usize,
) -> Result<OwnedCanonicalEmbedding, Report<CardEmbeddingError>> {
    let actual = values.len();
    match OwnedCanonicalEmbedding::from_vec(values) {
        Ok(embedding) => Ok(embedding),
        Err(RepresentationError::Dimensions { .. }) => {
            Err(Report::new(CardEmbeddingError::InvalidDimensions {
                card_index,
                expected: CANONICAL_DIMENSIONS,
                actual,
            }))
        }
        Err(RepresentationError::NonFinite { index }) => {
            Err(Report::new(CardEmbeddingError::NonFinite {
                card_index,
                component: index,
            }))
        }
    }
}

fn distribute(
    output: &mut [Option<CardEmbedding>],
    positions: &[usize],
    key: CardEmbeddingKey,
    embedding: OwnedCanonicalEmbedding,
) {
    let (&last, rest) = positions
        .split_last()
        .expect("a unique card should have at least one input position");
    for &position in rest {
        output[position] = Some(CardEmbedding {
            key,
            embedding: embedding.clone(),
        });
    }
    output[last] = Some(CardEmbedding { key, embedding });
}

#[cfg(test)]
mod tests;
