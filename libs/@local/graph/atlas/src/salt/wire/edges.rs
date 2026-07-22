//! The edges response: `HEAD` and three edge columns as one envelope.
//!
//! An edges document carries its delivery-order columns directly - the endpoint assembles them by
//! merging the adjacency artifact over the requested tiles' delivered rows and applying the
//! rank-ordered cap - so unlike the tile document nothing here slices base-order arrays. The
//! `SALTILEE` envelope has four slots: `HEAD`, `EDGE_SOURCES`, `EDGE_TARGETS`, `EDGE_IDS`, every
//! one always present (a tile set without visible edges delivers present-empty columns).
//!
//! An edge's wire identity is its link entity's: `EDGE_IDS` carries raw 32-byte identity records,
//! and delivery order ascends by those bytes - client-verifiable from the column alone. The
//! endpoint columns speak node row ids; no edge-scoped id domain exists on the wire.
//!
//! The `HEAD` keeps an explicit `complete` flag: cap truncation is not derivable client-side, while
//! auth-invisible edges are not truncation at all - missing is denied.
#![expect(
    clippy::little_endian_bytes,
    reason = "column integers are pinned little-endian by the wire contract"
)]

use super::{Kind, cbor::CborWriter, envelope::EnvelopeWriter, tile::encode_details};
use crate::integrity::Sha256Digest;

/// One edges response in writable form.
#[derive(Debug)]
pub(crate) struct EdgesResponse<'doc> {
    /// `HEAD` key 0: the generation identity, echoing the route.
    pub generation: Sha256Digest,
    /// `HEAD` key 1: the variant index, echoing the route.
    pub variant: u64,
    /// `HEAD` key 3: `false` when the rank-ordered cap truncated the set.
    pub complete: bool,
    /// The `EDGE_SOURCES` column: node row ids, delivery order.
    pub sources: &'doc [u32],
    /// The `EDGE_TARGETS` column: node row ids, delivery order.
    pub targets: &'doc [u32],
    /// The `EDGE_IDS` column: link-entity identities, delivery order, `bstr(32)` records.
    ///
    /// The web uuid then the entity uuid, sixteen raw bytes each, generation-frozen. Delivery
    /// order ascends by these bytes.
    pub edge_ids: &'doc [[u8; 32]],
    /// The hydrated detail trailer; `Some` iff the request set `includeDetailedData`.
    pub trailer: Option<EdgesTrailer<'doc>>,
}

impl EdgesResponse<'_> {
    /// Encodes the response as one `SALTILEE` envelope.
    ///
    /// # Panics
    ///
    /// Panics when the document is inconsistent: the three columns disagreeing on the edge count,
    /// trailer arrays not covering the delivered edges, or a trailer whose intern table breaks
    /// the interning laws.
    #[must_use]
    pub(crate) fn encode(&self) -> Vec<u8> {
        let count = self.sources.len();
        assert_eq!(
            self.targets.len(),
            count,
            "the source and target columns must cover the same edges",
        );
        assert_eq!(
            self.edge_ids.len(),
            count,
            "the source and edge-id columns must cover the same edges",
        );
        if let Some(trailer) = &self.trailer {
            trailer.check_covers(count);
        }

        let mut envelope = EnvelopeWriter::new(Kind::Edges, 4);
        envelope.present(&self.encode_head(count as u64));
        envelope.present(&column(self.sources));
        envelope.present(&column(self.targets));
        envelope.present(&identity_column(self.edge_ids));

        match &self.trailer {
            Some(trailer) => envelope.finish_with_trailer(&trailer.encode()),
            None => envelope.finish(),
        }
    }

    /// Encodes the `HEAD` map: keys 0 through 4.
    fn encode_head(&self, count: u64) -> Vec<u8> {
        let mut cbor = CborWriter::new();
        cbor.map(5);

        cbor.uint(0);
        cbor.bytes(&self.generation.to_bytes());
        cbor.uint(1);
        cbor.uint(self.variant);
        cbor.uint(2);
        cbor.uint(count);
        cbor.uint(3);
        cbor.boolean(self.complete);
        cbor.uint(4);
        cbor.boolean(self.trailer.is_some());

        cbor.into_bytes()
    }
}

/// The edges detail trailer.
///
/// The type intern table, then per-edge detail arrays in edge order; `null` marks an edge whose
/// store entry did not resolve. The bulk surface stays lean - one label and one first-type
/// reference per edge; locate is the detail view.
#[derive(Debug)]
pub(crate) struct EdgesTrailer<'doc> {
    /// Trailer key 0: the type intern table - every referenced versioned type URL once,
    /// bytewise-sorted.
    pub type_table: &'doc [&'doc str],
    /// Trailer key 1: link labels, edge order.
    pub link_labels: &'doc [Option<&'doc str>],
    /// Trailer key 2.
    ///
    /// Each edge's first direct type as a type-table index, edge order. `null` marks a link the
    /// store no longer serves or whose types the store does not record.
    pub link_type_ids: &'doc [Option<u32>],
}

impl EdgesTrailer<'_> {
    /// Asserts the coverage and interning laws.
    fn check_covers(&self, count: usize) {
        assert_eq!(
            self.link_labels.len(),
            count,
            "the trailer link labels must cover exactly the delivered edges",
        );
        assert_eq!(
            self.link_type_ids.len(),
            count,
            "the trailer link type ids must cover exactly the delivered edges",
        );
        assert!(
            self.type_table
                .is_sorted_by(|left, right| left.as_bytes() < right.as_bytes()),
            "the intern table must be bytewise-sorted and deduplicated",
        );
        assert!(
            self.link_type_ids
                .iter()
                .flatten()
                .all(|&index| (index as usize) < self.type_table.len()),
            "link type ids must index into the type table",
        );
    }

    /// Encodes the trailer tail as one self-delimiting CBOR map.
    fn encode(&self) -> Vec<u8> {
        let mut cbor = CborWriter::new();
        cbor.map(3);

        cbor.uint(0);
        cbor.array(self.type_table.len() as u64);
        for &url in self.type_table {
            cbor.text(url);
        }
        cbor.uint(1);
        encode_details(&mut cbor, self.link_labels);
        cbor.uint(2);
        cbor.array(self.link_type_ids.len() as u64);
        for entry in self.link_type_ids {
            match entry {
                Some(index) => cbor.uint(u64::from(*index)),
                None => cbor.null(),
            }
        }

        cbor.into_bytes()
    }
}

/// Encodes one u32 column little-endian.
pub(super) fn column(values: &[u32]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(values.len() * 4);
    for &value in values {
        bytes.extend_from_slice(&value.to_le_bytes());
    }

    bytes
}

/// Encodes one identity column: raw 32-byte records, concatenated.
pub(super) fn identity_column(ids: &[[u8; 32]]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(ids.len() * 32);
    for id in ids {
        bytes.extend_from_slice(id);
    }

    bytes
}
