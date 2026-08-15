//! The locate response: `HEAD`, node and edge columns, and the detail trailer as one envelope.
//!
//! A locate document names its delivered set as an explicit row list - source first, then
//! neighbours in wire order - each row in the domain that publishes it. Fitted rows gather
//! from the generation's base-order columns, and placed arrivals gather from the view's
//! arrival table. Unlike a tile's contiguous ranges the set is arbitrary, so the columns gather
//! point by point. The `SALTILEL` envelope has
//! seven slots: `HEAD`, the tile response's three node column shapes (`POSITIONS`, `ROW_IDS`,
//! `TYPE_MASK`), the edges response's endpoint columns (`EDGE_SOURCES`, `EDGE_TARGETS`), and
//! `EDGE_IDS` - the delivered edges' link-entity identities as raw 32-byte records, the only
//! identity an edge carries on the wire.
//!
//! Every locate document includes the detail trailer, because locate is the detail view. It interns
//! type and property URLs profile-natively. Keys 0 and 1 are string tables that list every
//! referenced URL once in bytewise order, and every type and property reference in the later keys
//! is a uint index into them. The source and the delivered edges get property maps. Neighbour nodes
//! carry a label and a first type reference, and their own detail is one locate away. The
//! document's consistency laws are producer contracts and panic when violated.
#![expect(
    clippy::little_endian_bytes,
    reason = "column integers are pinned little-endian by the wire contract"
)]

use alloc::borrow::Cow;

use hashql_core::id::{Id as _, IdSlice};
use type_system::ontology::id::{BaseUrl, VersionedUrl};
use zerocopy::IntoBytes as _;

use super::{
    Kind,
    cbor::CborWriter,
    edges::{write_column, write_identities},
    envelope::EnvelopeWriter,
    tile::{TileCoordinate, encode_details},
};
use crate::{
    bitset::DenseBitSlice,
    dataset::{auxiliary::Label, postgres::id::ArchivedEntityId},
    identity::{BasePosition, NodeRowId},
    integrity::Sha256Digest,
    math::Vec2,
    salt::postings::artifact::Membership,
    serve::{
        TableIndex, WireRow,
        hydrate::{EdgeSlot, NodeSlot},
        neighbourhood::EdgeColumns,
        schedule::{ArrivalIndex, ArrivalRow, ViewRow},
    },
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
    /// untagged byte-string shape. A client that named the source by wire row id learns from this
    /// key which entity it spotlighted.
    pub entity_id: ArchivedEntityId,
    /// `HEAD` key 8: whether the request's `coloredTypeIds` cover the source's direct types.
    ///
    /// `true` when the source records at least one direct type and every one of them names an
    /// entry in the requested set - the signal that the client's palette can name everything the
    /// source is. Every other case reads `false`. A source the store no longer serves and a source
    /// with no recorded types both leave a type list the server cannot attest, and a request set
    /// that resolves no entry covers nothing.
    pub type_ids_complete: bool,
    /// `HEAD` key 9: whether the trailer's source property map is the entity's whole deliverable
    /// set.
    ///
    /// `false` when the scalar-value filter or the property cap dropped anything, and for a source
    /// the store no longer serves.
    pub properties_complete: bool,
    /// The delivered rows in delivered order, source first, each in the domain that publishes
    /// it.
    pub delivered: &'doc IdSlice<NodeSlot, ViewRow>,
    /// The entry cohort's arrivals, addressed by the delivered arrival rows.
    ///
    /// Empty when the view holds no admitted arrival.
    pub arrivals: &'doc IdSlice<ArrivalIndex, ArrivalRow>,
    /// The generation's wire-coordinate column, base order, in full.
    pub positions: &'doc IdSlice<BasePosition, Vec2>,
    /// The generation's row-id column (row by base position), in full.
    pub rows: &'doc IdSlice<BasePosition, WireRow<NodeRowId>>,
    /// Per-type membership for the request's `coloredTypeIds`, in request order.
    ///
    /// Bit `i` of every point's mask reads from `masks[i]`. `None` when the request carried no
    /// ids: the `TYPE_MASK` slot is then absent rather than empty.
    pub masks: Option<&'doc [Membership<'doc>]>,
    /// The delivered edges in column form: `EDGE_SOURCES`, `EDGE_TARGETS` and `EDGE_IDS`.
    ///
    /// `EDGE_IDS` carries `bstr(32)` records. Identity is generation-frozen, so every delivered
    /// edge carries one. Edge order itself is ascending by those bytes - the delivery order is
    /// client-verifiable from the column alone.
    pub edges: &'doc EdgeColumns,
    /// The detail trailer; locate is the detail view, so it always rides.
    pub trailer: LocateTrailer<'doc>,
}

impl LocateResponse<'_> {
    /// Encodes the response as one `SALTILEL` envelope.
    ///
    /// # Panics
    ///
    /// This panics when the trailer arrays do not cover the delivered nodes and edges.
    #[must_use]
    pub(crate) fn encode(&self) -> Vec<u8> {
        /// Bytes per delivered point across the node columns: an f32 pair and a row id.
        const POINT_SIZE: usize = size_of::<[f32; 2]>() + size_of::<u32>();
        /// Bytes per delivered edge across the edge columns: source, target, identity.
        const EDGE_SIZE: usize =
            size_of::<u32>() + size_of::<u32>() + size_of::<ArchivedEntityId>();

        let edges = self.edges.count();
        self.trailer
            .debug_assert_invariants(self.delivered.len(), edges);

        let mut envelope = EnvelopeWriter::new(Kind::Locate, 7);
        envelope.reserve(self.delivered.len() * POINT_SIZE + edges * EDGE_SIZE);
        envelope.slot(|buf| self.encode_head(buf, edges as u64));
        envelope.slot(|buf| self.write_positions(buf));
        envelope.slot(|buf| self.write_rows(buf));
        match self.masks {
            Some(masks) => envelope.slot(|buf| self.write_masks(buf, masks)),
            None => envelope.absent(),
        }
        envelope.slot(|buf| write_column(buf, self.edges.sources()));
        envelope.slot(|buf| write_column(buf, self.edges.targets()));
        envelope.slot(|buf| write_identities(buf, self.edges.ids()));

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
        for &vessel in self.delivered {
            let point = match vessel {
                ViewRow::Base(position) => self.positions[position],
                ViewRow::Arrival(index) => self.arrivals[index].point,
            };
            column.extend_from_slice(&point.x().to_le_bytes());
            column.extend_from_slice(&point.y().to_le_bytes());
        }
    }

    /// Writes the `ROW_IDS` column: u32 row ids, delivered order.
    fn write_rows(&self, column: &mut Vec<u8>) {
        column.reserve(self.delivered.len() * 4);
        for &vessel in self.delivered {
            let wire = match vessel {
                ViewRow::Base(position) => self.rows[position],
                ViewRow::Arrival(index) => self.arrivals[index].wire,
            };
            column.extend_from_slice(&wire.get().to_le_bytes());
        }
    }

    /// Assembles the `TYPE_MASK` column.
    ///
    /// One `ceil(n/8)`-byte mask per delivered point, bit `i` LSB-first when the point carries the
    /// request's type `i` - the tile column's shape over an arbitrary delivered list, probed point
    /// by point (the set is a spotlight, never a bulk slice). A mask read as its set-bit indexes is
    /// the point's colored-type index list. The source's list is the first mask's.
    fn write_masks(&self, buf: &mut Vec<u8>, masks: &[Membership<'_>]) {
        let stride = masks.len().div_ceil(8);
        let base = buf.len();
        buf.resize(base + self.delivered.len() * stride, 0);
        let column = &mut buf[base..];

        for (bit, membership) in masks.iter().enumerate() {
            let byte = bit >> 3;
            let flag = 1_u8 << (bit & 7);

            for (point, &vessel) in self.delivered.iter().enumerate() {
                // An arrival's mask reads zero in every bit, the column's answer for an id the
                // generation's postings cannot resolve.
                let ViewRow::Base(position) = vessel else {
                    continue;
                };
                if membership.contains(position) {
                    column[point * stride + byte] |= flag;
                }
            }
        }
    }
}

/// The locate detail trailer.
///
/// The intern tables come first, then node detail in delivered order and link detail in edge order,
/// every type and property reference a uint index into its table.
#[derive(Debug)]
pub(crate) struct LocateTrailer<'trailer> {
    /// Trailer key 0: the type intern table - every referenced versioned type URL once,
    /// bytewise-sorted.
    pub type_table: &'trailer IdSlice<TableIndex<VersionedUrl>, Cow<'trailer, str>>,
    /// Trailer key 1: the property intern table - every surviving property base URL once,
    /// bytewise-sorted.
    pub property_table: &'trailer IdSlice<TableIndex<BaseUrl>, Cow<'trailer, str>>,
    /// Trailer key 2: labels, delivered order.
    pub labels: &'trailer IdSlice<NodeSlot, &'trailer Label>,
    /// Trailer key 3.
    ///
    /// Each delivered node's first direct type as a type-table index, delivered order. `null`
    /// marks a node the store no longer serves or whose types the store does not record.
    pub type_ids: &'trailer IdSlice<NodeSlot, Option<TableIndex<VersionedUrl>>>,
    /// Trailer key 4.
    ///
    /// The source's property map, keyed by uint index into the property table, keys ascending.
    /// `null` marks a source the store no longer serves. Neighbour nodes carry no properties, and
    /// their detail is one locate away.
    pub properties: Option<&'trailer PropertyMap<'trailer>>,
    /// Trailer key 5: link labels, edge order.
    pub link_labels: &'trailer IdSlice<EdgeSlot, &'trailer Label>,
    /// Trailer key 6.
    ///
    /// Each delivered edge's direct types as type-table indexes, edge order, canonical type order
    /// preserved, capped by the published `locateLinkTypeIds` limit. Empty for a link the store no
    /// longer serves.
    pub link_type_ids: &'trailer IdSlice<EdgeSlot, Vec<TableIndex<VersionedUrl>>>,
    /// Trailer key 7: per-edge type completeness, edge order.
    ///
    /// Encoded as an LSB-first bitmask in whole 8-byte words, padding bits zero. Bit `e` set
    /// means edge `e`'s type list is the link's whole direct set - unset means the cap truncated
    /// it or the store no longer serves the link.
    pub link_type_ids_complete: &'trailer DenseBitSlice<EdgeSlot>,
    /// Trailer key 8.
    ///
    /// Per-edge property maps, edge order, keyed by uint index into the property table, keys
    /// ascending, capped by the published `locateLinkProperties` limit. `null` marks a link the
    /// store no longer serves.
    pub link_properties: &'trailer IdSlice<EdgeSlot, Option<&'trailer PropertyMap<'trailer>>>,
    /// Trailer key 9: per-edge property completeness, edge order.
    ///
    /// Encoded as an LSB-first bitmask in whole 8-byte words, padding bits zero. Bit `e` set
    /// means edge `e`'s property map is the link entity's whole deliverable set - unset means the
    /// scalar-value filter or the cap dropped something, or the store no longer serves the link.
    pub link_properties_complete: &'trailer DenseBitSlice<EdgeSlot>,
}

impl LocateTrailer<'_> {
    /// Asserts that the trailer arrays cover the delivered nodes and edges.
    ///
    /// Coverage is the one trailer law the types do not carry, since the arrays travel as
    /// separate slices. Every check is a `debug_assert`, so release builds compile this to
    /// nothing.
    fn debug_assert_invariants(&self, nodes: usize, edges: usize) {
        debug_assert_eq!(
            self.labels.len(),
            nodes,
            "the trailer labels must cover exactly the delivered nodes",
        );
        debug_assert_eq!(
            self.type_ids.len(),
            nodes,
            "the trailer type ids must cover exactly the delivered nodes",
        );
        debug_assert_eq!(
            self.link_labels.len(),
            edges,
            "the trailer link labels must cover exactly the delivered edges",
        );
        debug_assert_eq!(
            self.link_type_ids.len(),
            edges,
            "the trailer link type ids must cover exactly the delivered edges",
        );
        debug_assert_eq!(
            self.link_properties.len(),
            edges,
            "the trailer link properties must cover exactly the delivered edges",
        );
        debug_assert_eq!(
            self.link_type_ids_complete.domain_size(),
            edges as u64,
            "the trailer link type completeness must cover exactly the delivered edges",
        );
        debug_assert_eq!(
            self.link_properties_complete.domain_size(),
            edges as u64,
            "the trailer link property completeness must cover exactly the delivered edges",
        );
    }

    /// Encodes the trailer tail as one self-delimiting CBOR map.
    fn encode(&self, buf: &mut Vec<u8>) {
        let mut cbor = CborWriter::over(buf);
        cbor.map(10);

        cbor.uint(0);
        cbor.array(self.type_table.len() as u64);
        for url in self.type_table {
            cbor.text(url);
        }

        cbor.uint(1);
        cbor.array(self.property_table.len() as u64);
        for url in self.property_table {
            cbor.text(url);
        }

        cbor.uint(2);
        encode_details(&mut cbor, self.labels.iter());

        cbor.uint(3);
        cbor.array(self.type_ids.len() as u64);
        for entry in self.type_ids {
            match entry {
                Some(index) => cbor.uint(index.as_u64()),
                None => cbor.null(),
            }
        }
        cbor.uint(4);
        encode_property_map(&mut cbor, self.properties);

        cbor.uint(5);
        encode_details(&mut cbor, self.link_labels.iter());

        cbor.uint(6);
        cbor.array(self.link_type_ids.len() as u64);
        for indexes in self.link_type_ids {
            cbor.array(indexes.len() as u64);
            for &index in indexes {
                cbor.uint(index.as_u64());
            }
        }

        cbor.uint(7);
        cbor.bytes(self.link_type_ids_complete.words().as_bytes());

        cbor.uint(8);
        cbor.array(self.link_properties.len() as u64);
        for map in self.link_properties {
            encode_property_map(&mut cbor, *map);
        }

        cbor.uint(9);
        cbor.bytes(self.link_properties_complete.words().as_bytes());
    }
}

/// A property-table key paired with its value, one entry of an encoded property map.
pub(crate) type PropertyEntry<'trailer> = (TableIndex<BaseUrl>, PropertyValue<'trailer>);

/// One entity's wire property map, keys ascending into the property table.
///
/// Ascending keys are the interning derivation's own order. Hydration emits each entity's
/// surviving properties ascending by base URL, a base URL renders as its own string, and the
/// table's wire order is bytewise over renderings, so ascending names map to ascending indexes.
#[derive(Debug, PartialEq)]
pub(crate) struct PropertyMap<'doc> {
    /// The encoded entries, keys ascending.
    entries: Vec<PropertyEntry<'doc>>,
}

impl<'doc> PropertyMap<'doc> {
    /// Builds one map over interned entries.
    ///
    /// The keys must ascend by table index.
    pub(crate) fn new_unchecked(entries: Vec<PropertyEntry<'doc>>) -> Self {
        // Safe fn: the ascending-keys invariant is correctness rather than memory safety, and
        // debug builds check it as a maintainer tripwire.
        debug_assert!(
            entries.is_sorted_by(|left, right| left.0 < right.0),
            "property map keys must ascend",
        );

        Self { entries }
    }

    /// Views the entries, keys ascending.
    pub(crate) const fn entries(&self) -> &[PropertyEntry<'doc>] {
        &self.entries
    }

    fn encode(&self, cbor: &mut CborWriter<'_>) {
        cbor.map(self.entries.len() as u64);
        for &(index, ref value) in &self.entries {
            cbor.uint(index.as_u64());
            value.encode(cbor);
        }
    }
}

/// Encodes one property map, `null` for an entity the store no longer serves.
fn encode_property_map(cbor: &mut CborWriter<'_>, map: Option<&PropertyMap<'_>>) {
    match map {
        Some(map) => map.encode(cbor),
        None => cbor.null(),
    }
}

/// One scalar property value.
///
/// These variants are the only value shapes the wire encodes. Nested objects and arrays never
/// survive hydration.
#[derive(Debug, Clone, PartialEq)]
pub(crate) enum PropertyValue<'doc> {
    /// A text scalar.
    Text(&'doc str),
    /// An integral scalar.
    Integer(i64),
    /// A floating scalar.
    ///
    /// Store scalars are doubles and stay double on the wire.
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
