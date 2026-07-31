//! The locate response: `HEAD`, node and edge columns, and the detail trailer as one envelope.
//!
//! A locate document names its delivered set as an explicit base-position list - source first, then
//! neighbours in wire order - over the generation's base-order columns; unlike a tile's contiguous
//! ranges the set is arbitrary, so the columns gather point by point. The `SALTILEL` envelope has
//! seven slots: `HEAD`, the tile response's three node column shapes (`POSITIONS`, `ROW_IDS`,
//! `TYPE_MASK`), the edges response's endpoint columns (`EDGE_SOURCES`, `EDGE_TARGETS`), and
//! `EDGE_IDS` - the delivered edges' link-entity identities as raw 32-byte records, the only
//! identity an edge carries on the wire.
//!
//! The trailer always rides: locate IS the detail view. It interns type and property URLs
//! profile-natively - keys 0 and 1 are deduplicated, bytewise-sorted string tables; every type and
//! property reference in the later keys is a uint index into them. Properties ship for the source
//! and the delivered edges; neighbour nodes carry a label and a first type reference, and their
//! own detail is one locate away. The document's consistency laws are producer contracts and panic
//! when violated.
#![expect(
    clippy::little_endian_bytes,
    reason = "column integers are pinned little-endian by the wire contract"
)]

use hashql_core::id::IdSlice;

use super::{
    Kind,
    cbor::CborWriter,
    edges::{write_column, write_identities},
    envelope::EnvelopeWriter,
    tile::{TileCoordinate, encode_details},
};
use crate::{
    dataset::ArchivedEntityId,
    identity::{BasePosition, NodeRowId},
    integrity::Sha256Digest,
    math::Vec2,
    salt::postings::artifact::Membership,
    serve::WireRow,
};

/// One locate response in writable form.
#[derive(Debug)]
pub(crate) struct LocateResponse<'doc> {
    /// `HEAD` key 0: the generation identity, echoing the route.
    pub generation: Sha256Digest,
    /// `HEAD` key 1: the variant index, echoing the route.
    pub variant: u64,
    /// `HEAD` keys 3 and 4: the source's first visible zoom and its tile there.
    ///
    /// The client's fly-to target. The cell's own `z` is the zoom; both keys ride the wire by the
    /// pinned schema.
    pub cell: TileCoordinate,
    /// `HEAD` key 6: `false` when the locate edge cap truncated the subgraph.
    pub complete: bool,
    /// `HEAD` key 7: the source's upstream entity id, `bstr(32)`.
    ///
    /// The web uuid then the entity uuid, sixteen raw bytes each - the generation digest's
    /// untagged byte-string shape. The by-row flow's identity answer: a client that named the
    /// source by wire row id learns which entity it spotlighted.
    pub entity_id: ArchivedEntityId,
    /// `HEAD` key 8: whether the request's `coloredTypeIds` cover the source's direct types.
    ///
    /// `true` iff every direct type of the source lies in the requested set - the signal that the
    /// client's palette can name everything the source is. `false` on an empty request set and for
    /// a source the store no longer serves: coverage of an unreadable type list cannot be
    /// attested.
    pub type_ids_complete: bool,
    /// `HEAD` key 9: whether the trailer's source property map is the entity's whole deliverable
    /// set.
    ///
    /// `false` when the simple-value filter or the property cap dropped anything, and for a source
    /// the store no longer serves.
    pub properties_complete: bool,
    /// The delivered set: base positions in delivered order, source first.
    pub delivered: &'doc [BasePosition],
    /// The generation's wire-coordinate column, base order, in full.
    pub positions: &'doc IdSlice<BasePosition, Vec2>,
    /// The generation's row-id column (row by base position), in full.
    pub rows: &'doc IdSlice<BasePosition, WireRow<NodeRowId>>,
    /// Per-type membership for the request's `coloredTypeIds`, in request order.
    ///
    /// Bit `i` of every point's mask reads from `masks[i]`. `None` when the request carried no
    /// ids: the `TYPE_MASK` slot is then absent rather than empty.
    pub masks: Option<&'doc [Membership<'doc>]>,
    /// The `EDGE_SOURCES` column: node row ids, edge order.
    pub sources: &'doc [WireRow<NodeRowId>],
    /// The `EDGE_TARGETS` column: node row ids, edge order.
    pub targets: &'doc [WireRow<NodeRowId>],
    /// The `EDGE_IDS` column: link-entity identities, edge order, `bstr(32)` records.
    ///
    /// Identity is generation-frozen, so every delivered edge carries one. Edge order itself is
    /// ascending by these bytes - the delivery order is client-verifiable from the column alone.
    pub edge_ids: &'doc [ArchivedEntityId],
    /// The detail trailer; locate is the detail view, so it always rides.
    pub trailer: LocateTrailer<'doc>,
}

impl LocateResponse<'_> {
    /// Encodes the response as one `SALTILEL` envelope.
    ///
    /// # Panics
    ///
    /// Panics when the document is inconsistent: the edge columns disagreeing on the edge count,
    /// trailer arrays not covering the delivered nodes and edges, or a trailer whose intern
    /// tables or property maps break the interning laws.
    #[must_use]
    pub(crate) fn encode(&self) -> Vec<u8> {
        /// Bytes per delivered point across the node columns: an f32 pair and a row id.
        const POINT_SIZE: usize = size_of::<[f32; 2]>() + size_of::<u32>();
        /// Bytes per delivered edge across the edge columns: source, target, identity.
        const EDGE_SIZE: usize =
            size_of::<u32>() + size_of::<u32>() + size_of::<ArchivedEntityId>();

        let edges = self.sources.len();
        assert_eq!(
            self.targets.len(),
            edges,
            "the source and target columns must cover the same edges",
        );
        assert_eq!(
            self.edge_ids.len(),
            edges,
            "the source and edge-id columns must cover the same edges",
        );
        self.trailer.check_covers(self.delivered.len(), edges);

        let mut envelope = EnvelopeWriter::new(Kind::Locate, 7);
        envelope.reserve(self.delivered.len() * POINT_SIZE + edges * EDGE_SIZE);
        envelope.slot(|buf| self.encode_head(buf, edges as u64));
        envelope.slot(|buf| self.write_positions(buf));
        envelope.slot(|buf| self.write_rows(buf));
        match self.masks {
            Some(masks) => envelope.slot(|buf| self.write_masks(buf, masks)),
            None => envelope.absent(),
        }
        envelope.slot(|buf| write_column(buf, self.sources));
        envelope.slot(|buf| write_column(buf, self.targets));
        envelope.slot(|buf| write_identities(buf, self.edge_ids));

        envelope.finish_with_trailer(|buf| self.trailer.encode(buf))
    }

    /// Encodes the `HEAD` map: keys 0 through 9.
    fn encode_head(&self, buf: &mut Vec<u8>, edges: u64) {
        let mut cbor = CborWriter::over(buf);
        cbor.map(10);

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
        cbor.bytes(zerocopy::IntoBytes::as_bytes(&self.entity_id));
        cbor.uint(8);
        cbor.boolean(self.type_ids_complete);
        cbor.uint(9);
        cbor.boolean(self.properties_complete);
    }

    /// Writes the `POSITIONS` column: f32 xy pairs, delivered order.
    fn write_positions(&self, column: &mut Vec<u8>) {
        column.reserve(self.delivered.len() * 8);
        for &position in self.delivered {
            let point = self.positions[position];
            column.extend_from_slice(&point.x().to_le_bytes());
            column.extend_from_slice(&point.y().to_le_bytes());
        }
    }

    /// Writes the `ROW_IDS` column: u32 row ids, delivered order.
    fn write_rows(&self, column: &mut Vec<u8>) {
        column.reserve(self.delivered.len() * 4);
        for &position in self.delivered {
            column.extend_from_slice(&self.rows[position].get().to_le_bytes());
        }
    }

    /// Assembles the `TYPE_MASK` column.
    ///
    /// One `ceil(n/8)`-byte mask per delivered point, bit `i` LSB-first when the point carries the
    /// request's type `i` - the tile column's shape over an arbitrary delivered list, probed point
    /// by point (the set is a spotlight, never a bulk slice). A mask read as its set-bit indexes
    /// is the point's colored-type index list; the source's list is the first mask's.
    fn write_masks(&self, buf: &mut Vec<u8>, masks: &[Membership<'_>]) {
        let stride = masks.len().div_ceil(8);
        let base = buf.len();
        buf.resize(base + self.delivered.len() * stride, 0);
        let column = &mut buf[base..];

        for (bit, membership) in masks.iter().enumerate() {
            let byte = bit >> 3;
            let flag = 1_u8 << (bit & 7);

            for (point, &position) in self.delivered.iter().enumerate() {
                if membership.contains(position) {
                    column[point * stride + byte] |= flag;
                }
            }
        }
    }
}

/// The locate detail trailer.
///
/// The two intern tables first, then node detail in delivered order and link detail in edge
/// order, every type and property reference a uint index into its table.
#[derive(Debug)]
pub(crate) struct LocateTrailer<'doc> {
    /// Trailer key 0: the type intern table - every referenced versioned type URL once,
    /// bytewise-sorted.
    pub type_table: &'doc [&'doc str],
    /// Trailer key 1: the property intern table - every surviving property base URL once,
    /// bytewise-sorted.
    pub property_table: &'doc [&'doc str],
    /// Trailer key 2: labels, delivered order.
    pub labels: &'doc [Option<&'doc str>],
    /// Trailer key 3.
    ///
    /// Each delivered node's first direct type as a type-table index, delivered order. `null`
    /// marks a node the store no longer serves or whose types the store does not record.
    pub type_ids: &'doc [Option<u32>],
    /// Trailer key 4.
    ///
    /// The SOURCE's property map: keyed by uint index into the property table, keys ascending.
    /// `null` marks a source the store no longer serves. Neighbour nodes ship no properties -
    /// their detail is one locate away.
    pub properties: Option<&'doc [(u32, PropertyValue<'doc>)]>,
    /// Trailer key 5: link labels, edge order.
    pub link_labels: &'doc [Option<&'doc str>],
    /// Trailer key 6.
    ///
    /// Each delivered edge's direct types as type-table indexes, edge order, canonical type order
    /// preserved, capped by the published `locateLinkTypeIds` limit. Empty for a link the store no
    /// longer serves.
    pub link_type_ids: &'doc [Vec<u32>],
    /// Trailer key 7: per-edge type completeness, edge order.
    ///
    /// Encoded as an LSB-first bitmask; bit `e` set means edge `e`'s type list is the link's
    /// whole direct set - unset means the cap truncated it or the store no longer serves the
    /// link.
    pub link_type_ids_complete: &'doc [bool],
    /// Trailer key 8.
    ///
    /// Per-edge property maps, edge order, keyed by uint index into the property table, keys
    /// ascending, capped by the published `locateLinkProperties` limit. `null` marks a link the
    /// store no longer serves.
    pub link_properties: &'doc [Option<&'doc [(u32, PropertyValue<'doc>)]>],
    /// Trailer key 9: per-edge property completeness, edge order.
    ///
    /// Encoded as an LSB-first bitmask; bit `e` set means edge `e`'s property map is the link
    /// entity's whole deliverable set - unset means the simple-value filter or the cap dropped
    /// something, or
    /// the store no longer serves the link.
    pub link_properties_complete: &'doc [bool],
}

impl LocateTrailer<'_> {
    /// Asserts the coverage and interning laws.
    ///
    /// Node arrays cover exactly the delivered nodes, link arrays the delivered edges, the intern
    /// tables are bytewise-sorted and deduplicated, every type reference indexes into the type
    /// table, and every property map keys ascending into the property table's bounds.
    fn check_covers(&self, nodes: usize, edges: usize) {
        assert_eq!(
            self.labels.len(),
            nodes,
            "the trailer labels must cover exactly the delivered nodes",
        );
        assert_eq!(
            self.type_ids.len(),
            nodes,
            "the trailer type ids must cover exactly the delivered nodes",
        );
        for (length, name) in [
            (self.link_labels.len(), "labels"),
            (self.link_type_ids.len(), "type ids"),
            (self.link_type_ids_complete.len(), "type completeness"),
            (self.link_properties.len(), "properties"),
            (self.link_properties_complete.len(), "property completeness"),
        ] {
            assert_eq!(
                length, edges,
                "the trailer link {name} must cover exactly the delivered edges",
            );
        }

        for table in [self.type_table, self.property_table] {
            assert!(
                table.is_sorted_by(|left, right| left.as_bytes() < right.as_bytes()),
                "an intern table must be bytewise-sorted and deduplicated",
            );
        }
        let types = self.type_table.len();
        assert!(
            self.type_ids
                .iter()
                .flatten()
                .all(|&index| (index as usize) < types),
            "node type ids must index into the type table",
        );
        assert!(
            self.link_type_ids
                .iter()
                .flatten()
                .all(|&index| (index as usize) < types),
            "link type ids must index into the type table",
        );
        for entries in self
            .link_properties
            .iter()
            .flatten()
            .copied()
            .chain(self.properties)
        {
            assert!(
                entries.is_sorted_by(|left, right| left.0 < right.0),
                "property map keys must ascend",
            );
            assert!(
                entries
                    .iter()
                    .all(|&(index, _)| (index as usize) < self.property_table.len()),
                "property map keys must index into the property table",
            );
        }
    }

    /// Encodes the trailer tail as one self-delimiting CBOR map.
    fn encode(&self, buf: &mut Vec<u8>) {
        let mut cbor = CborWriter::over(buf);
        cbor.map(10);

        cbor.uint(0);
        cbor.array(self.type_table.len() as u64);
        for &url in self.type_table {
            cbor.text(url);
        }
        cbor.uint(1);
        cbor.array(self.property_table.len() as u64);
        for &url in self.property_table {
            cbor.text(url);
        }
        cbor.uint(2);
        encode_details(&mut cbor, self.labels);
        cbor.uint(3);
        cbor.array(self.type_ids.len() as u64);
        for entry in self.type_ids {
            match entry {
                Some(index) => cbor.uint(u64::from(*index)),
                None => cbor.null(),
            }
        }
        cbor.uint(4);
        encode_property_map(&mut cbor, self.properties);
        cbor.uint(5);
        encode_details(&mut cbor, self.link_labels);
        cbor.uint(6);
        cbor.array(self.link_type_ids.len() as u64);
        for indexes in self.link_type_ids {
            cbor.array(indexes.len() as u64);
            for &index in indexes {
                cbor.uint(u64::from(index));
            }
        }
        cbor.uint(7);
        bitmask(&mut cbor, self.link_type_ids_complete);
        cbor.uint(8);
        cbor.array(self.link_properties.len() as u64);
        for entries in self.link_properties {
            encode_property_map(&mut cbor, *entries);
        }
        cbor.uint(9);
        bitmask(&mut cbor, self.link_properties_complete);
    }
}

/// Encodes one property map, `null` for an entity the store no longer serves.
fn encode_property_map(cbor: &mut CborWriter<'_>, entries: Option<&[(u32, PropertyValue<'_>)]>) {
    match entries {
        Some(entries) => {
            cbor.map(entries.len() as u64);
            for &(index, ref value) in entries {
                cbor.uint(u64::from(index));
                value.encode(cbor);
            }
        }
        None => cbor.null(),
    }
}

/// Emits per-edge flags as an LSB-first bitmask byte string: bit `e` of byte `e / 8` is edge
/// `e`'s flag, packed in place.
fn bitmask(cbor: &mut CborWriter<'_>, flags: &[bool]) {
    let bytes = cbor.bytes_zeroed(flags.len().div_ceil(8));
    for (edge, &flag) in flags.iter().enumerate() {
        if flag {
            bytes[edge >> 3] |= 1 << (edge & 7);
        }
    }
}

/// One simple property value: the only shapes the wire ships.
///
/// Nested objects and arrays never survive hydration.
#[derive(Debug, Clone, PartialEq)]
pub(crate) enum PropertyValue<'doc> {
    /// A text scalar.
    Text(&'doc str),
    /// An integral scalar.
    Integer(i64),
    /// A floating scalar; store scalars are doubles and stay double on the wire.
    Float(f64),
    /// A boolean scalar.
    Boolean(bool),
    /// An explicit null the store carries.
    Null,
}

impl PropertyValue<'_> {
    /// Emits the value in the profile's encoding.
    fn encode(&self, cbor: &mut CborWriter<'_>) {
        match *self {
            Self::Text(value) => cbor.text(value),
            Self::Integer(value) => cbor.int(value),
            Self::Float(value) => cbor.f64(value),
            Self::Boolean(value) => cbor.boolean(value),
            Self::Null => cbor.null(),
        }
    }
}
