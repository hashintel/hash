//! A [`CardEmbedder`] serving the embeddings a dump already holds.
//!
//! An offline fit has no provider to call, and it does not need one: the dump's card-embedding
//! stream carries every vector the dump command minted, keyed by card-text hash and stamped with
//! the minting contract's fingerprint. [`OfflineEmbedder`] serves lookups into that stream, so
//! the fit's embedding path runs unchanged and a text the dump never embedded is a typed refusal
//! rather than a network call.

use std::collections::HashMap;

use super::{
    OfflineDataset, OfflineDatasetError,
    format::StreamKind,
    record::{ArchivedCardEmbeddingRecord, CardEmbeddingRecord},
    root,
};
use crate::{
    dataset::CANONICAL_DIMENSIONS,
    integrity::Sha256Digest,
    math::BoxedVecN,
    salt::embedding::{CardEmbedder, EmbedderFingerprint},
};

/// A requested card text is not in the dump.
///
/// The dump embedded the card texts its own render produced, so this error means the offline
/// fit renders a text the dump command never saw. Differing annotation flags are the usual
/// cause. Take a new dump with flags matching the fit's.
#[derive(Debug)]
pub(crate) struct MissingCardText {
    /// The hash of the text the dump does not hold.
    pub hash: Sha256Digest,
}

impl core::fmt::Display for MissingCardText {
    fn fmt(&self, fmt: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        write!(
            fmt,
            "the dump holds no embedding for card-text hash {}, so the fit renders a text the \
             dump command never embedded (differing annotation flags are the usual cause)",
            self.hash,
        )
    }
}

impl core::error::Error for MissingCardText {}

/// A [`CardEmbedder`] over a dump's card-embedding stream.
///
/// The embedder borrows the [`OfflineDataset`]'s archived records and owns only an index from
/// card-text hash to record position, built once at construction. Its fingerprint is the
/// manifest's, the contract that minted every vector in the stream, so the fit's reuse and
/// metadata paths see the dump command's provider identity unchanged.
#[derive(Debug)]
pub(crate) struct OfflineEmbedder<'dump> {
    fingerprint: EmbedderFingerprint,
    /// Card-text hash to position in the archived record column.
    index: HashMap<Sha256Digest, usize>,
    /// The archived card-embedding records, validated at open.
    records: &'dump [ArchivedCardEmbeddingRecord],
}

impl OfflineDataset {
    /// Builds the embedder over this dump's card-embedding stream.
    ///
    /// # Errors
    ///
    /// Returns [`OfflineDatasetError::Archive`] when the stream's archived root refuses
    /// validation, which the open already performed, so reaching it means the file changed
    /// beneath the mapping after acceptance.
    pub(crate) fn embedder(&self) -> Result<OfflineEmbedder<'_>, OfflineDatasetError> {
        let records = root::<rkyv::Archived<Vec<CardEmbeddingRecord>>>(&self.card_embeddings)
            .map_err(|source| OfflineDatasetError::Archive {
                kind: StreamKind::CardEmbeddings,
                source,
            })?
            .as_slice();

        let index = records
            .iter()
            .enumerate()
            .map(|(position, record)| (record.hash, position))
            .collect();

        Ok(OfflineEmbedder {
            fingerprint: self.manifest.embedder,
            index,
            records,
        })
    }
}

impl CardEmbedder for OfflineEmbedder<'_> {
    type Error = MissingCardText;

    fn fingerprint(&self) -> EmbedderFingerprint {
        self.fingerprint
    }

    /// Serves every text's embedding out of the dump, in input order.
    ///
    /// Each text hashes to its archived record and the vector copies out of the mapped file, so
    /// the whole workload resolves without leaving the process. The first text the dump does
    /// not hold fails the workload with [`MissingCardText`] naming its hash.
    fn embed<'text>(
        &self,
        texts: impl IntoIterator<Item = &'text str, IntoIter: Send> + Send,
    ) -> impl Future<Output = Result<Vec<BoxedVecN<CANONICAL_DIMENSIONS>>, Self::Error>> + Send
    {
        let result = texts
            .into_iter()
            .map(|text| {
                let hash = Sha256Digest::of(text);
                let position = *self.index.get(&hash).ok_or(MissingCardText { hash })?;
                Ok(self.records[position].embedding.materialize())
            })
            .collect();

        core::future::ready(result)
    }
}
