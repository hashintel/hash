//! The tile response: `HEAD`, columns, and trailer as one envelope.
//!
//! A tile document borrows the generation's base-order columns and names its delivered set in one
//! of [`DeliveredSet`]'s two shapes. Contiguous base-position ranges in delivery order are what
//! both modes produce unmasked, where a non-root delta tile is its quad node's one run and the
//! delta root and every total tile are bucket-major run lists. A gathered position list in delivery
//! order is the shape a visibility mask leaves behind. Encoding gathers the column entries and the
//! per-point type masks from the postings membership, then writes the `SALTILET` five-slot envelope
//! of `HEAD`, `POSITIONS`, `ROW_IDS`, `TYPE_MASK`, and the reserved `MASS` slot, which stays absent
//! until the product wants density.
//!
//! The document's consistency laws are producer contracts and panic when violated. The wire
//! reserves children bits beyond the low four, and a producer writes them zero. The range lengths
//! and the `HEAD`'s per-bucket runs must agree on the delivered count, and the trailer arrays must
//! cover exactly the delivered points.
#![expect(
    clippy::little_endian_bytes,
    reason = "column integers are pinned little-endian by the wire contract"
)]

use core::ops::Range;

use hashql_core::id::{Id as _, IdSlice};

use super::{Kind, Mode, cbor::CborWriter, envelope::EnvelopeWriter};
use crate::{
    dataset::auxiliary::{Icon, Label},
    identity::{BasePosition, NodeRowId},
    integrity::Sha256Digest,
    math::{Bounds2, Vec2},
    salt::postings::artifact::Membership,
    serve::WireRow,
};

/// One tile response in writable form.
#[derive(Debug)]
pub(crate) struct TileResponse<'doc> {
    /// The `HEAD` document, slot 0.
    pub head: TileHead<'doc>,
    /// The delivered set, in either producer shape.
    pub delivered: DeliveredSet<'doc>,
    /// The generation's wire-coordinate column, base order, in full.
    pub positions: &'doc IdSlice<BasePosition, Vec2>,
    /// The generation's row-id column (row by base position), in full.
    pub rows: &'doc IdSlice<BasePosition, WireRow<NodeRowId>>,
    /// Per-type membership for the request's `coloredTypeIds`, in request order.
    ///
    /// Bit `i` of every point's mask reads from `masks[i]`. `None` when the request carried no
    /// ids: the `TYPE_MASK` slot is then absent rather than empty.
    pub masks: Option<&'doc [Membership<'doc>]>,
    /// The hydrated detail trailer.
    ///
    /// `Some` iff the request set `detail: "auxiliary"`.
    pub trailer: Option<TileTrailer<'doc>>,
}

impl TileResponse<'_> {
    /// Encodes the response as one `SALTILET` envelope.
    ///
    /// # Panics
    ///
    /// This panics when range lengths and `HEAD` runs disagree on the delivered count, when a
    /// producer sets a reserved children bit, or when the trailer arrays do not cover the delivered
    /// points.
    #[must_use]
    pub(crate) fn encode(&self) -> Vec<u8> {
        let delivered = self.delivered.count();
        let counted: u64 = self.head.runs.iter().map(|&count| u64::from(count)).sum();
        assert_eq!(
            delivered, counted,
            "the delivered set must count exactly the HEAD runs",
        );

        if let Some(trailer) = &self.trailer {
            assert_eq!(
                trailer.labels.len() as u64,
                delivered,
                "the trailer labels must cover exactly the delivered points",
            );
            assert_eq!(
                trailer.icons.len() as u64,
                delivered,
                "the trailer icons must cover exactly the delivered points",
            );
        }

        let mut envelope = EnvelopeWriter::new(Kind::Tile, 5);
        let points = usize::try_from(delivered).expect("delivered counts fit usize");
        envelope.reserve(points * 12);
        envelope.slot(|buf| self.head.encode(buf, delivered, self.trailer.is_some()));
        envelope.slot(|buf| self.write_positions(buf));
        envelope.slot(|buf| self.write_rows(buf));
        match self.masks {
            Some(masks) => envelope.slot(|buf| self.write_masks(buf, masks)),
            None => envelope.absent(),
        }
        envelope.absent();

        match &self.trailer {
            Some(trailer) => envelope.finish_with_trailer(|buf| trailer.encode(buf)),
            None => envelope.finish(),
        }
    }

    /// Writes the `POSITIONS` column: f32 xy pairs, delivered order.
    fn write_positions(&self, column: &mut Vec<u8>) {
        self.delivered.for_each(|position| {
            let point = self.positions[position];
            column.extend_from_slice(&point.x().to_le_bytes());
            column.extend_from_slice(&point.y().to_le_bytes());
        });
    }

    /// Writes the `ROW_IDS` column: u32 row ids, delivered order.
    fn write_rows(&self, column: &mut Vec<u8>) {
        self.delivered.for_each(|position| {
            column.extend_from_slice(&self.rows[position].get().to_le_bytes());
        });
    }

    /// Assembles the `TYPE_MASK` column.
    ///
    /// One `ceil(n/8)`-byte mask per delivered point, bit `i` LSB-first when the point carries the
    /// request's type `i`.
    ///
    /// Each membership contributes by a linear merge of its ascending positions against the
    /// delivered set, never a per-point containment probe. A point matching no requested type keeps
    /// the zero mask, and no sentinel exists.
    ///
    /// The merge needs the delivered set in ascending base-position order, which delivery order
    /// does not supply. A range list numbers each point from its own range's start. For a gathered
    /// list that does not already ascend, the merge walks a permutation of its point indices sorted
    /// by position, built once and reused by every membership. Either way the bits for a point
    /// occupy its delivery index, so the column stays in delivery order.
    fn write_masks(&self, buf: &mut Vec<u8>, masks: &[Membership<'_>]) {
        let delivered =
            usize::try_from(self.delivered.count()).expect("delivered counts fit usize");
        let stride = masks.len().div_ceil(8);
        let base = buf.len();
        buf.resize(base + delivered * stride, 0);
        let column = &mut buf[base..];

        match self.delivered {
            DeliveredSet::Ranges(ranges) => {
                for (bit, membership) in masks.iter().enumerate() {
                    let byte = bit >> 3;
                    let flag = 1_u8 << (bit & 7);

                    let mut base = 0_usize;
                    for range in ranges {
                        for position in membership.positions_in(range.clone()) {
                            let point = base + (position.as_usize() - range.start.as_usize());
                            column[point * stride + byte] |= flag;
                        }
                        base += range.end.as_usize() - range.start.as_usize();
                    }
                }
            }
            DeliveredSet::Positions(list) => {
                if list.is_empty() {
                    return;
                }

                let ascending = (!list.is_sorted()).then(|| {
                    let mut points: Vec<usize> = (0..list.len()).collect();
                    points.sort_unstable_by_key(|&point| list[point]);
                    points
                });
                let point_at = |rank: usize| ascending.as_ref().map_or(rank, |points| points[rank]);

                let lowest = list[point_at(0)];
                let highest = list[point_at(list.len() - 1)];

                for (bit, membership) in masks.iter().enumerate() {
                    let byte = bit >> 3;
                    let flag = 1_u8 << (bit & 7);

                    let mut rank = 0_usize;
                    let past_highest = BasePosition::from_u64(highest.as_u64() + 1);
                    for position in membership.positions_in(lowest..past_highest) {
                        while rank < list.len() && list[point_at(rank)] < position {
                            rank += 1;
                        }
                        if rank == list.len() {
                            break;
                        }
                        let point = point_at(rank);
                        if list[point] == position {
                            column[point * stride + byte] |= flag;
                        }
                    }
                }
            }
        }
    }
}

/// One delivered point set, in either of the two shapes a producer holds.
#[derive(Debug, Copy, Clone)]
pub(crate) enum DeliveredSet<'doc> {
    /// Contiguous base-position ranges in delivery order.
    ///
    /// The unmasked gather. Zero-length ranges are legal and deliver nothing.
    Ranges(&'doc [Range<BasePosition>]),
    /// Gathered base positions in delivery order: the masked gather, visibility already applied.
    ///
    /// Delivery order is the producer's and carries no relation to base order. Today's masked walk
    /// gathers by ascending corpus bucket and so happens to ascend. The encoder does not depend on
    /// it.
    Positions(&'doc [BasePosition]),
}

impl DeliveredSet<'_> {
    /// Counts the delivered points.
    pub(crate) fn count(self) -> u64 {
        match self {
            Self::Ranges(ranges) => ranges
                .iter()
                .map(|range| range.end.as_u64() - range.start.as_u64())
                .sum(),
            Self::Positions(list) => list.len() as u64,
        }
    }

    /// Visits the delivered base positions in delivery order.
    pub(crate) fn for_each(self, mut visit: impl FnMut(BasePosition)) {
        match self {
            Self::Ranges(ranges) => {
                for range in ranges {
                    for position in range.clone() {
                        visit(position);
                    }
                }
            }
            Self::Positions(list) => {
                for &position in list {
                    visit(position);
                }
            }
        }
    }
}

/// The tile `HEAD` document, slot 0: keys 0 through 10.
#[derive(Debug)]
pub(crate) struct TileHead<'doc> {
    /// Key 0: the generation identity, echoing the route.
    pub generation: Sha256Digest,
    /// Key 1: the variant index, echoing the route.
    pub variant: u64,
    /// Key 2: the tile coordinate, echoing the route.
    pub coordinate: TileCoordinate,
    /// Key 3: the delivery mode, echoing the request.
    pub mode: Mode,
    /// Key 5: the visible subtree count for the extent.
    pub visible: u64,
    /// Key 6: the first bucket of the runs array.
    pub first_bucket: u8,
    /// Key 7: per-bucket delivered counts from the first bucket up.
    ///
    /// Zero-length entries keep their positional slot.
    pub runs: &'doc [u32],
    /// Key 8: post-intersection set metadata. Required on the root tile, permitted everywhere.
    pub global: Option<GlobalHead>,
    /// Key 9: the occupied-child bitmask.
    ///
    /// Bit `i` = Morton child `i` holds a point below this zoom's cut. The wire reserves the bits
    /// beyond the low four, and a producer writes them zero.
    pub children: u8,
}

impl TileHead<'_> {
    /// Encodes the `HEAD` map.
    ///
    /// Key 4 (`delivered`) and key 10 (`trailer`) come from the response rather than from a stored
    /// field.
    fn encode(&self, buf: &mut Vec<u8>, delivered: u64, trailer: bool) {
        assert!(
            self.children < 16,
            "children bits beyond the low four are reserved zero",
        );

        let mut cbor = CborWriter::over(buf);
        cbor.map(10 + u64::from(self.global.is_some()));

        cbor.uint(0);
        cbor.bytes(&self.generation.to_bytes());
        cbor.uint(1);
        cbor.uint(self.variant);
        cbor.uint(2);
        cbor.array(3);
        cbor.uint(u64::from(self.coordinate.z));
        cbor.uint(u64::from(self.coordinate.x));
        cbor.uint(u64::from(self.coordinate.y));
        cbor.uint(3);
        cbor.uint(self.mode.code());
        cbor.uint(4);
        cbor.uint(delivered);
        cbor.uint(5);
        cbor.uint(self.visible);
        cbor.uint(6);
        cbor.uint(u64::from(self.first_bucket));
        cbor.uint(7);
        cbor.array(self.runs.len() as u64);
        for &count in self.runs {
            cbor.uint(u64::from(count));
        }
        if let Some(global) = &self.global {
            cbor.uint(8);
            global.encode(&mut cbor);
        }
        cbor.uint(9);
        cbor.uint(u64::from(self.children));
        cbor.uint(10);
        cbor.boolean(trailer);
    }
}

/// A tile address, the route's `z/x/y` echoed as `HEAD` key 2.
#[derive(Debug, Copy, Clone, PartialEq, Eq, serde::Deserialize, schemars::JsonSchema)]
pub(crate) struct TileCoordinate {
    /// The zoom, a subdivision depth.
    pub z: u8,
    /// The cell's x index on the `2^z` grid.
    pub x: u32,
    /// The cell's y index on the `2^z` grid.
    pub y: u32,
}

/// `HEAD` key 8: metadata of the entire post-intersection visible set.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct GlobalHead {
    /// Entry 0: points visible at the current zoom.
    pub visible: u64,
    /// Entry 1.
    ///
    /// The tight wire-frame extent of the entire visible set, absent iff that set is empty.
    /// Emitted as `[minX, minY, maxX, maxY]`.
    pub bounds: Option<Bounds2>,
    /// Entry 2: the deepest occupied bucket of the visible set.
    pub min_resolution: u64,
}

impl GlobalHead {
    /// Encodes the global map as the value of `HEAD` key 8.
    fn encode(&self, cbor: &mut CborWriter<'_>) {
        cbor.map(2 + u64::from(self.bounds.is_some()));

        cbor.uint(0);
        cbor.uint(self.visible);
        if let Some(bounds) = &self.bounds {
            cbor.uint(1);
            cbor.array(4);
            cbor.f32(bounds.min().x());
            cbor.f32(bounds.min().y());
            cbor.f32(bounds.max().x());
            cbor.f32(bounds.max().y());
        }
        cbor.uint(2);
        cbor.uint(self.min_resolution);
    }
}

/// The tile detail trailer.
///
/// Labels and icons from the generation's own payloads, delivered order, `null` marking a row the
/// generation records no text for.
#[derive(Debug)]
pub(crate) struct TileTrailer<'trailer> {
    /// Trailer key 0.
    pub labels: &'trailer [&'trailer Label],
    /// Trailer key 1.
    pub icons: &'trailer [&'trailer Icon],
}

impl TileTrailer<'_> {
    /// Encodes the trailer tail as one self-delimiting CBOR map.
    fn encode(&self, buf: &mut Vec<u8>) {
        let mut cbor = CborWriter::over(buf);
        cbor.map(2);

        cbor.uint(0);
        encode_details(&mut cbor, self.labels.iter());

        cbor.uint(1);
        encode_details(&mut cbor, self.icons.iter());
    }
}

/// Emits one detail array: text entries, `null` for an empty entry.
pub(super) fn encode_details(
    cbor: &mut CborWriter<'_>,
    entries: impl ExactSizeIterator<Item: AsRef<str>>,
) {
    cbor.array(entries.len() as u64);
    for entry in entries {
        let entry = entry.as_ref();

        if entry.is_empty() {
            cbor.null();
        } else {
            cbor.text(entry);
        }
    }
}
