//! The edges response: `HEAD` and three edge columns as one envelope.
//!
//! An edges document carries its delivery-order columns directly -
//! the endpoint assembles them by merging the adjacency artifact over
//! the requested tiles' delivered rows and applying the rank-ordered
//! cap - so unlike the tile document nothing here slices base-order
//! arrays. The `SALTILEE` envelope has four slots: `HEAD`,
//! `EDGE_SOURCES`, `EDGE_TARGETS`, `EDGE_ROW_IDS`, every one always
//! present (a tile set without visible edges delivers present-empty
//! columns).
//!
//! The `HEAD` keeps an explicit `complete` flag: cap truncation is not
//! derivable client-side, while auth-invisible edges are not
//! truncation at all - missing is denied.
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
    /// `HEAD` key 3: `false` when the rank-ordered cap truncated the
    /// set.
    pub complete: bool,
    /// The `EDGE_SOURCES` column: node row ids, delivery order.
    pub sources: &'doc [u32],
    /// The `EDGE_TARGETS` column: node row ids, delivery order.
    pub targets: &'doc [u32],
    /// The `EDGE_ROW_IDS` column: edge row ids, delivery order.
    pub edge_rows: &'doc [u32],
    /// The hydrated detail trailer; `Some` iff the request set
    /// `includeDetailedData`.
    pub trailer: Option<EdgesTrailer<'doc>>,
}

impl EdgesResponse<'_> {
    /// Encodes the response as one `SALTILEE` envelope.
    ///
    /// # Panics
    ///
    /// Panics when the document is inconsistent: the three columns
    /// disagreeing on the edge count, or trailer arrays not covering
    /// the delivered edges.
    #[must_use]
    pub(crate) fn encode(&self) -> Vec<u8> {
        let count = self.sources.len();
        assert_eq!(
            self.targets.len(),
            count,
            "the source and target columns must cover the same edges",
        );
        assert_eq!(
            self.edge_rows.len(),
            count,
            "the source and edge-row columns must cover the same edges",
        );
        if let Some(trailer) = &self.trailer {
            trailer.check_covers(count);
        }

        let mut envelope = EnvelopeWriter::new(Kind::Edges, 4);
        envelope.present(&self.encode_head(count as u64));
        envelope.present(&column(self.sources));
        envelope.present(&column(self.targets));
        envelope.present(&column(self.edge_rows));

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

/// The edges detail trailer: four per-edge detail arrays, edge order,
/// `null` marking an edge whose entry did not resolve.
#[expect(
    clippy::struct_field_names,
    reason = "the fields mirror the wire trailer key names verbatim"
)]
#[derive(Debug)]
pub(crate) struct EdgesTrailer<'doc> {
    /// Trailer key 0.
    pub link_labels: &'doc [Option<&'doc str>],
    /// Trailer key 1.
    pub link_icons: &'doc [Option<&'doc str>],
    /// Trailer key 2.
    pub link_type_labels: &'doc [Option<&'doc str>],
    /// Trailer key 3.
    pub link_type_icons: &'doc [Option<&'doc str>],
}

impl EdgesTrailer<'_> {
    /// Asserts every detail array covers exactly the delivered edges.
    fn check_covers(&self, count: usize) {
        for (entries, name) in [
            (self.link_labels, "labels"),
            (self.link_icons, "icons"),
            (self.link_type_labels, "type labels"),
            (self.link_type_icons, "type icons"),
        ] {
            assert_eq!(
                entries.len(),
                count,
                "the trailer link {name} must cover exactly the delivered edges",
            );
        }
    }

    /// Encodes the trailer tail as one self-delimiting CBOR map.
    fn encode(&self) -> Vec<u8> {
        let mut cbor = CborWriter::new();
        cbor.map(4);

        cbor.uint(0);
        encode_details(&mut cbor, self.link_labels);
        cbor.uint(1);
        encode_details(&mut cbor, self.link_icons);
        cbor.uint(2);
        encode_details(&mut cbor, self.link_type_labels);
        cbor.uint(3);
        encode_details(&mut cbor, self.link_type_icons);

        cbor.into_bytes()
    }
}

/// Encodes one u32 column little-endian.
fn column(values: &[u32]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(values.len() * 4);
    for &value in values {
        bytes.extend_from_slice(&value.to_le_bytes());
    }

    bytes
}
