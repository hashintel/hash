//! The edges response: `HEAD` and three edge columns as one envelope.
//!
//! An edges document carries its delivery-order columns directly. The endpoint assembles them by
//! merging the adjacency artifact over the requested tiles' delivered rows and applying the
//! rank-ordered cap, so nothing here slices base-order arrays the way the tile document does. The
//! `SALTILEE` envelope has four slots: `HEAD`, `EDGE_SOURCES`, `EDGE_TARGETS`, `EDGE_IDS`, every
//! one always present (a tile set without visible edges delivers present-empty columns).
//!
//! An edge's wire identity is its link entity's: `EDGE_IDS` carries raw 32-byte identity records,
//! and delivery order ascends by those bytes - client-verifiable from the column alone. The
//! endpoint columns speak node row ids, and the wire has no edge-scoped id domain.
//!
//! The `HEAD` keeps an explicit `complete` flag, because cap truncation is not derivable
//! client-side. Auth-invisible edges are not truncation at all: a missing edge means authorization
//! denied it.
#![expect(
    clippy::little_endian_bytes,
    reason = "column integers are pinned little-endian by the wire contract"
)]

use alloc::borrow::Cow;

use hashql_core::id::{Id as _, IdSlice};
use type_system::ontology::id::VersionedUrl;

use super::{Kind, cbor::CborWriter, envelope::EnvelopeWriter, tile::encode_details};
use crate::{
    dataset::auxiliary::Label,
    integrity::Sha256Digest,
    postgres::id::ArchivedEntityId,
    serve::{TableIndex, WireRow, hydrate::EdgeSlot, neighbourhood::EdgeColumns},
};

/// One edges response in writable form.
#[derive(Debug)]
pub(crate) struct EdgesResponse<'doc> {
    /// `HEAD` key 0: the generation identity, echoing the route.
    pub generation: Sha256Digest,
    /// `HEAD` key 1: the variant index, echoing the route.
    pub variant: u64,
    /// `HEAD` key 3: `false` when the rank-ordered cap truncated the set.
    pub complete: bool,
    /// The delivered edges in column form: `EDGE_SOURCES`, `EDGE_TARGETS` and `EDGE_IDS`.
    ///
    /// `EDGE_IDS` carries `bstr(32)` records - the web uuid then the entity uuid, sixteen raw
    /// bytes each, generation-frozen - and delivery order ascends by those bytes.
    pub edges: &'doc EdgeColumns,
    /// The hydrated detail trailer, `Some` iff the request set `detail: "auxiliary"`.
    pub trailer: Option<EdgesTrailer<'doc>>,
}

impl EdgesResponse<'_> {
    /// Encodes the response as one `SALTILEE` envelope.
    ///
    /// # Panics
    ///
    /// This panics when trailer arrays do not cover the delivered edges.
    #[must_use]
    pub(crate) fn encode(&self) -> Vec<u8> {
        /// Bytes per delivered edge across the three columns: source, target, identity.
        const ROW_SIZE: usize = size_of::<u32>() + size_of::<u32>() + size_of::<ArchivedEntityId>();
        /// Reserve allowance for the `HEAD` payload and the slot padding.
        ///
        /// `HEAD` is `map(5)` with one-byte uint keys. Its payload is a 34-byte generation echo,
        /// two uints of at most nine encoded bytes, and two one-byte booleans, reaching 60 bytes at
        /// the ceiling, and the four slots pad to 8-byte boundaries for at most 28 more. The
        /// trailer is not counted, because its extent is store-shaped text, unknowable before
        /// hydration.
        const HEAD_AND_PADDING: usize = 96;

        let count = self.edges.count();
        if let Some(trailer) = &self.trailer {
            trailer.debug_assert_invariants(count);
        }

        let mut envelope = EnvelopeWriter::new(Kind::Edges, 4);

        envelope.reserve(HEAD_AND_PADDING + count * ROW_SIZE);
        envelope.slot(|buf| self.encode_head(buf, count as u64));
        envelope.slot(|buf| write_column(buf, self.edges.sources()));
        envelope.slot(|buf| write_column(buf, self.edges.targets()));
        envelope.slot(|buf| write_identities(buf, self.edges.ids()));

        match &self.trailer {
            Some(trailer) => envelope.finish_with_trailer(|buf| trailer.encode(buf)),
            None => envelope.finish(),
        }
    }

    /// Encodes the `HEAD` map: keys 0 through 4.
    fn encode_head(&self, buf: &mut Vec<u8>, count: u64) {
        let mut cbor = CborWriter::over(buf);
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
    }
}

/// The edges detail trailer.
///
/// The type intern table comes first, then per-edge detail arrays in edge order. A label `null`
/// marks a link whose served display records no label text, and a representative-type `null`
/// marks one the store did not resolve. The bulk surface stays lean, with one label and one
/// representative-type reference per edge, and locate is the detail view.
#[derive(Debug)]
pub(crate) struct EdgesTrailer<'trailer> {
    /// Trailer key 0: the type intern table - every referenced versioned type URL once,
    /// bytewise-sorted.
    pub type_table: &'trailer IdSlice<TableIndex<VersionedUrl>, Cow<'trailer, str>>,
    /// Trailer key 1: link labels, edge order.
    ///
    /// Labels resolve in process, captured display first: fitted and delta links alike read the
    /// display the server captured at their currently served edition whenever it holds one, and
    /// a fitted link with no capture reads the generation's own payload. `null` marks a link
    /// whose served display records no label text.
    pub link_labels: &'trailer IdSlice<EdgeSlot, &'trailer Label>,
    /// Trailer key 2.
    ///
    /// Each edge's representative type as a type-table index, edge order.
    /// `null` marks a reference whose type no longer exists in the store, and an empty-shaped
    /// trailer after a failed hydration reads null throughout.
    pub link_type_ids: &'trailer IdSlice<EdgeSlot, Option<TableIndex<VersionedUrl>>>,
}

impl EdgesTrailer<'_> {
    /// Asserts that the trailer arrays cover the delivered edges.
    ///
    /// Coverage is the one trailer law the types do not carry, since the arrays travel as
    /// separate slices. Every check is a `debug_assert`, so release builds compile this to
    /// nothing.
    fn debug_assert_invariants(&self, count: usize) {
        debug_assert_eq!(
            self.link_labels.len(),
            count,
            "the trailer link labels must cover exactly the delivered edges",
        );
        debug_assert_eq!(
            self.link_type_ids.len(),
            count,
            "the trailer link type ids must cover exactly the delivered edges",
        );
    }

    /// Encodes the trailer tail as one self-delimiting CBOR map.
    fn encode(&self, buf: &mut Vec<u8>) {
        let mut cbor = CborWriter::over(buf);
        cbor.map(3);

        cbor.uint(0);
        cbor.array(self.type_table.len() as u64);
        for url in self.type_table {
            cbor.text(url);
        }

        cbor.uint(1);
        encode_details(&mut cbor, self.link_labels.iter());

        cbor.uint(2);
        cbor.array(self.link_type_ids.len() as u64);
        for entry in self.link_type_ids {
            match entry {
                Some(index) => cbor.uint(index.as_u64()),
                None => cbor.null(),
            }
        }
    }
}

/// Writes one u32 column little-endian.
pub(super) fn write_column<I>(bytes: &mut Vec<u8>, values: &IdSlice<EdgeSlot, WireRow<I>>) {
    bytes.reserve(size_of_val(values.as_raw()));
    for &value in values {
        bytes.extend_from_slice(&value.get().to_le_bytes());
    }
}

/// Writes one identity column: raw 32-byte records, concatenated.
///
/// The records are contiguous in memory, so one copy writes the whole column.
pub(super) fn write_identities(bytes: &mut Vec<u8>, ids: &IdSlice<EdgeSlot, ArchivedEntityId>) {
    bytes.extend_from_slice(zerocopy::IntoBytes::as_bytes(ids.as_raw()));
}
