#![expect(
    clippy::float_cmp,
    reason = "fixture vectors use exactly representable components, so placement and round-trips \
              must reproduce them bit-identically"
)]

use core::future::ready;
use std::sync::Mutex;

use zerocopy::TryFromBytes as _;

use super::{
    CardEmbedder, CardEmbeddingError, CardEmbeddingStats, CardEmbeddingView, EmbedderFingerprint,
    embed_cards,
};
use crate::{
    dataset::{CANONICAL_DIMENSIONS, OntologyRowId, card::Card},
    file::array::{ArrayVariant, FileHeader},
    integrity::{Sha256, Sha256Digest, Update as _},
    math::BoxedVecN,
};

fn fingerprint(preimage: &[u8]) -> EmbedderFingerprint {
    let mut hasher = Sha256::new();
    hasher.update(preimage);
    EmbedderFingerprint::new(hasher.finalize())
}

/// A deterministic vector for one text: component 0 is the text length
/// plus the embedder's offset, every other component is zero.
#[expect(
    clippy::cast_precision_loss,
    reason = "fixture card texts are a handful of bytes, exactly representable in f32"
)]
fn vector_for(text: &str, offset: f32) -> BoxedVecN<CANONICAL_DIMENSIONS> {
    let mut vector = BoxedVecN::zero();
    vector.as_array_mut()[0] = text.len() as f32 + offset;
    vector
}

fn component_zero(view: CardEmbeddingView<'_>, row: u64) -> f32 {
    view.embedding(OntologyRowId::new(row))
        .expect("the row should be inside the table")
        .as_array()[0]
}

/// Embeds deterministically via [`vector_for`] and records every call.
struct RecordingEmbedder {
    fingerprint: EmbedderFingerprint,
    offset: f32,
    calls: Mutex<Vec<Vec<String>>>,
}

impl RecordingEmbedder {
    fn new(preimage: &[u8], offset: f32) -> Self {
        Self {
            fingerprint: fingerprint(preimage),
            offset,
            calls: Mutex::new(Vec::new()),
        }
    }

    fn calls(&self) -> Vec<Vec<String>> {
        self.calls
            .lock()
            .expect("the fixture mutex should not be poisoned")
            .clone()
    }
}

impl CardEmbedder for RecordingEmbedder {
    type Error = !;

    fn fingerprint(&self) -> EmbedderFingerprint {
        self.fingerprint
    }

    fn embed(
        &self,
        texts: impl IntoIterator<Item: AsRef<str>> + Send,
    ) -> impl Future<Output = Result<Vec<BoxedVecN<CANONICAL_DIMENSIONS>>, Self::Error>> + Send
    {
        let texts: Vec<String> = texts
            .into_iter()
            .map(|text| text.as_ref().to_owned())
            .collect();
        self.calls
            .lock()
            .expect("the fixture mutex should not be poisoned")
            .push(texts.clone());

        ready(Ok(texts
            .iter()
            .map(|text| vector_for(text, self.offset))
            .collect()))
    }
}

/// Returns one row fewer than requested.
struct ShortEmbedder;

impl CardEmbedder for ShortEmbedder {
    type Error = !;

    fn fingerprint(&self) -> EmbedderFingerprint {
        fingerprint(b"short")
    }

    fn embed(
        &self,
        texts: impl IntoIterator<Item: AsRef<str>> + Send,
    ) -> impl Future<Output = Result<Vec<BoxedVecN<CANONICAL_DIMENSIONS>>, Self::Error>> + Send
    {
        ready(Ok(texts
            .into_iter()
            .skip(1)
            .map(|text| vector_for(text.as_ref(), 0.0))
            .collect()))
    }
}

/// Returns a NaN component in every row.
struct NanEmbedder;

impl CardEmbedder for NanEmbedder {
    type Error = !;

    fn fingerprint(&self) -> EmbedderFingerprint {
        fingerprint(b"nan")
    }

    fn embed(
        &self,
        texts: impl IntoIterator<Item: AsRef<str>> + Send,
    ) -> impl Future<Output = Result<Vec<BoxedVecN<CANONICAL_DIMENSIONS>>, Self::Error>> + Send
    {
        ready(Ok(texts
            .into_iter()
            .map(|_| {
                let mut vector = BoxedVecN::zero();
                vector.as_array_mut()[7] = f32::NAN;
                vector
            })
            .collect()))
    }
}

fn cards(texts: &[&str]) -> Vec<Card> {
    texts
        .iter()
        .map(|&text| Card::verbatim(text.to_owned()))
        .collect()
}

#[tokio::test]
#[cfg_attr(
    miri,
    ignore = "tokio's I/O driver calls foreign functions Miri cannot emulate"
)]
async fn embeds_each_unique_text_once_in_row_order() {
    let embedder = RecordingEmbedder::new(b"contract", 0.0);
    let cards = cards(&["alpha", "beta", "alpha"]);

    let (table, stats) = embed_cards(&embedder, &cards, None)
        .await
        .unwrap_or_else(|error| panic!("the fixture embedder is infallible: {error}"));

    assert_eq!(embedder.calls(), [["alpha", "beta"]]);
    assert_eq!(
        stats,
        CardEmbeddingStats {
            reused: 0,
            embedded: 2,
        }
    );

    let view = table.view();
    assert_eq!(view.len(), 3);
    assert_eq!(component_zero(view, 0), 5.0);
    assert_eq!(component_zero(view, 1), 4.0);
    assert_eq!(component_zero(view, 2), 5.0);
    assert_eq!(view.hashes()[0], view.hashes()[2]);
    assert_ne!(view.hashes()[0], view.hashes()[1]);
}

#[tokio::test]
#[cfg_attr(
    miri,
    ignore = "tokio's I/O driver calls foreign functions Miri cannot emulate"
)]
async fn reuses_prior_rows_under_an_equal_fingerprint() {
    let prior_embedder = RecordingEmbedder::new(b"contract", 0.0);
    let (prior, _) = embed_cards(&prior_embedder, &cards(&["alpha"]), None)
        .await
        .unwrap_or_else(|error| panic!("the fixture embedder is infallible: {error}"));

    // The second embedder serves the same contract but would produce
    // shifted vectors, so a row equal to the prior vector proves reuse.
    let embedder = RecordingEmbedder::new(b"contract", 100.0);
    let (table, stats) = embed_cards(&embedder, &cards(&["alpha", "beta"]), Some(prior.view()))
        .await
        .unwrap_or_else(|error| panic!("the fixture embedder is infallible: {error}"));

    assert_eq!(embedder.calls(), [["beta"]]);
    assert_eq!(
        stats,
        CardEmbeddingStats {
            reused: 1,
            embedded: 1,
        }
    );
    assert_eq!(component_zero(table.view(), 0), 5.0);
    assert_eq!(component_zero(table.view(), 1), 104.0);
}

#[tokio::test]
#[cfg_attr(
    miri,
    ignore = "tokio's I/O driver calls foreign functions Miri cannot emulate"
)]
async fn skips_the_provider_when_every_row_reuses() {
    let prior_embedder = RecordingEmbedder::new(b"contract", 0.0);
    let (prior, _) = embed_cards(&prior_embedder, &cards(&["alpha", "beta"]), None)
        .await
        .unwrap_or_else(|error| panic!("the fixture embedder is infallible: {error}"));

    let embedder = RecordingEmbedder::new(b"contract", 100.0);
    let (table, stats) = embed_cards(&embedder, &cards(&["beta", "alpha"]), Some(prior.view()))
        .await
        .unwrap_or_else(|error| panic!("the fixture embedder is infallible: {error}"));

    assert!(embedder.calls().is_empty());
    assert_eq!(
        stats,
        CardEmbeddingStats {
            reused: 2,
            embedded: 0,
        }
    );
    assert_eq!(component_zero(table.view(), 0), 4.0);
    assert_eq!(component_zero(table.view(), 1), 5.0);
}

#[tokio::test]
#[cfg_attr(
    miri,
    ignore = "tokio's I/O driver calls foreign functions Miri cannot emulate"
)]
async fn ignores_a_prior_table_from_another_contract() {
    let prior_embedder = RecordingEmbedder::new(b"contract a", 0.0);
    let (prior, _) = embed_cards(&prior_embedder, &cards(&["alpha"]), None)
        .await
        .unwrap_or_else(|error| panic!("the fixture embedder is infallible: {error}"));

    let embedder = RecordingEmbedder::new(b"contract b", 100.0);
    let (table, stats) = embed_cards(&embedder, &cards(&["alpha", "beta"]), Some(prior.view()))
        .await
        .unwrap_or_else(|error| panic!("the fixture embedder is infallible: {error}"));

    assert_eq!(embedder.calls(), [["alpha", "beta"]]);
    assert_eq!(
        stats,
        CardEmbeddingStats {
            reused: 0,
            embedded: 2,
        }
    );
    assert_eq!(component_zero(table.view(), 0), 105.0);
}

#[tokio::test]
#[cfg_attr(
    miri,
    ignore = "tokio's I/O driver calls foreign functions Miri cannot emulate"
)]
async fn rejects_a_provider_row_count_mismatch() {
    let result = embed_cards(&ShortEmbedder, &cards(&["alpha", "beta"]), None).await;

    assert!(matches!(
        result,
        Err(CardEmbeddingError::RowCount {
            expected: 2,
            actual: 1,
        })
    ));
}

#[tokio::test]
#[cfg_attr(
    miri,
    ignore = "tokio's I/O driver calls foreign functions Miri cannot emulate"
)]
async fn rejects_non_finite_components() {
    let result = embed_cards(&NanEmbedder, &cards(&["alpha"]), None).await;

    assert!(matches!(
        result,
        Err(CardEmbeddingError::NonFinite { row, component: 7 })
            if row == OntologyRowId::new(0)
    ));
}

#[tokio::test]
#[cfg_attr(
    miri,
    ignore = "tokio's I/O driver calls foreign functions Miri cannot emulate"
)]
async fn embeds_nothing_for_an_empty_card_list() {
    let embedder = RecordingEmbedder::new(b"contract", 0.0);

    let (table, stats) = embed_cards(&embedder, &[], None)
        .await
        .unwrap_or_else(|error| panic!("the fixture embedder is infallible: {error}"));

    assert!(embedder.calls().is_empty());
    assert_eq!(stats, CardEmbeddingStats::default());
    assert!(table.view().is_empty());

    let mut bytes = Vec::new();
    table
        .write_embeddings_into(&mut bytes)
        .expect("writing into a vector should not fail");
    assert_eq!(bytes.len(), FileHeader::SIZE);
}

#[test]
fn a_view_exists_exactly_for_row_aligned_columns() {
    let hashes = [text_digest("alpha"), text_digest("beta")];
    let components = vec![0.0_f32; 2 * CANONICAL_DIMENSIONS];

    let view = CardEmbeddingView::new(fingerprint(b"contract"), &hashes, &components)
        .expect("full rows per hash should form a view");
    assert_eq!(view.len(), 2);
    assert!(view.embedding(OntologyRowId::new(2)).is_none());

    assert!(
        CardEmbeddingView::new(fingerprint(b"contract"), &hashes, &components[1..]).is_none(),
        "a partial row must not form a view",
    );
    assert!(
        CardEmbeddingView::new(fingerprint(b"contract"), &hashes[..1], &components,).is_none(),
        "an extra row must not form a view",
    );
}

fn text_digest(text: &str) -> Sha256Digest {
    let mut hasher = Sha256::new();
    hasher.update(text.as_bytes());
    hasher.finalize()
}

async fn three_row_table() -> super::CardEmbeddingTable {
    let embedder = RecordingEmbedder::new(b"contract", 0.0);
    let (table, _) = embed_cards(&embedder, &cards(&["alpha", "beta", "alpha"]), None)
        .await
        .unwrap_or_else(|error| panic!("the fixture embedder is infallible: {error}"));

    table
}

#[tokio::test]
#[cfg_attr(
    miri,
    ignore = "tokio's I/O driver calls foreign functions Miri cannot emulate"
)]
#[expect(
    clippy::little_endian_bytes,
    reason = "the array format pins its data to canonical little-endian bytes"
)]
async fn writes_the_embedding_matrix_as_an_array_file() {
    let table = three_row_table().await;

    let mut bytes = Vec::new();
    let digest = table
        .write_embeddings_into(&mut bytes)
        .expect("writing into a vector should not fail");

    let header = FileHeader::try_read_from_bytes(&bytes[..FileHeader::SIZE])
        .expect("the written header should parse");
    assert_eq!(header.variant(), ArrayVariant::F32);
    let extents: Vec<u64> = header.shape().dims().iter().map(|dim| dim.get()).collect();
    assert_eq!(extents, [3, CANONICAL_DIMENSIONS as u64]);
    assert_eq!(
        header.expected_file_len(),
        Some(bytes.len() as u64),
        "the file must satisfy the format's length equation",
    );

    // Row i starts at the header boundary plus i full rows; component 0
    // carries the fixture's per-text value.
    for (row, expected) in [(0_usize, 5.0_f32), (1, 4.0), (2, 5.0)] {
        let offset = FileHeader::SIZE + row * CANONICAL_DIMENSIONS * size_of::<f32>();
        let component = f32::from_le_bytes(
            bytes[offset..offset + size_of::<f32>()]
                .try_into()
                .expect("four bytes should convert into an f32"),
        );
        assert_eq!(component, expected);
    }

    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    assert_eq!(digest, hasher.finalize());
}

#[tokio::test]
#[cfg_attr(
    miri,
    ignore = "tokio's I/O driver calls foreign functions Miri cannot emulate"
)]
async fn writes_the_hash_column_as_an_array_file() {
    let table = three_row_table().await;

    let mut bytes = Vec::new();
    let digest = table
        .write_hashes_into(&mut bytes)
        .expect("writing into a vector should not fail");

    let header = FileHeader::try_read_from_bytes(&bytes[..FileHeader::SIZE])
        .expect("the written header should parse");
    assert_eq!(header.variant(), ArrayVariant::U8);
    let extents: Vec<u64> = header.shape().dims().iter().map(|dim| dim.get()).collect();
    assert_eq!(extents, [3, 32]);
    assert_eq!(header.expected_file_len(), Some(bytes.len() as u64));

    for (row, hash) in table.view().hashes().iter().enumerate() {
        let offset = FileHeader::SIZE + row * 32;
        assert_eq!(bytes[offset..offset + 32], hash.to_bytes());
    }

    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    assert_eq!(digest, hasher.finalize());
}
