#[cfg(test)]
mod tests;

use alloc::alloc::Allocator;

use zerocopy::IntoBytes as _;

use super::{GlobalHead, TileDocument, TileTrailer};
use crate::serve::document::codec::{
    CborWriter, ColumnWriter, Envelope, EnvelopeWriter, Kind, encode_details,
};

/// One tile response in writable form.
pub(crate) struct TileResponse<'doc> {
    pub variant: u64,
    pub document: &'doc TileDocument<'doc>,
}

impl TileResponse<'_> {
    /// Encodes the response as one `SALTILET` envelope.
    ///
    /// # Panics
    ///
    /// This panics when a directory offset exceeds `u32::MAX`.
    pub(crate) fn encode_into<A: Allocator>(&self, buffer: &mut Vec<u8, A>) -> Envelope {
        let mut envelope = EnvelopeWriter::new(Kind::TILE, 5, buffer);

        envelope.slot(|bytes| self.encode_head(bytes));
        envelope.slot(|bytes| ColumnWriter::over(bytes).positions(&self.document.positions));
        envelope.slot(|bytes| ColumnWriter::over(bytes).rows(&self.document.ids));

        match &self.document.type_masks {
            Some(masks) => envelope.slot(|bytes| ColumnWriter::over(bytes).masks(&masks.bits)),
            None => envelope.skip(),
        }

        // Slot 4 is reserved for density.
        envelope.skip();
        match &self.document.trailer {
            Some(trailer) => {
                envelope.finish_with_trailer(|bytes| Self::encode_trailer(bytes, trailer))
            }
            None => envelope.finish(),
        }
    }

    fn encode_head<A: Allocator>(&self, bytes: &mut Vec<u8, A>) {
        let document = self.document;
        let mut cbor = CborWriter::over(bytes);
        cbor.map(9 + u64::from(document.global.is_some()));

        cbor.uint(0);
        cbor.bytes(document.generation.as_bytes());

        cbor.uint(1);
        cbor.uint(self.variant);

        cbor.uint(2);
        cbor.array(3);
        cbor.uint(u64::from(document.coordinate.z.get()));
        cbor.uint(u64::from(document.coordinate.x));
        cbor.uint(u64::from(document.coordinate.y));

        cbor.uint(3);
        cbor.uint(document.mode.code());

        cbor.uint(4);
        cbor.uint(document.ids.len() as u64);

        cbor.uint(6);
        cbor.uint(u64::from(document.first_bucket.get()));

        cbor.uint(7);
        cbor.array(document.runs.len() as u64);
        for &count in &document.runs {
            cbor.uint(count as u64);
        }

        if let Some(global) = &document.global {
            cbor.uint(8);
            Self::encode_global(&mut cbor, global);
        }

        cbor.uint(9);
        cbor.uint(u64::from(document.children));

        cbor.uint(10);
        cbor.boolean(document.trailer.is_some());
    }

    fn encode_global<A: Allocator>(cbor: &mut CborWriter<'_, A>, global: &GlobalHead) {
        cbor.map(2 + u64::from(global.bounds.is_some()));

        cbor.uint(0);
        cbor.uint(global.visible);

        if let Some(bounds) = &global.bounds {
            cbor.uint(1);
            cbor.array(4);
            cbor.f32(bounds.min().x());
            cbor.f32(bounds.min().y());
            cbor.f32(bounds.max().x());
            cbor.f32(bounds.max().y());
        }

        cbor.uint(2);
        cbor.uint(global.min_resolution);
    }

    fn encode_trailer<A: Allocator>(bytes: &mut Vec<u8, A>, trailer: &TileTrailer<'_>) {
        let mut cbor = CborWriter::over(bytes);
        cbor.map(2);

        cbor.uint(0);
        encode_details(&mut cbor, trailer.labels.iter());

        cbor.uint(1);
        encode_details(&mut cbor, trailer.icons.iter());
    }
}
