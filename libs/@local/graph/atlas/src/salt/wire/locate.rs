//! The locate response: `HEAD`, node and edge columns, and the
//! detail trailer as one envelope.
//!
//! A locate document names its delivered set as an explicit
//! base-position list - source first, then neighbours in wire order -
//! over the generation's base-order columns; unlike a tile's
//! contiguous ranges the set is arbitrary, so the columns gather
//! point by point. The `SALTILEL` envelope has seven slots: `HEAD`,
//! the tile response's three node column shapes (`POSITIONS`,
//! `ROW_IDS`, `TYPE_MASK`), and the edges response's three edge
//! column shapes (`EDGE_SOURCES`, `EDGE_TARGETS`, `EDGE_ROW_IDS`).
//!
//! The trailer carries detail for every delivered node and edge, and
//! interns property names profile-natively (WIRE 6b): key 2 is the
//! deduplicated, bytewise-sorted name table; each entry of key 3 keys
//! its map by uint index into that table, ascending. The document's
//! consistency laws are producer contracts and panic when violated.
#![expect(
    clippy::little_endian_bytes,
    reason = "column integers are pinned little-endian by the wire contract"
)]

use super::{
    Kind,
    cbor::CborWriter,
    edges::column,
    envelope::EnvelopeWriter,
    tile::{TileCoordinate, encode_details},
};
use crate::{integrity::Sha256Digest, math::Vec2, salt::postings::mapped::Membership};

/// One locate response in writable form.
#[derive(Debug)]
pub(crate) struct LocateResponse<'doc> {
    /// `HEAD` key 0: the generation identity, echoing the route.
    pub generation: Sha256Digest,
    /// `HEAD` key 1: the variant index, echoing the route.
    pub variant: u64,
    /// `HEAD` keys 3 and 4: the source's first visible zoom and its
    /// tile there - the client's fly-to target. The cell's own `z` is
    /// the zoom; both keys ride the wire by the pinned schema.
    pub cell: TileCoordinate,
    /// `HEAD` key 6: `false` when the locate edge cap truncated the
    /// subgraph.
    pub complete: bool,
    /// The delivered set: base positions in delivered order, source
    /// first.
    pub delivered: &'doc [u32],
    /// The generation's wire-coordinate column, base order, in full.
    pub positions: &'doc [Vec2],
    /// The generation's row-id column (row by base position), in full.
    pub rows: &'doc [u32],
    /// Per-type membership for the request's `coloredTypeIds`, in
    /// request order: bit `i` of every point's mask reads from
    /// `masks[i]`. `None` when the request carried no ids - the
    /// `TYPE_MASK` slot is then absent rather than empty.
    pub masks: Option<&'doc [Membership<'doc>]>,
    /// The `EDGE_SOURCES` column: node row ids, edge order.
    pub sources: &'doc [u32],
    /// The `EDGE_TARGETS` column: node row ids, edge order.
    pub targets: &'doc [u32],
    /// The `EDGE_ROW_IDS` column: edge row ids, edge order.
    pub edge_rows: &'doc [u32],
    /// The hydrated detail trailer; `Some` iff the request set
    /// `includeDetailedData` (which locate defaults to true).
    pub trailer: Option<LocateTrailer<'doc>>,
}

impl LocateResponse<'_> {
    /// Encodes the response as one `SALTILEL` envelope.
    ///
    /// # Panics
    ///
    /// Panics when the document is inconsistent: the edge columns
    /// disagreeing on the edge count, trailer arrays not covering the
    /// delivered nodes and edges, or a trailer whose intern table or
    /// property maps break the interning laws.
    #[must_use]
    pub(crate) fn encode(&self) -> Vec<u8> {
        let edges = self.sources.len();
        assert_eq!(
            self.targets.len(),
            edges,
            "the source and target columns must cover the same edges",
        );
        assert_eq!(
            self.edge_rows.len(),
            edges,
            "the source and edge-row columns must cover the same edges",
        );
        if let Some(trailer) = &self.trailer {
            trailer.check_covers(self.delivered.len(), edges);
        }

        let mut envelope = EnvelopeWriter::new(Kind::Locate, 7);
        envelope.present(&self.encode_head(edges as u64));
        envelope.present(&self.positions_column());
        envelope.present(&self.rows_column());
        match self.masks {
            Some(masks) => envelope.present(&self.mask_column(masks)),
            None => envelope.absent(),
        }
        envelope.present(&column(self.sources));
        envelope.present(&column(self.targets));
        envelope.present(&column(self.edge_rows));

        match &self.trailer {
            Some(trailer) => envelope.finish_with_trailer(&trailer.encode()),
            None => envelope.finish(),
        }
    }

    /// Encodes the `HEAD` map: keys 0 through 7.
    fn encode_head(&self, edges: u64) -> Vec<u8> {
        let mut cbor = CborWriter::new();
        cbor.map(8);

        cbor.uint(0);
        cbor.bytes(&self.generation.to_bytes());
        cbor.uint(1);
        cbor.uint(self.variant);
        cbor.uint(2);
        cbor.uint(self.delivered.len() as u64);
        cbor.uint(3);
        cbor.uint(u64::from(self.cell.z));
        cbor.uint(4);
        cbor.array(3);
        cbor.uint(u64::from(self.cell.z));
        cbor.uint(u64::from(self.cell.x));
        cbor.uint(u64::from(self.cell.y));
        cbor.uint(5);
        cbor.uint(edges);
        cbor.uint(6);
        cbor.boolean(self.complete);
        cbor.uint(7);
        cbor.boolean(self.trailer.is_some());

        cbor.into_bytes()
    }

    /// Gathers the `POSITIONS` column: f32 xy pairs, delivered order.
    fn positions_column(&self) -> Vec<u8> {
        let mut column = Vec::with_capacity(self.delivered.len() * 8);
        for &position in self.delivered {
            let point = self.positions[position as usize];
            column.extend_from_slice(&point.x().to_le_bytes());
            column.extend_from_slice(&point.y().to_le_bytes());
        }

        column
    }

    /// Gathers the `ROW_IDS` column: u32 row ids, delivered order.
    fn rows_column(&self) -> Vec<u8> {
        let mut column = Vec::with_capacity(self.delivered.len() * 4);
        for &position in self.delivered {
            column.extend_from_slice(&self.rows[position as usize].to_le_bytes());
        }

        column
    }

    /// Assembles the `TYPE_MASK` column: one `ceil(n/8)`-byte mask per
    /// delivered point, bit `i` LSB-first when the point carries the
    /// request's type `i` - the tile column's shape over an arbitrary
    /// delivered list, probed point by point (the set is a spotlight,
    /// never a bulk slice).
    fn mask_column(&self, masks: &[Membership<'_>]) -> Vec<u8> {
        let stride = masks.len().div_ceil(8);
        let mut column = vec![0_u8; self.delivered.len() * stride];

        for (bit, membership) in masks.iter().enumerate() {
            let byte = bit >> 3;
            let flag = 1_u8 << (bit & 7);

            for (point, &position) in self.delivered.iter().enumerate() {
                if membership
                    .positions_in(position..position + 1)
                    .next()
                    .is_some()
                {
                    column[point * stride + byte] |= flag;
                }
            }
        }

        column
    }
}

/// The locate detail trailer: node detail in delivered order, link
/// detail in edge order, and the property-name intern table between
/// them (WIRE 6b key order).
#[derive(Debug)]
pub(crate) struct LocateTrailer<'doc> {
    /// Trailer key 0: labels, delivered order.
    pub labels: &'doc [Option<&'doc str>],
    /// Trailer key 1: icons, delivered order.
    pub icons: &'doc [Option<&'doc str>],
    /// Trailer key 2: the intern table - every surviving property
    /// base URL once, bytewise-sorted.
    pub property_names: &'doc [&'doc str],
    /// Trailer key 3: per-node property maps, delivered order, keyed
    /// by uint index into the intern table, keys ascending. `null`
    /// marks a node the store no longer serves.
    pub properties: &'doc [Option<&'doc [(u32, PropertyValue<'doc>)]>],
    /// Trailer key 4.
    pub link_labels: &'doc [Option<&'doc str>],
    /// Trailer key 5.
    pub link_icons: &'doc [Option<&'doc str>],
    /// Trailer key 6.
    pub link_type_labels: &'doc [Option<&'doc str>],
    /// Trailer key 7.
    pub link_type_icons: &'doc [Option<&'doc str>],
}

impl LocateTrailer<'_> {
    /// Asserts the coverage and interning laws: node arrays cover
    /// exactly the delivered nodes, link arrays the delivered edges,
    /// the intern table is bytewise-sorted and deduplicated, and
    /// every property map keys ascending into the table's bounds.
    fn check_covers(&self, nodes: usize, edges: usize) {
        for (entries, name) in [(self.labels, "labels"), (self.icons, "icons")] {
            assert_eq!(
                entries.len(),
                nodes,
                "the trailer {name} must cover exactly the delivered nodes",
            );
        }
        assert_eq!(
            self.properties.len(),
            nodes,
            "the trailer properties must cover exactly the delivered nodes",
        );
        for (entries, name) in [
            (self.link_labels, "labels"),
            (self.link_icons, "icons"),
            (self.link_type_labels, "type labels"),
            (self.link_type_icons, "type icons"),
        ] {
            assert_eq!(
                entries.len(),
                edges,
                "the trailer link {name} must cover exactly the delivered edges",
            );
        }

        assert!(
            self.property_names
                .is_sorted_by(|left, right| left.as_bytes() < right.as_bytes()),
            "the intern table must be bytewise-sorted and deduplicated",
        );
        for entries in self.properties.iter().flatten() {
            assert!(
                entries.is_sorted_by(|left, right| left.0 < right.0),
                "property map keys must ascend",
            );
            assert!(
                entries
                    .iter()
                    .all(|&(index, _)| (index as usize) < self.property_names.len()),
                "property map keys must index into the intern table",
            );
        }
    }

    /// Encodes the trailer tail as one self-delimiting CBOR map.
    fn encode(&self) -> Vec<u8> {
        let mut cbor = CborWriter::new();
        cbor.map(8);

        cbor.uint(0);
        encode_details(&mut cbor, self.labels);
        cbor.uint(1);
        encode_details(&mut cbor, self.icons);
        cbor.uint(2);
        cbor.array(self.property_names.len() as u64);
        for &name in self.property_names {
            cbor.text(name);
        }
        cbor.uint(3);
        cbor.array(self.properties.len() as u64);
        for entries in self.properties {
            match entries {
                Some(entries) => {
                    cbor.map(entries.len() as u64);
                    for &(index, ref value) in *entries {
                        cbor.uint(u64::from(index));
                        value.encode(&mut cbor);
                    }
                }
                None => cbor.null(),
            }
        }
        cbor.uint(4);
        encode_details(&mut cbor, self.link_labels);
        cbor.uint(5);
        encode_details(&mut cbor, self.link_icons);
        cbor.uint(6);
        encode_details(&mut cbor, self.link_type_labels);
        cbor.uint(7);
        encode_details(&mut cbor, self.link_type_icons);

        cbor.into_bytes()
    }
}

/// One simple property value: the only shapes the wire ships (WIRE
/// 6b; nested objects and arrays never survive hydration).
#[derive(Debug, Clone, PartialEq)]
pub(crate) enum PropertyValue<'doc> {
    /// A text scalar.
    Text(&'doc str),
    /// An integral scalar.
    Integer(i64),
    /// A floating scalar; store scalars are doubles and stay double
    /// on the wire.
    Float(f64),
    /// A boolean scalar.
    Boolean(bool),
    /// An explicit null the store carries.
    Null,
}

impl PropertyValue<'_> {
    /// Emits the value in the profile's encoding.
    fn encode(&self, cbor: &mut CborWriter) {
        match *self {
            Self::Text(value) => cbor.text(value),
            Self::Integer(value) => cbor.int(value),
            Self::Float(value) => cbor.f64(value),
            Self::Boolean(value) => cbor.boolean(value),
            Self::Null => cbor.null(),
        }
    }
}
