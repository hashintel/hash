use alloc::alloc::Allocator;

use hashql_core::id::Id as _;
use zerocopy::IntoBytes as _;

use super::{
    LocateDocument,
    trailer::{LocateTrailer, PropertyMap},
};
use crate::serve2::{
    document::codec::{CborWriter, ColumnWriter, Envelope, EnvelopeWriter, Kind, encode_details},
    hydrate::scalar::ScalarValue,
};

/// One locate response in writable form.
pub(crate) struct LocateResponse<'doc> {
    pub variant: u64,
    pub document: &'doc LocateDocument<'doc>,
}

impl LocateResponse<'_> {
    /// Encodes the response as one `SALTILEL` envelope.
    ///
    /// # Panics
    ///
    /// This panics when a directory offset exceeds `u32::MAX`.
    pub(crate) fn encode_into<A: Allocator>(&self, buffer: &mut Vec<u8, A>) -> Envelope {
        let mut envelope = EnvelopeWriter::new(Kind::LOCATE, 7, buffer);

        envelope.slot(|bytes| self.encode_head(bytes));
        envelope.slot(|bytes| ColumnWriter::over(bytes).positions(&self.document.positions));
        envelope.slot(|bytes| ColumnWriter::over(bytes).rows(&self.document.ids));

        match &self.document.type_masks {
            Some(masks) => envelope.slot(|bytes| ColumnWriter::over(bytes).masks(&masks.bits)),
            None => envelope.skip(),
        }

        envelope.slot(|bytes| ColumnWriter::over(bytes).rows(&self.document.edge_sources));
        envelope.slot(|bytes| ColumnWriter::over(bytes).rows(&self.document.edge_targets));
        envelope.slot(|bytes| ColumnWriter::over(bytes).identities(&self.document.edge_ids));

        envelope.finish_with_trailer(|bytes| Self::encode_trailer(bytes, &self.document.trailer))
    }

    fn encode_head<A: Allocator>(&self, bytes: &mut Vec<u8, A>) {
        let document = self.document;
        let mut cbor = CborWriter::over(bytes);
        cbor.map(10);

        cbor.uint(0);
        cbor.bytes(document.generation.as_bytes());

        cbor.uint(1);
        cbor.uint(self.variant);

        cbor.uint(2);
        cbor.uint(document.ids.len() as u64);

        cbor.uint(3);
        cbor.uint(u64::from(document.coordinate.z.get()));

        cbor.uint(4);
        cbor.array(3);
        cbor.uint(u64::from(document.coordinate.z.get()));
        cbor.uint(u64::from(document.coordinate.x));
        cbor.uint(u64::from(document.coordinate.y));

        cbor.uint(5);
        cbor.uint(document.edge_ids.len() as u64);

        cbor.uint(6);
        cbor.boolean(document.complete);

        cbor.uint(7);
        cbor.bytes(document.entity_id.as_bytes());

        cbor.uint(8);
        cbor.boolean(document.trailer.type_ids_complete);

        cbor.uint(9);
        cbor.boolean(document.trailer.properties_complete);
    }

    fn encode_properties<A: Allocator>(
        cbor: &mut CborWriter<'_, A>,
        properties: Option<&PropertyMap>,
    ) {
        let Some(PropertyMap(properties)) = properties else {
            cbor.null();
            return;
        };
        cbor.map(properties.len() as u64);
        for (index, value) in properties {
            cbor.uint(index.as_u64());
            match value {
                ScalarValue::String(value) => cbor.text(value),
                ScalarValue::Integer(value) => cbor.int(*value),
                ScalarValue::Float(value) => cbor.f64(*value),
                ScalarValue::Bool(value) => cbor.boolean(*value),
                ScalarValue::Null => cbor.null(),
            }
        }
    }

    fn encode_trailer<A: Allocator>(bytes: &mut Vec<u8, A>, trailer: &LocateTrailer<'_>) {
        let mut cbor = CborWriter::over(bytes);
        cbor.map(10);

        cbor.uint(0);
        cbor.array(trailer.type_urls.len() as u64);
        for url in trailer.type_urls.entries() {
            cbor.collect_text(url);
        }

        cbor.uint(1);
        cbor.array(trailer.property_urls.len() as u64);
        for url in trailer.property_urls.entries() {
            cbor.text(url.as_str());
        }

        cbor.uint(2);
        encode_details(&mut cbor, trailer.labels.iter());

        cbor.uint(3);
        cbor.array(trailer.representative_type_urls.len() as u64);
        for &index in &trailer.representative_type_urls {
            match index {
                Some(index) => cbor.uint(index.as_u64()),
                None => cbor.null(),
            }
        }

        cbor.uint(4);
        Self::encode_properties(&mut cbor, trailer.properties.as_ref());

        cbor.uint(5);
        encode_details(&mut cbor, trailer.link_labels.iter());

        cbor.uint(6);
        cbor.array(trailer.link_type_urls.len() as u64);
        for indexes in &trailer.link_type_urls {
            cbor.array(indexes.len() as u64);
            for &index in indexes {
                cbor.uint(index.as_u64());
            }
        }

        cbor.uint(7);
        cbor.bytes(trailer.link_type_urls_complete.words().as_bytes());

        cbor.uint(8);
        cbor.array(trailer.link_properties.len() as u64);
        for properties in &trailer.link_properties {
            Self::encode_properties(&mut cbor, properties.as_ref());
        }

        cbor.uint(9);
        cbor.bytes(trailer.link_properties_complete.words().as_bytes());
    }
}
