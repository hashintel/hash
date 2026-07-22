//! The tile response: `HEAD`, columns, and trailer as one envelope.
//!
//! A tile document borrows the generation's base-order columns and names its delivered set in one
//! of [`DeliveredSet`]'s two shapes: contiguous base-position ranges in delivery order - what both
//! modes produce unmasked (a non-root delta tile is its quad node's one run; the delta root and
//! every total tile are bucket-major run lists) - or an ascending gathered position list, the shape
//! a visibility mask leaves behind. Encoding gathers the column entries, assembles the per-point
//! type masks from the postings membership, and lays everything into the `SALTILET` five-slot
//! envelope: `HEAD`, `POSITIONS`, `ROW_IDS`, `TYPE_MASK`, and the reserved `MASS` slot, absent
//! until the product wants density.
//!
//! The document's consistency laws are producer contracts and panic when violated: the range
//! lengths and the `HEAD`'s per-bucket runs must agree on the delivered count, trailer arrays cover
//! exactly the delivered points, and children bits beyond the low four are reserved zero.
#![expect(
    clippy::little_endian_bytes,
    reason = "column integers are pinned little-endian by the wire contract"
)]

use core::ops::Range;

use super::{Kind, Mode, cbor::CborWriter, envelope::EnvelopeWriter};
use crate::{
    integrity::Sha256Digest,
    math::{Bounds2, Vec2},
    salt::postings::mapped::Membership,
};

/// One tile response in writable form.
#[derive(Debug)]
pub(crate) struct TileResponse<'doc> {
    /// The `HEAD` document, slot 0.
    pub head: TileHead<'doc>,
    /// The delivered set, in either producer shape.
    pub delivered: DeliveredSet<'doc>,
    /// The generation's wire-coordinate column, base order, in full.
    pub positions: &'doc [Vec2],
    /// The generation's row-id column (row by base position), in full.
    pub rows: &'doc [u32],
    /// Per-type membership for the request's `coloredTypeIds`, in request order.
    ///
    /// Bit `i` of every point's mask reads from `masks[i]`. `None` when the request carried no
    /// ids: the `TYPE_MASK` slot is then absent rather than empty.
    pub masks: Option<&'doc [Membership<'doc>]>,
    /// The hydrated detail trailer; `Some` iff the request set `includeDetailedData`.
    pub trailer: Option<TileTrailer<'doc>>,
}

impl TileResponse<'_> {
    /// Encodes the response as one `SALTILET` envelope.
    ///
    /// # Panics
    ///
    /// Panics when the document is inconsistent: range lengths and `HEAD` runs disagreeing on the
    /// delivered count, reserved children bits set, or trailer arrays not covering the delivered
    /// points.
    #[must_use]
    pub(crate) fn encode(&self) -> Vec<u8> {
        let delivered = self.delivered.count();
        let counted: u64 = self.head.runs.iter().map(|&count| u64::from(count)).sum();
        assert_eq!(
            delivered, counted,
            "the delivered ranges and the HEAD runs must agree on the point count",
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

        let head = self.head.encode(delivered, self.trailer.is_some());

        let mut envelope = EnvelopeWriter::new(Kind::Tile, 5);
        envelope.present(&head);
        envelope.present(&self.positions_column());
        envelope.present(&self.rows_column());
        match self.masks {
            Some(masks) => envelope.present(&self.mask_column(masks)),
            None => envelope.absent(),
        }
        envelope.absent();

        match &self.trailer {
            Some(trailer) => envelope.finish_with_trailer(&trailer.encode()),
            None => envelope.finish(),
        }
    }

    /// Gathers the `POSITIONS` column: f32 xy pairs, delivered order.
    fn positions_column(&self) -> Vec<u8> {
        let mut column = Vec::new();
        self.delivered.for_each(|position| {
            let point = self.positions[position as usize];
            column.extend_from_slice(&point.x().to_le_bytes());
            column.extend_from_slice(&point.y().to_le_bytes());
        });

        column
    }

    /// Gathers the `ROW_IDS` column: u32 row ids, delivered order.
    fn rows_column(&self) -> Vec<u8> {
        let mut column = Vec::new();
        self.delivered.for_each(|position| {
            column.extend_from_slice(&self.rows[position as usize].to_le_bytes());
        });

        column
    }

    /// Assembles the `TYPE_MASK` column.
    ///
    /// One `ceil(n/8)`-byte mask per delivered point, bit `i` LSB-first when the point carries the
    /// request's type `i`.
    ///
    /// Each membership contributes by a linear merge of its ascending positions against the
    /// delivered set, never a per-point containment probe. A point matching no requested type keeps
    /// the zero mask; no sentinel exists.
    fn mask_column(&self, masks: &[Membership<'_>]) -> Vec<u8> {
        let delivered =
            usize::try_from(self.delivered.count()).expect("delivered counts fit usize");
        let stride = masks.len().div_ceil(8);
        let mut column = vec![0_u8; delivered * stride];

        for (bit, membership) in masks.iter().enumerate() {
            let byte = bit >> 3;
            let flag = 1_u8 << (bit & 7);

            match self.delivered {
                DeliveredSet::Ranges(ranges) => {
                    let mut base = 0_usize;
                    for range in ranges {
                        for position in membership.positions_in(range.clone()) {
                            let point = base + (position - range.start) as usize;
                            column[point * stride + byte] |= flag;
                        }
                        base += range.len();
                    }
                }
                DeliveredSet::Positions(list) => {
                    let (Some(&lowest), Some(&highest)) = (list.first(), list.last()) else {
                        continue;
                    };
                    let mut cursor = 0_usize;
                    for position in membership.positions_in(lowest..highest + 1) {
                        while cursor < list.len() && list[cursor] < position {
                            cursor += 1;
                        }
                        if cursor == list.len() {
                            break;
                        }
                        if list[cursor] == position {
                            column[cursor * stride + byte] |= flag;
                        }
                    }
                }
            }
        }

        column
    }
}

/// One delivered point set, in either of the two shapes a producer holds.
#[derive(Debug, Copy, Clone)]
pub(crate) enum DeliveredSet<'doc> {
    /// Contiguous base-position ranges in delivery order.
    ///
    /// The unmasked gather. Zero-length ranges are legal and deliver nothing.
    Ranges(&'doc [Range<u32>]),
    /// Gathered base positions, ascending: the masked gather, visibility already applied.
    Positions(&'doc [u32]),
}

impl DeliveredSet<'_> {
    /// Counts the delivered points.
    pub(crate) fn count(self) -> u64 {
        match self {
            Self::Ranges(ranges) => ranges.iter().map(|range| range.len() as u64).sum(),
            Self::Positions(list) => list.len() as u64,
        }
    }

    /// Visits the delivered base positions in delivery order.
    pub(crate) fn for_each(self, mut visit: impl FnMut(u32)) {
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
    /// Bit `i` = Morton child `i` holds a point below this zoom's cut. Bits beyond the low four
    /// are reserved zero.
    pub children: u8,
}

impl TileHead<'_> {
    /// Encodes the `HEAD` map.
    ///
    /// Key 4 (`delivered`) and key 10 (`trailer`) are derived from the response rather than stored.
    fn encode(&self, delivered: u64, trailer: bool) -> Vec<u8> {
        assert!(
            self.children < 16,
            "children bits beyond the low four are reserved zero",
        );

        let mut cbor = CborWriter::new();
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

        cbor.into_bytes()
    }
}

/// A tile address: the route's `z/x/y`, echoed as `HEAD` key 2.
#[derive(Debug, Copy, Clone, PartialEq, Eq, serde::Deserialize, schemars::JsonSchema)]
pub struct TileCoordinate {
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
    fn encode(&self, cbor: &mut CborWriter) {
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
/// Hydrated labels and icons, delivered order, `null` marking a row whose entry did not resolve.
#[derive(Debug)]
pub(crate) struct TileTrailer<'doc> {
    /// Trailer key 0.
    pub labels: &'doc [Option<&'doc str>],
    /// Trailer key 1.
    pub icons: &'doc [Option<&'doc str>],
}

impl TileTrailer<'_> {
    /// Encodes the trailer tail as one self-delimiting CBOR map.
    fn encode(&self) -> Vec<u8> {
        let mut cbor = CborWriter::new();
        cbor.map(2);

        cbor.uint(0);
        encode_details(&mut cbor, self.labels);
        cbor.uint(1);
        encode_details(&mut cbor, self.icons);

        cbor.into_bytes()
    }
}

/// Emits one detail array: text entries with `null` for unresolved.
pub(super) fn encode_details(cbor: &mut CborWriter, entries: &[Option<&str>]) {
    cbor.array(entries.len() as u64);
    for entry in entries {
        match entry {
            Some(text) => cbor.text(text),
            None => cbor.null(),
        }
    }
}

/// Encodes one always-present identity column as a CBOR array of 32-byte strings.
///
/// The shape of columns whose entries derive from generation-frozen identity tables rather than
/// the store: every delivered element carries a value, so no entry is null.
pub(super) fn encode_identities(cbor: &mut CborWriter, entries: &[[u8; 32]]) {
    cbor.array(entries.len() as u64);
    for entry in entries {
        cbor.bytes(entry);
    }
}
