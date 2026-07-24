//! Card embedding with cross-generation reuse.
//!
//! Every scoped type's relation card embeds once per generation into a canonical 3,072-component
//! vector; the vectors form the card-embedding table, row-aligned with the ontology stream that
//! produced the cards. A card's identity is the SHA-256 of its rendered text: equal texts embed
//! once within a generation, and rows whose text is unchanged since a prior generation are copied
//! from that generation's table without touching the provider.
//!
//! [`embed_cards`] is the entry point. It consumes finished [`Card`]s in ontology row order,
//! deduplicates by text hash, satisfies what it can from a prior generation, and submits the
//! remaining unique texts to a [`CardEmbedder`] in one call; request sizing against provider
//! ceilings is the embedder's own concern. The assembled [`CardEmbeddingTable`] serializes into two
//! array files: the `f32[T, 3072]` embedding matrix and the `u8[T, 32]` card-hash column. Card
//! texts are not published, so the hash column is the persisted key that lets the next generation
//! match its freshly rendered cards against these rows.
//!
//! A prior generation arrives as a [`CardEmbeddingView`]: borrowed columns, exactly the shape a
//! mapped pair of published files yields, so reuse reads the prior table without materializing it
//! in memory. Reuse is sound only between equal embedding contracts, so every embedder states an
//! [`EmbedderFingerprint`] and a view whose recorded fingerprint differs is ignored wholesale.

use core::{error::Error, fmt};
use std::{collections::HashMap, io};

use zerocopy::IntoBytes as _;

use crate::{
    dataset::{CANONICAL_DIMENSIONS, card::Card},
    file::array::{ArrayVariant, Dim, SizedArrayWriter},
    identity::{Identity as _, OntologyRowId},
    integrity::Sha256Digest,
    math::{AlignedVecN, BoxedVecN, MatrixN, VecN},
};

pub(crate) mod external;

#[cfg(test)]
mod tests;

/// Identity of one complete embedding contract.
///
/// The digest's preimage covers everything that determines the vector a text embeds to: provider,
/// endpoint, model identity, requested dimension, and encoding configuration. Equal fingerprints
/// promise interchangeable vectors for equal texts.
///
/// The fingerprint decides cross-generation reuse: a persisted table records the fingerprint that
/// minted it, and rows are copied out of a prior generation only under a matching fingerprint, so a
/// contract change invalidates every cached row at once.
#[derive(
    Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, serde::Serialize, serde::Deserialize,
)]
#[repr(transparent)]
#[serde(transparent)]
pub(crate) struct EmbedderFingerprint(Sha256Digest);

impl EmbedderFingerprint {
    /// Wraps the digest of an embedding-contract preimage.
    #[inline]
    #[must_use]
    pub(crate) const fn new(digest: Sha256Digest) -> Self {
        Self(digest)
    }

    /// Returns the contract digest.
    #[inline]
    #[must_use]
    pub(crate) const fn digest(self) -> Sha256Digest {
        self.0
    }
}

/// A provider turning card texts into canonical embeddings.
pub(crate) trait CardEmbedder {
    type Error;

    /// Returns the identity of the embedding contract this provider serves.
    ///
    /// See [`EmbedderFingerprint`].
    fn fingerprint(&self) -> EmbedderFingerprint;

    /// Embeds every text, returned in input order.
    ///
    /// One call covers the whole workload: an implementation splits it into as many provider
    /// requests as its own ceilings (document counts, token totals) require.
    ///
    /// # Errors
    ///
    /// Returns a provider-defined error when embedding fails; the caller treats the whole workload
    /// as failed.
    fn embed<'text>(
        &self,
        texts: impl IntoIterator<Item = &'text str, IntoIter: Send> + Send,
    ) -> impl Future<Output = Result<Vec<BoxedVecN<CANONICAL_DIMENSIONS>>, Self::Error>> + Send;
}

/// How the rows of one [`embed_cards`] run were obtained.
///
/// The counts describe unique texts: `reused + embedded` is the number of distinct card texts, and
/// rows beyond that count are duplicates resolved without provider or prior-table work. Destined
/// for the generation metadata document.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Default, serde::Serialize, serde::Deserialize)]
pub(crate) struct CardEmbeddingStats {
    /// Unique texts copied from the prior generation's table.
    pub reused: usize,
    /// Unique texts submitted to the provider.
    pub embedded: usize,
}

/// Borrowed card-embedding columns of one generation.
///
/// Row `i` holds the embedding and text hash of the card at ontology row `i`; the
/// ordinal-to-type-id mapping is the type table's. The columns are exactly what the two published
/// array files contain, so a view over mapped files reads a prior generation in place.
#[derive(Debug, Copy, Clone)]
pub(crate) struct CardEmbeddingView<'table> {
    fingerprint: EmbedderFingerprint,
    hashes: &'table [Sha256Digest],
    rows: &'table [VecN<CANONICAL_DIMENSIONS>],
}

impl<'table> CardEmbeddingView<'table> {
    /// Creates a view over row-aligned columns.
    ///
    /// `components` is the row-major embedding matrix; the view exists exactly when it holds
    /// [`CANONICAL_DIMENSIONS`] components per hash.
    #[must_use]
    pub(crate) const fn new(
        fingerprint: EmbedderFingerprint,
        hashes: &'table [Sha256Digest],
        components: &'table [f32],
    ) -> Option<Self> {
        let (rows, remainder) = components.as_chunks::<CANONICAL_DIMENSIONS>();
        if !remainder.is_empty() || rows.len() != hashes.len() {
            return None;
        }

        Some(Self {
            fingerprint,
            hashes,
            rows: VecN::wrap_slice(rows),
        })
    }

    /// Returns the fingerprint of the contract that produced every row.
    #[inline]
    #[must_use]
    pub(crate) const fn fingerprint(&self) -> EmbedderFingerprint {
        self.fingerprint
    }

    /// Returns the number of rows.
    #[inline]
    #[must_use]
    pub(crate) const fn len(&self) -> usize {
        self.hashes.len()
    }

    /// Returns whether the view has no rows.
    #[inline]
    #[must_use]
    pub(crate) const fn is_empty(&self) -> bool {
        self.hashes.is_empty()
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
    ) -> Option<&'table VecN<CANONICAL_DIMENSIONS>> {
        self.rows.get(row.usize())
    }
}

/// The owned card-embedding table one [`embed_cards`] run assembles.
///
/// The row semantics are [`CardEmbeddingView`]'s; owning the columns is what the generation under
/// construction needs before its files are written. Every read surface is on the
/// [`view`](Self::view).
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
    /// Panics when the matrix's row count differs from the hash count.
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
        let (rows, remainder) = self
            .components
            .as_components()
            .as_chunks::<CANONICAL_DIMENSIONS>();
        debug_assert!(
            remainder.is_empty(),
            "the table's columns are row-aligned by construction"
        );

        CardEmbeddingView {
            fingerprint: self.fingerprint,
            hashes: &self.hashes,
            rows: VecN::wrap_slice(rows),
        }
    }

    /// Writes the `f32[T, 3072]` embedding matrix as an array file.
    ///
    /// Returns the SHA-256 of the written bytes: the identity the repository records for the
    /// published file.
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
    /// Returns the SHA-256 of the written bytes: the identity the repository records for the
    /// published file.
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

/// [`embed_cards`] failed to produce a complete table.
#[derive(Debug)]
pub(crate) enum CardEmbeddingError<E> {
    /// The provider failed to embed the workload.
    Embedder(E),
    /// The provider returned a different number of rows than requested.
    RowCount { expected: usize, actual: usize },
    /// A returned embedding carries a non-finite component.
    NonFinite {
        row: OntologyRowId,
        component: usize,
    },
}

impl<E: fmt::Display> fmt::Display for CardEmbeddingError<E> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Embedder(error) => write!(fmt, "the embedding provider failed: {error}"),
            Self::RowCount { expected, actual } => write!(
                fmt,
                "the provider returned {actual} embeddings for {expected} texts",
            ),
            Self::NonFinite { row, component } => write!(
                fmt,
                "the embedding for ontology row {} has a non-finite component {component}",
                row.get(),
            ),
        }
    }
}

impl<E: Error + 'static> Error for CardEmbeddingError<E> {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Embedder(error) => Some(error),
            Self::RowCount { .. } | Self::NonFinite { .. } => None,
        }
    }
}

/// One distinct card text awaiting an embedding.
struct UniqueCard<'card> {
    hash: Sha256Digest,
    text: &'card str,
    /// Ontology rows carrying this text, ascending.
    rows: Vec<OntologyRowId>,
}

/// Embeds `cards` into a row-aligned table, reusing prior rows.
///
/// `cards` arrive in ontology row order and row `i` of the returned table belongs to `cards[i]`.
/// Equal texts embed once. A `prior` view serves rows whose text hash it contains, provided its
/// fingerprint equals the embedder's; the provider sees exactly the texts neither source covers, in
/// one [`embed`](CardEmbedder::embed) call, and sees nothing when every row is covered.
///
/// # Errors
///
/// Returns an error when the provider fails, changes the row count, or returns a vector with a
/// non-finite component. No partial table is produced.
pub(crate) async fn embed_cards<E: CardEmbedder + Sync>(
    embedder: &E,
    cards: &[Card],
    prior: Option<CardEmbeddingView<'_>>,
) -> Result<(CardEmbeddingTable, CardEmbeddingStats), CardEmbeddingError<E::Error>> {
    let fingerprint = embedder.fingerprint();

    let mut row_hashes = Vec::with_capacity(cards.len());
    let mut ordering = Vec::<Sha256Digest>::new();
    let mut unique = HashMap::<Sha256Digest, UniqueCard<'_>>::with_capacity(cards.len());

    for (row, card) in cards.iter().enumerate() {
        let row = OntologyRowId::from_index(row);
        let hash = Sha256Digest::of(card.card_text());
        row_hashes.push(hash);

        let entry = unique.entry(hash).or_insert_with(|| {
            ordering.push(hash);
            UniqueCard {
                hash,
                text: card.card_text(),
                rows: vec![],
            }
        });

        entry.rows.push(row);
    }

    let mut components = MatrixN::zeroed(cards.len());
    let rows = components.rows_mut();

    let mut stats = CardEmbeddingStats::default();
    let mut misses = Vec::new();

    let reusable = prior.filter(|view| view.fingerprint() == fingerprint);
    let reusable_rows: HashMap<Sha256Digest, &VecN<CANONICAL_DIMENSIONS>> =
        reusable.map_or_else(HashMap::new, |view| {
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

        stats.reused += 1;
        let card = &unique[&hash];
        for &position in &card.rows {
            *rows[position.usize()].as_array_mut() = *source.as_array();
        }
    }

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

        stats.embedded += 1;
        for &position in &card.rows {
            *rows[position.usize()].as_array_mut() = *embedding.as_array();
        }
    }

    Ok((
        CardEmbeddingTable::new(fingerprint, row_hashes, components),
        stats,
    ))
}

/// Rejects embeddings carrying non-finite components.
fn validate_finite<E>(
    embedding: &AlignedVecN<CANONICAL_DIMENSIONS>,
    row: OntologyRowId,
) -> Result<(), CardEmbeddingError<E>> {
    if embedding.is_finite() {
        return Ok(());
    }

    // Slow/cold path: find the first non-finite component
    let Some(component) = embedding
        .as_array()
        .iter()
        .position(|component| !component.is_finite())
    else {
        unreachable!()
    };

    Err(CardEmbeddingError::NonFinite { row, component })
}
