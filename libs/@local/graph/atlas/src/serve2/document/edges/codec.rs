use alloc::alloc::Allocator;

use hashql_core::id::{Id as _, IdSlice};
use zerocopy::IntoBytes as _;

use super::{EdgeSlot, EdgesDocument, EdgesTrailer};
use crate::{
    file::generation::GenerationId,
    identity::NodeRowId,
    postgres::id::ArchivedEntityId,
    serve2::{
        codec::EncodedRowId,
        document::codec::{CborWriter, Envelope, EnvelopeWriter, Kind, encode_details},
    },
};

#[expect(
    clippy::little_endian_bytes,
    reason = "endpoint columns use little-endian integers"
)]
fn write_column<I, A: Allocator>(
    bytes: &mut Vec<u8, A>,
    values: &IdSlice<EdgeSlot, EncodedRowId<I>>,
) {
    bytes.reserve(size_of_val(values.as_raw()));
    for &value in values {
        bytes.extend_from_slice(&value.get().to_le_bytes());
    }
}

fn write_identities<A: Allocator>(
    bytes: &mut Vec<u8, A>,
    ids: &IdSlice<EdgeSlot, ArchivedEntityId>,
) {
    bytes.extend_from_slice(zerocopy::IntoBytes::as_bytes(ids.as_raw()));
}

/// One edges response in writable form.
#[derive(Debug)]
pub(crate) struct EdgesResponse<'doc> {
    /// `HEAD` key 0: the generation identity, echoing the route.
    pub generation: GenerationId,
    /// `HEAD` key 1: the variant index, echoing the route.
    pub variant: u64,
    pub document: &'doc EdgesDocument<'doc>,
}

impl EdgesResponse<'_> {
    /// Reserve allowance for the `HEAD` payload and the slot padding.
    ///
    /// `HEAD` is `map(5)` with one-byte uint keys. Its payload is a 34-byte generation echo,
    /// two uints of at most nine encoded bytes, and two one-byte booleans, reaching 60 bytes at
    /// the ceiling, and the four slots pad to 8-byte boundaries for at most 28 more. The
    /// trailer is not counted, because its extent is store-shaped text, unknowable before
    /// hydration.
    const HEAD_AND_PADDING: usize = 96;
    /// Bytes per delivered edge across the three columns: source, target, identity.
    const ROW_SIZE: usize = size_of::<EncodedRowId<NodeRowId>>()
        + size_of::<EncodedRowId<NodeRowId>>()
        + size_of::<ArchivedEntityId>();

    /// Encodes the response as one `SALTILEE` envelope.
    ///
    /// # Panics
    ///
    /// This panics when a directory offset exceeds `u32::MAX`.
    pub(crate) fn encode_into<A: Allocator>(&self, buffer: &mut Vec<u8, A>) -> Envelope {
        let count = self.document.ids.len();
        let mut envelope = EnvelopeWriter::new(Kind::EDGES, 4, buffer);

        envelope.reserve(Self::HEAD_AND_PADDING + count * Self::ROW_SIZE);
        envelope.slot(|buf| self.encode_head(buf, count as u64));
        envelope.slot(|buf| write_column(buf, &self.document.sources));
        envelope.slot(|buf| write_column(buf, &self.document.targets));
        envelope.slot(|buf| write_identities(buf, &self.document.ids));

        match &self.document.trailer {
            Some(trailer) => envelope.finish_with_trailer(|buf| Self::encode_trailer(buf, trailer)),
            None => envelope.finish(),
        }
    }

    /// Encodes the `HEAD` map: keys 0 through 4.
    fn encode_head<A: Allocator>(&self, buf: &mut Vec<u8, A>, count: u64) {
        let mut cbor = CborWriter::over(buf);
        cbor.map(5);

        cbor.uint(0);
        cbor.bytes(self.generation.as_bytes());
        cbor.uint(1);
        cbor.uint(self.variant);
        cbor.uint(2);
        cbor.uint(count);
        cbor.uint(3);
        cbor.boolean(self.document.complete);
        cbor.uint(4);
        cbor.boolean(self.document.trailer.is_some());
    }

    fn encode_trailer<A: Allocator>(buf: &mut Vec<u8, A>, trailer: &EdgesTrailer<'_>) {
        let mut cbor = CborWriter::over(buf);
        cbor.map(3);

        cbor.uint(0);
        cbor.array(trailer.representative_type_urls_interner.len() as u64);
        for url in trailer.representative_type_urls_interner.entries() {
            cbor.collect_text(url);
        }

        cbor.uint(1);
        encode_details(&mut cbor, trailer.labels.iter());

        cbor.uint(2);
        cbor.array(trailer.representative_type_urls.len() as u64);
        for &entry in &trailer.representative_type_urls {
            match entry {
                Some(index) => cbor.uint(index.as_u64()),
                None => cbor.null(),
            }
        }
    }
}
