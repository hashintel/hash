//! Card embedding with cross-generation reuse.
//!
//! [`embed_cards`] produces one 3,072-component vector per [`Card`], in input row order. It groups
//! cards by the SHA-256 of their rendered text, copies matching rows from a compatible prior table,
//! and submits the remaining distinct hashes' texts to a [`CardEmbedder`] in one call. Equal texts
//! share an embedding. Hash equality is the reuse key, without a second text comparison.
//!
//! The [`CardEmbeddingTable`] writes an `f32[T, 3072]` embedding matrix and a `u8[T, 32]` card-hash
//! column, where T is the card count. Persisting text hashes instead of card texts lets a later
//! generation match freshly rendered cards against these rows. A [`CardEmbeddingView`] borrows the
//! columns, allowing reuse directly from mapped files.
//!
//! Every embedder declares an [`EmbedderFingerprint`]. A prior view participates only when its
//! fingerprint matches. Interchangeability depends on that declaration accurately identifying the
//! vector-producing contract, including any model revision that affects reuse.
//!
//! The [`Progress`] observer receives the reuse split before embedding starts. Request sizing and
//! batch reporting belong to the embedder. [`external::ExternalEmbeddingProvider`] supplies both
//! for an external generator.

use core::{error::Error, fmt};
use std::{collections::HashMap, io};

use hashql_core::id::{Id, IdSlice};
use zerocopy::IntoBytes as _;

use crate::{
    dataset::{CANONICAL_DIMENSIONS, card::Card},
    file::array::{ArrayVariant, Dim, SizedArrayWriter},
    identity::OntologyRowId,
    integrity::Sha256Digest,
    math::{AlignedVecN, BoxedVecN, MatrixN},
    progress::Progress,
};

pub(crate) mod external;

#[cfg(test)]
mod tests;

/// Identity of one complete embedding contract.
///
/// The declared contract must identify the settings that determine vector interchangeability for
/// equal texts, including the provider, endpoint, model revision, dimension, and encoding. Changing
/// the fingerprint invalidates every prior row for reuse. The digest itself does not validate the
/// declaration against the running provider.
#[derive(
    Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, serde::Serialize, serde::Deserialize,
)]
#[repr(transparent)]
#[serde(transparent)]
pub(crate) struct EmbedderFingerprint(Sha256Digest);

impl EmbedderFingerprint {
    /// Records a digest identifying the declared embedding contract.
    #[inline]
    #[must_use]
    pub(crate) const fn new(digest: Sha256Digest) -> Self {
        Self(digest)
    }
}

/// A provider turning card texts into canonical embeddings.
pub(crate) trait CardEmbedder {
    /// The failure [`embed`](Self::embed) reports.
    type Error;

    /// Returns the identity of the embedding contract this provider serves.
    ///
    /// # Implementation Note
    ///
    /// The fingerprint must satisfy [`EmbedderFingerprint`]'s interchangeability contract.
    fn fingerprint(&self) -> EmbedderFingerprint;

    /// Embeds every text, returned in input order.
    ///
    /// One call covers the whole workload. Request sizing and provider-specific limits belong to
    /// the implementation.
    ///
    /// # Implementation Note
    ///
    /// Return exactly one vector per text, in input order, under the declared fingerprint. A
    /// provider may make several requests before returning an error.
    ///
    /// # Errors
    ///
    /// Returns a provider-defined error when embedding fails. An error returns no partial vector
    /// collection.
    fn embed<'text>(
        &self,
        texts: impl IntoIterator<Item = &'text str, IntoIter: Send> + Send,
    ) -> impl Future<Output = Result<Vec<BoxedVecN<CANONICAL_DIMENSIONS>>, Self::Error>> + Send;
}

/// The reuse split over distinct card-text hashes.
///
/// For a completed [`embed_cards`] run, `reused + embedded` equals the number of distinct hashes.
/// Duplicate card rows share those embeddings. The default counts are zero.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Default, serde::Serialize, serde::Deserialize)]
pub struct CardEmbeddingStats {
    /// Distinct text hashes copied from the prior generation's table.
    pub reused: usize,
    /// Distinct text hashes requiring provider embeddings.
    pub embedded: usize,
}

/// Borrowed card-embedding columns of one generation.
///
/// Row `i` holds a card's embedding and text hash. The columns share positional rows and can borrow
/// the published array files directly. Their producer supplies the fingerprint and hash/vector
/// correspondence.
#[derive(Debug, Copy, Clone)]
pub(crate) struct CardEmbeddingView<'table> {
    fingerprint: EmbedderFingerprint,
    hashes: &'table [Sha256Digest],
    rows: &'table [AlignedVecN<CANONICAL_DIMENSIONS>],
}

impl<'table> CardEmbeddingView<'table> {
    /// Creates a view over row-aligned columns.
    ///
    /// Returns [`None`] unless there is exactly one vector per hash. The fingerprint and
    /// hash/vector correspondence are producer assertions. This constructor checks no component
    /// values.
    #[must_use]
    pub(crate) const fn new(
        fingerprint: EmbedderFingerprint,
        hashes: &'table [Sha256Digest],
        rows: &'table [AlignedVecN<CANONICAL_DIMENSIONS>],
    ) -> Option<Self> {
        if rows.len() != hashes.len() {
            return None;
        }

        Some(Self {
            fingerprint,
            hashes,
            rows,
        })
    }

    /// Returns the declared embedding-contract fingerprint.
    #[inline]
    #[must_use]
    pub(crate) const fn fingerprint(&self) -> EmbedderFingerprint {
        self.fingerprint
    }

    /// Borrows the card-text hash column.
    #[inline]
    #[must_use]
    pub(crate) const fn hashes(&self) -> &'table [Sha256Digest] {
        self.hashes
    }

    /// Returns the embedding at `row`, or `None` past the last row.
    #[must_use]
    pub(crate) const fn embedding(
        &self,
        row: OntologyRowId,
    ) -> Option<&'table AlignedVecN<CANONICAL_DIMENSIONS>> {
        self.rows.get(row.as_usize())
    }
}

/// Row-aligned card embeddings and text hashes ready for publication.
///
/// The row semantics are [`CardEmbeddingView`]'s. Construction checks equal column lengths and
/// accepts the supplied component values and fingerprint.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct CardEmbeddingTable {
    fingerprint: EmbedderFingerprint,
    hashes: Vec<Sha256Digest>,
    /// The embedding matrix, one row per hash.
    components: MatrixN<CANONICAL_DIMENSIONS>,
}

impl CardEmbeddingTable {
    /// Creates a table from row-aligned columns.
    ///
    /// # Panics
    ///
    /// This panics when the matrix's row count differs from the hash count.
    #[must_use]
    pub(crate) fn new(
        fingerprint: EmbedderFingerprint,
        hashes: Vec<Sha256Digest>,
        components: MatrixN<CANONICAL_DIMENSIONS>,
    ) -> Self {
        assert_eq!(
            components.len(),
            hashes.len(),
            "the matrix must hold one row per hash",
        );

        Self {
            fingerprint,
            hashes,
            components,
        }
    }

    /// Views the embedding matrix as its SIMD-aligned rows.
    #[inline]
    #[must_use]
    pub(crate) fn rows(&self) -> &[AlignedVecN<CANONICAL_DIMENSIONS>] {
        self.components.rows()
    }

    /// Borrows the table as a view.
    #[must_use]
    pub(crate) fn view(&self) -> CardEmbeddingView<'_> {
        CardEmbeddingView {
            fingerprint: self.fingerprint,
            hashes: &self.hashes,
            rows: self.components.rows(),
        }
    }

    /// Writes the `f32[T, 3072]` embedding matrix as an array file.
    ///
    /// Components use native byte order, recorded by the array header. Returns the SHA-256 of the
    /// written bytes. A zero-row table writes a header-only empty array.
    ///
    /// # Errors
    ///
    /// Returns an error when the underlying writer fails.
    pub(crate) fn write_embeddings_into(&self, write: impl io::Write) -> io::Result<Sha256Digest> {
        let mut writer = SizedArrayWriter::new(
            write,
            ArrayVariant::F32,
            &[
                Dim::new(self.hashes.len() as u64),
                Dim::new(CANONICAL_DIMENSIONS as u64),
            ],
        )?;
        writer.write_rows(
            self.hashes.len() as u64,
            self.components.as_components().as_bytes(),
        )?;
        writer.finish()
    }

    /// Writes the `u8[T, 32]` card-hash column as an array file.
    ///
    /// Returns the SHA-256 of the written bytes. A zero-row table writes a header-only empty array.
    ///
    /// # Errors
    ///
    /// Returns an error when the underlying writer fails.
    pub(crate) fn write_hashes_into(&self, write: impl io::Write) -> io::Result<Sha256Digest> {
        let mut writer = SizedArrayWriter::new(
            write,
            ArrayVariant::U8,
            &[Dim::new(self.hashes.len() as u64), Dim::new(32)],
        )?;
        writer.write_rows(self.hashes.len() as u64, self.hashes.as_bytes())?;
        writer.finish()
    }
}

/// A provider or vector-validation failure while assembling card embeddings.
#[derive(Debug)]
pub(crate) enum CardEmbeddingError<R, E> {
    /// The provider failed to embed the workload.
    Embedder(E),
    /// The provider returned a different number of rows than requested.
    RowCount { expected: usize, actual: usize },
    /// A newly returned embedding carries a non-finite component.
    ///
    /// `row` is the first input card with that hash, and `component` is its first non-finite
    /// component.
    NonFinite { row: R, component: usize },
}

impl<R: Id, E: fmt::Display> fmt::Display for CardEmbeddingError<R, E> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Embedder(error) => write!(fmt, "the embedding provider failed: {error}"),
            Self::RowCount { expected, actual } => write!(
                fmt,
                "the provider returned {actual} embeddings for {expected} texts",
            ),
            Self::NonFinite { row, component } => write!(
                fmt,
                "the embedding for card row {row} has a non-finite component {component}",
            ),
        }
    }
}

impl<R: Id, E: Error + 'static> Error for CardEmbeddingError<R, E> {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Embedder(error) => Some(error),
            Self::RowCount { .. } | Self::NonFinite { .. } => None,
        }
    }
}

/// The first text and all input rows sharing one card-text hash.
struct UniqueCard<'card, R> {
    text: &'card str,
    /// Card rows carrying this hash, ascending.
    rows: Vec<R>,
}

/// Embeds `cards` and returns a row-aligned table that reuses prior rows.
///
/// `cards` use their own row domain `R` and row `i` of the returned table belongs to `cards[i]`.
///
/// Equal text hashes share one embedding. A `prior` view supplies matching hashes only when its
/// fingerprint equals the embedder's. Repeated prior hashes select the last row. Reused vectors
/// copy verbatim, without a finiteness check. Supply a prior table with valid vectors and accurate
/// hash/contract metadata.
///
/// The provider receives the first text for each remaining hash, in first-occurrence order, through
/// one [`embed`](CardEmbedder::embed) call. It receives no call when every row reuses or the input
/// is empty. Newly returned vectors undergo a finiteness check before the completed table is
/// returned.
///
/// `progress` receives the split once before the provider call. Batch reports require an embedder
/// configured with its own observer, such as [`external::ExternalEmbeddingProvider`].
///
/// # Errors
///
/// Returns [`CardEmbeddingError`] for provider failure, changed row count, or newly returned
/// non-finite components, in that order. A failed run returns no partial table. Provider work
/// already performed is not rolled back.
///
/// # Panics
///
/// Panics if the output matrix's aligned allocation size exceeds `isize::MAX`.
pub(crate) async fn embed_cards<R: Id, E: CardEmbedder + Sync, P: Progress + Sync>(
    embedder: &E,
    cards: &IdSlice<R, Card>,
    prior: Option<CardEmbeddingView<'_>>,
    progress: &P,
) -> Result<(CardEmbeddingTable, CardEmbeddingStats), CardEmbeddingError<R, E::Error>> {
    let fingerprint = embedder.fingerprint();

    let mut row_hashes = Vec::with_capacity(cards.len());
    let mut ordering = Vec::<Sha256Digest>::new();
    let mut unique = HashMap::<Sha256Digest, UniqueCard<'_, R>>::with_capacity(cards.len());

    for (row, card) in cards.iter_enumerated() {
        let hash = Sha256Digest::of(card.card_text());
        row_hashes.push(hash);

        let entry = unique.entry(hash).or_insert_with(|| {
            ordering.push(hash);
            UniqueCard {
                text: card.card_text(),
                rows: vec![],
            }
        });

        entry.rows.push(row);
    }

    let mut components = MatrixN::zeroed(cards.len());
    let rows = IdSlice::<R, _>::from_raw_mut(components.rows_mut());

    let mut reused = 0;
    let mut misses = Vec::new();

    let reusable = prior.filter(|view| view.fingerprint() == fingerprint);
    let reusable_rows: HashMap<Sha256Digest, &AlignedVecN<CANONICAL_DIMENSIONS>> = reusable
        .map_or_else(HashMap::new, |view| {
            view.hashes
                .iter()
                .zip(view.rows)
                .map(|(&hash, row)| (hash, row))
                .collect()
        });

    for (index, &hash) in ordering.iter().enumerate() {
        let Some(&source) = reusable_rows.get(&hash) else {
            misses.push(index);
            continue;
        };

        reused += 1;
        let card = &unique[&hash];
        for &position in &card.rows {
            *rows[position].as_array_mut() = *source.as_array();
        }
    }

    // report the resolved workload before awaiting provider work. Only a successful return supplies
    // a table and completed stats.
    let stats = CardEmbeddingStats {
        reused,
        embedded: misses.len(),
    };
    progress.embedding_started(&stats);

    if misses.is_empty() {
        return Ok((
            CardEmbeddingTable::new(fingerprint, row_hashes, components),
            stats,
        ));
    }

    let texts = misses.iter().map(|&index| unique[&ordering[index]].text);

    let embeddings = embedder
        .embed(texts)
        .await
        .map_err(CardEmbeddingError::Embedder)?;

    if embeddings.len() != misses.len() {
        return Err(CardEmbeddingError::RowCount {
            expected: misses.len(),
            actual: embeddings.len(),
        });
    }

    for (&index, embedding) in misses.iter().zip(&embeddings) {
        let card = &unique[&ordering[index]];
        validate_finite(embedding, card.rows[0])?;

        for &position in &card.rows {
            *rows[position].as_array_mut() = *embedding.as_array();
        }
    }

    Ok((
        CardEmbeddingTable::new(fingerprint, row_hashes, components),
        stats,
    ))
}

/// Rejects an embedding's first non-finite component, identifying it by input card row.
///
/// # Errors
///
/// Returns [`CardEmbeddingError::NonFinite`] if any component is infinite or NaN.
fn validate_finite<R, E>(
    embedding: &AlignedVecN<CANONICAL_DIMENSIONS>,
    row: R,
) -> Result<(), CardEmbeddingError<R, E>> {
    if embedding.is_finite() {
        return Ok(());
    }

    // the vector-wide check found a non-finite component. Locate its index for the error.
    let Some(component) = embedding
        .as_array()
        .iter()
        .position(|component| !component.is_finite())
    else {
        unreachable!()
    };

    Err(CardEmbeddingError::NonFinite { row, component })
}
