#![expect(
    clippy::float_cmp,
    reason = "fixture vectors use exactly representable components, so placement and round-trips \
              must reproduce them bit-identically"
)]
use core::{assert_matches, future::ready};
use std::sync::Mutex;

use hashql_core::id::{IdSlice, IdVec};
use zerocopy::TryFromBytes as _;

use super::{
    CardEmbedder, CardEmbeddingError, CardEmbeddingStats, CardEmbeddingView, EmbedderFingerprint,
    embed_cards,
};
use crate::{
    dataset::{CANONICAL_DIMENSIONS, card::Card},
    file::{
        array::{ArrayVariant, PaddedFileHeader},
        region::PAGE_BYTES,
    },
    identity::OntologyRowId,
    integrity::{Sha256, Sha256Digest, Update as _},
    math::{BoxedVecN, MatrixN},
    progress::{NoProgress, Progress},
};

/// Hashes a fixture contract preimage into an embedder fingerprint.
fn fingerprint(preimage: &[u8]) -> EmbedderFingerprint {
    let mut hasher = Sha256::new();
    hasher.update(preimage);
    EmbedderFingerprint::new(hasher.finalize())
}

/// Builds a vector with the text's byte length plus `offset` in component zero.
///
/// Every other component is zero.
#[expect(
    clippy::cast_precision_loss,
    reason = "fixture card texts are a handful of bytes, exactly representable in f32"
)]
fn vector_for(text: &str, offset: f32) -> BoxedVecN<CANONICAL_DIMENSIONS> {
    let mut vector = BoxedVecN::zero();
    vector.as_array_mut()[0] = text.len() as f32 + offset;
    vector
}

/// Reads the fixture embedder's text-dependent component at `row`.
///
/// # Panics
///
/// Panics if the row is outside the table.
fn component_zero(view: CardEmbeddingView<'_>, row: u64) -> f32 {
    view.embedding(OntologyRowId::new(row))
        .expect("the row should be inside the table")
        .as_array()[0]
}

/// A deterministic fixture embedder with a call log.
///
/// # Panics
///
/// Recording or reading calls panics if the fixture mutex is poisoned.
struct RecordingEmbedder {
    fingerprint: EmbedderFingerprint,
    offset: f32,
    calls: Mutex<Vec<Vec<String>>>,
}

impl RecordingEmbedder {
    /// Creates an embedder with the named contract and component-zero offset.
    fn new(preimage: &[u8], offset: f32) -> Self {
        Self {
            fingerprint: fingerprint(preimage),
            offset,
            calls: Mutex::new(Vec::new()),
        }
    }

    /// Returns the recorded text batches in call order.
    ///
    /// # Panics
    ///
    /// Panics if the fixture mutex is poisoned.
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

    fn embed<'text>(
        &self,
        texts: impl IntoIterator<Item = &'text str, IntoIter: Send> + Send,
    ) -> impl Future<Output = Result<Vec<BoxedVecN<CANONICAL_DIMENSIONS>>, Self::Error>> + Send
    {
        let texts: Vec<String> = texts.into_iter().map(str::to_owned).collect();
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

/// A fixture embedder that omits the first requested row.
struct ShortEmbedder;

impl CardEmbedder for ShortEmbedder {
    type Error = !;

    fn fingerprint(&self) -> EmbedderFingerprint {
        fingerprint(b"short")
    }

    fn embed<'text>(
        &self,
        texts: impl IntoIterator<Item = &'text str, IntoIter: Send> + Send,
    ) -> impl Future<Output = Result<Vec<BoxedVecN<CANONICAL_DIMENSIONS>>, Self::Error>> + Send
    {
        ready(Ok(texts
            .into_iter()
            .skip(1)
            .map(|text| vector_for(text, 0.0))
            .collect()))
    }
}

/// A fixture embedder producing NaN in component seven of every row.
struct NanEmbedder;

impl CardEmbedder for NanEmbedder {
    type Error = !;

    fn fingerprint(&self) -> EmbedderFingerprint {
        fingerprint(b"nan")
    }

    fn embed<'text>(
        &self,
        texts: impl IntoIterator<Item = &'text str, IntoIter: Send> + Send,
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

/// An observer recording card-embedding reuse splits.
///
/// # Panics
///
/// Recording or reading splits panics if the fixture mutex is poisoned.
#[derive(Debug, Default)]
struct RecordingProgress {
    splits: Mutex<Vec<CardEmbeddingStats>>,
}

impl RecordingProgress {
    /// Returns the observed reuse splits in report order.
    ///
    /// # Panics
    ///
    /// Panics if the fixture mutex is poisoned.
    fn splits(&self) -> Vec<CardEmbeddingStats> {
        self.splits
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

    fn embedding_started(&self, stats: &CardEmbeddingStats) {
        self.splits
            .lock()
            .expect("the fixture mutex should not be poisoned")
            .push(*stats);
    }
}

/// Builds one verbatim fixture card per input text, in order.
fn cards(texts: &[&str]) -> IdVec<OntologyRowId, Card> {
    texts
        .iter()
        .map(|&text| Card::verbatim(text.to_owned()))
        .collect()
}

#[tokio::test]
async fn embeds_each_unique_text_once_in_row_order() {
    let embedder = RecordingEmbedder::new(b"contract", 0.0);
    let cards = cards(&["alpha", "beta", "alpha"]);

    let (table, stats) = embed_cards(&embedder, &cards, None, &NoProgress)
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
    assert_eq!(view.hashes.len(), 3);
    assert_eq!(component_zero(view, 0), 5.0);
    assert_eq!(component_zero(view, 1), 4.0);
    assert_eq!(component_zero(view, 2), 5.0);
    assert_eq!(view.hashes()[0], view.hashes()[2]);
    assert_ne!(view.hashes()[0], view.hashes()[1]);
}

#[tokio::test]
async fn reuses_prior_rows_under_an_equal_fingerprint() {
    let prior_embedder = RecordingEmbedder::new(b"contract", 0.0);
    let (prior, _) = embed_cards(&prior_embedder, &cards(&["alpha"]), None, &NoProgress)
        .await
        .unwrap_or_else(|error| panic!("the fixture embedder is infallible: {error}"));

    // the fixture deliberately reuses the fingerprint with a different offset to distinguish a
    // copied vector from a fresh one.
    let embedder = RecordingEmbedder::new(b"contract", 100.0);
    let (table, stats) = embed_cards(
        &embedder,
        &cards(&["alpha", "beta"]),
        Some(prior.view()),
        &NoProgress,
    )
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
async fn the_resolved_split_reaches_the_observer_before_the_provider_does() {
    let prior_embedder = RecordingEmbedder::new(b"contract", 0.0);
    let (prior, _) = embed_cards(&prior_embedder, &cards(&["alpha"]), None, &NoProgress)
        .await
        .unwrap_or_else(|error| panic!("the fixture embedder is infallible: {error}"));

    let progress = RecordingProgress::default();
    let embedder = RecordingEmbedder::new(b"contract", 100.0);
    let (_, stats) = embed_cards(
        &embedder,
        &cards(&["alpha", "beta"]),
        Some(prior.view()),
        &progress,
    )
    .await
    .unwrap_or_else(|error| panic!("the fixture embedder is infallible: {error}"));

    assert_eq!(
        progress.splits(),
        [CardEmbeddingStats {
            reused: 1,
            embedded: 1,
        }]
    );
    assert_eq!(progress.splits(), [stats]);
}

#[tokio::test]
async fn a_wholly_reused_workload_still_reports_its_split() {
    let prior_embedder = RecordingEmbedder::new(b"contract", 0.0);
    let (prior, _) = embed_cards(
        &prior_embedder,
        &cards(&["alpha", "beta"]),
        None,
        &NoProgress,
    )
    .await
    .unwrap_or_else(|error| panic!("the fixture embedder is infallible: {error}"));

    let progress = RecordingProgress::default();
    let embedder = RecordingEmbedder::new(b"contract", 100.0);
    embed_cards(
        &embedder,
        &cards(&["alpha", "beta"]),
        Some(prior.view()),
        &progress,
    )
    .await
    .unwrap_or_else(|error| panic!("the fixture embedder is infallible: {error}"));

    assert_eq!(embedder.calls(), [] as [Vec<String>; 0]);
    assert_eq!(
        progress.splits(),
        [CardEmbeddingStats {
            reused: 2,
            embedded: 0,
        }]
    );
}

#[tokio::test]
async fn skips_the_provider_when_every_row_reuses() {
    let prior_embedder = RecordingEmbedder::new(b"contract", 0.0);
    let (prior, _) = embed_cards(
        &prior_embedder,
        &cards(&["alpha", "beta"]),
        None,
        &NoProgress,
    )
    .await
    .unwrap_or_else(|error| panic!("the fixture embedder is infallible: {error}"));

    let embedder = RecordingEmbedder::new(b"contract", 100.0);
    let (table, stats) = embed_cards(
        &embedder,
        &cards(&["beta", "alpha"]),
        Some(prior.view()),
        &NoProgress,
    )
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
async fn ignores_a_prior_table_from_another_contract() {
    let prior_embedder = RecordingEmbedder::new(b"contract a", 0.0);
    let (prior, _) = embed_cards(&prior_embedder, &cards(&["alpha"]), None, &NoProgress)
        .await
        .unwrap_or_else(|error| panic!("the fixture embedder is infallible: {error}"));

    let embedder = RecordingEmbedder::new(b"contract b", 100.0);
    let (table, stats) = embed_cards(
        &embedder,
        &cards(&["alpha", "beta"]),
        Some(prior.view()),
        &NoProgress,
    )
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
async fn rejects_a_provider_row_count_mismatch() {
    let result = embed_cards(
        &ShortEmbedder,
        &cards(&["alpha", "beta"]),
        None,
        &NoProgress,
    )
    .await;

    assert_matches!(
        result,
        Err(CardEmbeddingError::RowCount {
            expected: 2,
            actual: 1,
        })
    );
}

#[tokio::test]
async fn rejects_non_finite_components() {
    let result = embed_cards(&NanEmbedder, &cards(&["alpha"]), None, &NoProgress).await;

    assert_matches!(
        result,
        Err(CardEmbeddingError::NonFinite { row, component: 7 })
            if row == OntologyRowId::new(0)
    );
}

#[tokio::test]
async fn embeds_nothing_for_an_empty_card_list() {
    let embedder = RecordingEmbedder::new(b"contract", 0.0);

    let (table, stats) = embed_cards(
        &embedder,
        IdSlice::<OntologyRowId, Card>::empty(),
        None,
        &NoProgress,
    )
    .await
    .unwrap_or_else(|error| panic!("the fixture embedder is infallible: {error}"));

    assert!(embedder.calls().is_empty());
    assert_eq!(stats, CardEmbeddingStats::default());
    assert!(table.view().hashes.is_empty());

    let mut bytes = Vec::new();
    table
        .write_embeddings_into(&mut bytes)
        .expect("writing into a vector should not fail");
    assert_eq!(bytes.len(), PAGE_BYTES);
}

#[test]
fn view_exists_exactly_for_row_aligned_columns() {
    let hashes = [text_digest("alpha"), text_digest("beta")];
    let matrix = MatrixN::<CANONICAL_DIMENSIONS>::zeroed(2);
    let rows = matrix.rows();

    let view = CardEmbeddingView::new(fingerprint(b"contract"), &hashes, rows)
        .expect("one row per hash should form a view");
    assert_eq!(view.hashes.len(), 2);
    assert!(view.embedding(OntologyRowId::new(2)).is_none());

    assert!(
        CardEmbeddingView::new(fingerprint(b"contract"), &hashes[..1], rows).is_none(),
        "an extra row must not form a view",
    );
    assert!(
        CardEmbeddingView::new(fingerprint(b"contract"), &hashes, &rows[..1]).is_none(),
        "a missing row must not form a view",
    );
}

/// Computes the SHA-256 digest used to key a card's text.
fn text_digest(text: &str) -> Sha256Digest {
    let mut hasher = Sha256::new();
    hasher.update(text.as_bytes());
    hasher.finalize()
}

/// Embeds `alpha`, `beta`, `alpha` with the recording fixture provider.
async fn three_row_table() -> super::CardEmbeddingTable {
    let embedder = RecordingEmbedder::new(b"contract", 0.0);
    let (table, _) = embed_cards(
        &embedder,
        &cards(&["alpha", "beta", "alpha"]),
        None,
        &NoProgress,
    )
    .await
    .unwrap_or_else(|error| panic!("the fixture embedder is infallible: {error}"));

    table
}

#[tokio::test]
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

    let header = PaddedFileHeader::try_ref_from_bytes(&bytes[..PAGE_BYTES])
        .expect("the written header should parse");
    assert_eq!(header.variant(), ArrayVariant::F32);
    let extents: Vec<u64> = header.shape.dims().iter().map(|dim| dim.get()).collect();
    assert_eq!(extents, [3, CANONICAL_DIMENSIONS as u64]);
    assert_eq!(
        header.expected_file_len(),
        Some(bytes.len() as u64),
        "the file must satisfy the format's length equation",
    );

    // row i starts at the header boundary plus i full rows. Component zero carries the fixture's
    // text-dependent value.
    for (row, expected) in [(0_usize, 5.0_f32), (1, 4.0), (2, 5.0)] {
        let offset = PAGE_BYTES + row * CANONICAL_DIMENSIONS * size_of::<f32>();
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
async fn writes_the_hash_column_as_an_array_file() {
    let table = three_row_table().await;

    let mut bytes = Vec::new();
    let digest = table
        .write_hashes_into(&mut bytes)
        .expect("writing into a vector should not fail");

    let header = PaddedFileHeader::try_ref_from_bytes(&bytes[..PAGE_BYTES])
        .expect("the written header should parse");
    assert_eq!(header.variant(), ArrayVariant::U8);
    let extents: Vec<u64> = header.shape.dims().iter().map(|dim| dim.get()).collect();
    assert_eq!(extents, [3, 32]);
    assert_eq!(header.expected_file_len(), Some(bytes.len() as u64));

    for (row, hash) in table.view().hashes().iter().enumerate() {
        let offset = PAGE_BYTES + row * 32;
        assert_eq!(bytes[offset..offset + 32], hash.to_bytes());
    }

    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    assert_eq!(digest, hasher.finalize());
}
