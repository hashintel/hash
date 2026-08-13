//! Wire encoder tests: hand-derived bytes for every layer.
//!
//! CBOR expectations come from RFC 8949 appendix A where the profile covers them, and otherwise
//! this module derives them by hand at the byte level. Comments above the assertions derive the
//! envelope and response expectations. The checked-in fixtures (`fixtures.rs`) carry the
//! cross-language corpus, and these tests pin one layer each so a failure names its layer.
#![expect(
    clippy::little_endian_bytes,
    reason = "the tests read and write the contract's little-endian wire integers"
)]
#![expect(
    clippy::single_range_in_vec_init,
    reason = "a delta tile's delivered set really is one contiguous range"
)]

use hashql_core::id::Id;
use proptest::{arbitrary::any, prop_assert, prop_assert_eq, property_test};

use super::{
    Kind, Mode,
    cbor::CborWriter,
    edges::{EdgesResponse, EdgesTrailer},
    envelope::EnvelopeWriter,
    locate::{LocateResponse, LocateTrailer, PropertyMap, PropertyValue},
    tile::{DeliveredSet, GlobalHead, TileCoordinate, TileHead, TileResponse, TileTrailer},
};
use crate::{
    bitset::DenseBitSlice,
    dataset::{
        auxiliary::{Icon, Label},
        postgres::id::{ArchivedEntityId, ArchivedEntityUuid, ArchivedWebId},
    },
    identity::{BasePosition, NodeRowId},
    integrity::Sha256Digest,
    math::{Bounds2, Vec2},
    salt::postings::artifact::Membership,
    serve::WireRow,
};

/// Builds the dense membership set over `domain` rows admitting exactly `members`.
fn dense_set<T: Id>(domain: usize, members: &[u32]) -> Box<DenseBitSlice<T>> {
    let mut set = DenseBitSlice::new_empty(domain);
    for &member in members {
        set.insert(T::from_u32(member));
    }
    set
}

/// Builds one uniform-byte identity record: `byte` in both uuid halves.
const fn identity_of(byte: u8) -> ArchivedEntityId {
    ArchivedEntityId {
        web_id: ArchivedWebId::from_bytes([byte; 16]),
        entity_uuid: ArchivedEntityUuid::from_bytes([byte; 16]),
    }
}

/// Reads slot `slot`'s directory entry from a finished response.
pub(crate) fn directory(bytes: &[u8], slot: usize) -> (u32, u32) {
    let entry = 16 + 8 * slot;
    let start = u32::from_le_bytes(bytes[entry..entry + 4].try_into().expect("four bytes"));
    let end = u32::from_le_bytes(bytes[entry + 4..entry + 8].try_into().expect("four bytes"));

    (start, end)
}

/// Slices slot `slot`'s payload, or [`None`] when the slot is absent.
pub(crate) fn section(bytes: &[u8], slot: usize) -> Option<&[u8]> {
    let (start, end) = directory(bytes, slot);
    if (start, end) == (0, 0) {
        return None;
    }

    Some(&bytes[start as usize..end as usize])
}

mod cbor {
    use super::CborWriter;

    /// Encodes one value through a fresh writer.
    fn encoded(emit: impl FnOnce(&mut CborWriter<'_>)) -> Vec<u8> {
        let mut bytes = Vec::new();
        emit(&mut CborWriter::over(&mut bytes));
        bytes
    }

    #[test]
    fn uints_take_the_shortest_form() {
        // RFC 8949 appendix A rows, restricted to unsigned integers.
        for (value, expected) in [
            (0_u64, vec![0x00_u8]),
            (10, vec![0x0A]),
            (23, vec![0x17]),
            (24, vec![0x18, 0x18]),
            (100, vec![0x18, 0x64]),
            (255, vec![0x18, 0xFF]),
            (256, vec![0x19, 0x01, 0x00]),
            (1000, vec![0x19, 0x03, 0xE8]),
            (0xFFFF, vec![0x19, 0xFF, 0xFF]),
            (0x1_0000, vec![0x1A, 0x00, 0x01, 0x00, 0x00]),
            (1_000_000, vec![0x1A, 0x00, 0x0F, 0x42, 0x40]),
            (u64::from(u32::MAX), vec![0x1A, 0xFF, 0xFF, 0xFF, 0xFF]),
            (
                1 << 32,
                vec![0x1B, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00],
            ),
            (
                1_000_000_000_000,
                vec![0x1B, 0x00, 0x00, 0x00, 0xE8, 0xD4, 0xA5, 0x10, 0x00],
            ),
        ] {
            assert_eq!(
                encoded(|cbor| cbor.uint(value)),
                expected,
                "uint {value} must take the shortest form",
            );
        }
    }

    #[test]
    #[expect(
        clippy::redundant_closure_for_method_calls,
        reason = "CborWriter::null as a fn item fails higher-ranked inference over the writer's \
                  borrowed buffer; the closure is the working spelling"
    )]
    fn simple_values_and_floats() {
        assert_eq!(encoded(|cbor| cbor.boolean(false)), [0xF4]);
        assert_eq!(encoded(|cbor| cbor.boolean(true)), [0xF5]);
        assert_eq!(encoded(|cbor| cbor.null()), [0xF6]);

        // RFC 8949 appendix A: 100000.0f32 = 0xFA_47C35000; the f32
        // maximum = 0xFA_7F7FFFFF. 1.0 and -0.5 derived by hand from
        // the IEEE 754 single layout.
        assert_eq!(
            encoded(|cbor| cbor.f32(100_000.0)),
            [0xFA, 0x47, 0xC3, 0x50, 0x00]
        );
        assert_eq!(
            encoded(|cbor| cbor.f32(f32::MAX)),
            [0xFA, 0x7F, 0x7F, 0xFF, 0xFF]
        );
        assert_eq!(
            encoded(|cbor| cbor.f32(1.0)),
            [0xFA, 0x3F, 0x80, 0x00, 0x00]
        );
        assert_eq!(
            encoded(|cbor| cbor.f32(-0.5)),
            [0xFA, 0xBF, 0x00, 0x00, 0x00]
        );
    }

    #[test]
    fn signed_integers_take_both_majors() {
        // Non-negative values ride major type 0, negatives major
        // type 1 with argument -1 - n; -1, -10, -100, -1000 are RFC
        // 8949 appendix A rows, the extremes derived by hand.
        assert_eq!(encoded(|cbor| cbor.int(5)), [0x05]);
        assert_eq!(encoded(|cbor| cbor.int(0)), [0x00]);
        assert_eq!(encoded(|cbor| cbor.int(-1)), [0x20]);
        assert_eq!(encoded(|cbor| cbor.int(-10)), [0x29]);
        assert_eq!(encoded(|cbor| cbor.int(-100)), [0x38, 0x63]);
        assert_eq!(encoded(|cbor| cbor.int(-1000)), [0x39, 0x03, 0xE7]);
        assert_eq!(
            encoded(|cbor| cbor.int(i64::MAX)),
            [0x1B, 0x7F, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]
        );
        assert_eq!(
            encoded(|cbor| cbor.int(i64::MIN)),
            [0x3B, 0x7F, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]
        );
    }

    #[test]
    fn doubles_are_fixed_width() {
        // RFC 8949 appendix A gives 1.1 = 0xFB_3FF199999999999A. The 0.5 case follows by hand from
        // the IEEE 754 double layout.
        assert_eq!(
            encoded(|cbor| cbor.f64(1.1)),
            [0xFB, 0x3F, 0xF1, 0x99, 0x99, 0x99, 0x99, 0x99, 0x9A]
        );
        assert_eq!(
            encoded(|cbor| cbor.f64(0.5)),
            [0xFB, 0x3F, 0xE0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]
        );
    }

    #[test]
    fn strings_carry_byte_lengths() {
        assert_eq!(encoded(|cbor| cbor.bytes(&[])), [0x40]);
        assert_eq!(
            encoded(|cbor| cbor.bytes(&[0x01, 0x02, 0x03, 0x04])),
            [0x44, 0x01, 0x02, 0x03, 0x04]
        );
        assert_eq!(encoded(|cbor| cbor.text("")), [0x60]);
        // RFC 8949 appendix A: "IETF", "\u{fc}" (two UTF-8 bytes),
        // "\u{6c34}" (three UTF-8 bytes).
        assert_eq!(
            encoded(|cbor| cbor.text("IETF")),
            [0x64, 0x49, 0x45, 0x54, 0x46]
        );
        assert_eq!(encoded(|cbor| cbor.text("\u{fc}")), [0x62, 0xC3, 0xBC]);
        assert_eq!(
            encoded(|cbor| cbor.text("\u{6c34}")),
            [0x63, 0xE6, 0xB0, 0xB4]
        );

        // The length argument follows the integer rules: 24 bytes of
        // text need the one-byte argument form.
        let long = "abcdefghijklmnopqrstuvwx";
        let encoded_long = encoded(|cbor| cbor.text(long));
        assert_eq!(encoded_long[..2], [0x78, 0x18]);
        assert_eq!(&encoded_long[2..], long.as_bytes());
    }

    #[test]
    fn container_heads() {
        assert_eq!(encoded(|cbor| cbor.array(0)), [0x80]);
        assert_eq!(encoded(|cbor| cbor.array(3)), [0x83]);
        // RFC 8949 appendix A: a 25-item array head.
        assert_eq!(encoded(|cbor| cbor.array(25)), [0x98, 0x19]);
        assert_eq!(encoded(|cbor| cbor.map(0)), [0xA0]);
        assert_eq!(encoded(|cbor| cbor.map(2)), [0xA2]);
    }
}

mod envelope {
    use super::{EnvelopeWriter, Kind, directory};

    #[test]
    fn two_slot_envelope_lays_out_by_hand() {
        let mut envelope = EnvelopeWriter::new(Kind::Tile, 2);
        envelope.slot(|buf| buf.extend_from_slice(&[0xAA, 0xBB, 0xCC]));
        envelope.absent();
        let bytes = envelope.finish();

        // prefix (16) + directory (16) = payload region at 32; the
        // 3-byte payload pads with 5 zeros to 40.
        let expected = [
            b'S', b'A', b'L', b'T', b'I', b'L', b'E', b'T', // magic
            0x01, 0x00, // wireVersion 1
            0x00, 0x00, // flags 0
            0x02, 0x00, // slotCount 2
            0x00, 0x00, // reserved 0
            32, 0, 0, 0, 35, 0, 0, 0, // slot 0: (32, 35)
            0, 0, 0, 0, 0, 0, 0, 0, // slot 1: absent
            0xAA, 0xBB, 0xCC, 0, 0, 0, 0, 0, // payload, padded to 8
        ];
        assert_eq!(bytes, expected);
    }

    #[test]
    fn present_empty_is_distinct_from_absent() {
        let mut envelope = EnvelopeWriter::new(Kind::Edges, 3);
        envelope.slot(|buf| buf.extend_from_slice(&[0x01]));
        envelope.slot(|buf| buf.extend_from_slice(&[]));
        envelope.absent();
        let bytes = envelope.finish();

        // Payload region starts at 16 + 24 = 40; slot 0 is (40, 41)
        // padded to 48; slot 1 is present-empty at (48, 48); slot 2
        // is absent (0, 0).
        assert_eq!(directory(&bytes, 0), (40, 41));
        assert_eq!(directory(&bytes, 1), (48, 48));
        assert_eq!(directory(&bytes, 2), (0, 0));
        assert_eq!(bytes.len(), 48);
        assert_eq!(bytes[0..8], *b"SALTILEE");
    }

    #[test]
    fn trailer_follows_the_aligned_end_unpadded() {
        let mut envelope = EnvelopeWriter::new(Kind::Tile, 1);
        envelope.slot(|buf| buf.extend_from_slice(&[0x11, 0x22]));
        let bytes = envelope.finish_with_trailer(|buf| buf.extend_from_slice(&[0xA0]));

        // Payload region at 24; payload (24, 26) pads to 32; the
        // one-byte trailer tail follows unpadded.
        assert_eq!(directory(&bytes, 0), (24, 26));
        assert_eq!(bytes.len(), 33);
        assert_eq!(bytes[32], 0xA0);
        assert_eq!(bytes[26..32], [0; 6]);
    }

    #[test]
    #[should_panic(expected = "slot 0 (HEAD) is always present")]
    fn slot_zero_cannot_be_absent() {
        let mut envelope = EnvelopeWriter::new(Kind::Tile, 2);
        envelope.absent();
    }

    #[test]
    #[should_panic(expected = "declares 1 slots, all recorded")]
    fn extra_slots_are_rejected() {
        let mut envelope = EnvelopeWriter::new(Kind::Tile, 1);
        envelope.slot(|buf| buf.extend_from_slice(&[0x01]));
        envelope.slot(|buf| buf.extend_from_slice(&[0x02]));
    }

    #[test]
    #[should_panic(expected = "declares 2 slots")]
    fn missing_slots_are_rejected() {
        let mut envelope = EnvelopeWriter::new(Kind::Tile, 2);
        envelope.slot(|buf| buf.extend_from_slice(&[0x01]));
        let _bytes = envelope.finish();
    }
}

/// The directory laws hold for every present/absent payload mix.
///
/// Sequential 8-aligned starts from the fixed payload origin, extents matching payload lengths,
/// zero padding, and a total length of the last present end aligned to 8.
#[property_test]
fn envelope_directory_laws(
    #[strategy = proptest::collection::vec(
        proptest::option::weighted(0.7, proptest::collection::vec(any::<u8>(), 0..64)),
        1..12,
    )]
    payloads: Vec<Option<Vec<u8>>>,
) {
    // Slot 0 is always present.
    let mut payloads = payloads;
    if payloads[0].is_none() {
        payloads[0] = Some(vec![0xFF]);
    }

    let slots = u16::try_from(payloads.len()).expect("the strategy draws at most 12 slots");
    let mut envelope = EnvelopeWriter::new(Kind::Tile, slots);
    for payload in &payloads {
        match payload {
            Some(bytes) => envelope.slot(|buf| buf.extend_from_slice(bytes)),
            None => envelope.absent(),
        }
    }
    let bytes = envelope.finish();

    let mut cursor = 16 + 8 * payloads.len();
    prop_assert_eq!(cursor & 7, 0);
    for (slot, payload) in payloads.iter().enumerate() {
        let (start, end) = directory(&bytes, slot);
        if let Some(expected) = payload {
            prop_assert_eq!(start as usize, cursor);
            prop_assert_eq!(start & 7, 0);
            prop_assert_eq!((end - start) as usize, expected.len());
            prop_assert_eq!(&bytes[start as usize..end as usize], expected.as_slice());

            let padded = (end as usize).next_multiple_of(8);
            prop_assert!(bytes[end as usize..padded].iter().all(|&byte| byte == 0));
            cursor = padded;
        } else {
            prop_assert_eq!((start, end), (0, 0));
        }
    }
    prop_assert_eq!(bytes.len(), cursor);
}

mod tile {
    use hashql_core::id::{Id as _, IdSlice};

    use super::{
        BasePosition, Bounds2, DeliveredSet, GlobalHead, Icon, Label, Membership, Mode, NodeRowId,
        Sha256Digest, TileCoordinate, TileHead, TileResponse, TileTrailer, Vec2, WireRow,
        dense_set, section,
    };

    /// Builds a consistent tile of two points from one delta run.
    fn minimal<'doc>(
        positions: &'doc [Vec2],
        rows: &'doc [WireRow<NodeRowId>],
        ranges: &'doc [core::ops::Range<BasePosition>],
    ) -> TileResponse<'doc> {
        TileResponse {
            head: TileHead {
                generation: Sha256Digest::from_bytes_unchecked([0xAB; 32]),
                variant: 0,
                coordinate: TileCoordinate { z: 3, x: 2, y: 5 },
                mode: Mode::Delta,
                visible: 41,
                first_bucket: 9,
                runs: &[2],
                global: None,
                children: 0b0010,
            },
            delivered: DeliveredSet::Ranges(ranges),
            positions: IdSlice::from_raw(positions),
            rows: IdSlice::from_raw(rows),
            masks: None,
            trailer: None,
        }
    }

    #[test]
    fn head_encodes_by_hand() {
        let positions = [Vec2::new(0.0, 0.0); 12];
        let rows: Vec<WireRow<NodeRowId>> = (0..12).map(WireRow::pinned).collect();
        let ranges = [10_u32..12]
            .map(|range| BasePosition::from_u32(range.start)..BasePosition::from_u32(range.end));
        let bytes = minimal(&positions, &rows, &ranges).encode();

        // map(10): 0 bstr(32) | 1 uint 0 | 2 [3, 2, 5] | 3 uint 0 |
        // 4 uint 2 | 5 uint 41 | 6 uint 9 | 7 [2] | 9 uint 2 |
        // 10 false. Key 8 is absent without a global map.
        let mut expected = vec![0xAA, 0x00, 0x58, 0x20];
        expected.extend_from_slice(&[0xAB; 32]);
        expected.extend_from_slice(&[
            0x01, 0x00, // variant 0
            0x02, 0x83, 0x03, 0x02, 0x05, // coordinate [3, 2, 5]
            0x03, 0x00, // mode delta
            0x04, 0x02, // delivered 2
            0x05, 0x18, 0x29, // visible 41
            0x06, 0x09, // firstBucket 9
            0x07, 0x81, 0x02, // runs [2]
            0x09, 0x02, // children 0b0010
            0x0A, 0xF4, // trailer false
        ]);
        assert_eq!(section(&bytes, 0).expect("HEAD is present"), expected);
    }

    #[test]
    fn global_map_encodes_by_hand() {
        let positions = [Vec2::new(0.0, 0.0); 12];
        let rows: Vec<WireRow<NodeRowId>> = (0..12).map(WireRow::pinned).collect();
        let ranges = [10_u32..12]
            .map(|range| BasePosition::from_u32(range.start)..BasePosition::from_u32(range.end));
        let mut response = minimal(&positions, &rows, &ranges);
        response.head.global = Some(GlobalHead {
            visible: 40,
            bounds: Bounds2::new(Vec2::new(-0.5, -1.0), Vec2::new(0.25, 1.0)),
            min_resolution: 12,
        });
        let bytes = response.encode();

        let head = section(&bytes, 0).expect("HEAD is present");
        // The head map now holds eleven entries, and key 8 sits between 7 and 9:
        // map(3): 0 uint 40 | 1 [-0.5, -1.0, 0.25, 1.0] | 2 uint 12.
        assert_eq!(head[0], 0xAB);
        let global = [
            0x08, 0xA3, // key 8, map(3)
            0x00, 0x18, 0x28, // visible 40
            0x01, 0x84, // bounds, array(4)
            0xFA, 0xBF, 0x00, 0x00, 0x00, // -0.5
            0xFA, 0xBF, 0x80, 0x00, 0x00, // -1.0
            0xFA, 0x3E, 0x80, 0x00, 0x00, // 0.25
            0xFA, 0x3F, 0x80, 0x00, 0x00, // 1.0
            0x02, 0x0C, // minResolution 12
        ];
        let at = head
            .windows(global.len())
            .position(|window| window == global)
            .expect("the global map is embedded in the HEAD");
        // Key 7's runs array [2] precedes it, key 9 follows.
        assert_eq!(head[at - 3..at], [0x07, 0x81, 0x02]);
        assert_eq!(head[at + global.len()], 0x09);
    }

    #[test]
    fn columns_gather_across_ranges() {
        let positions: Vec<Vec2> = (0_u16..8)
            .map(|index| {
                Vec2::new(
                    f32::from(index) * 0.25,
                    f32::from(index).mul_add(0.125, -1.0),
                )
            })
            .collect();
        let rows: Vec<WireRow<NodeRowId>> =
            (0..8).map(|index| WireRow::pinned(100 + index)).collect();
        let ranges = [1_u32..3, 6..7]
            .map(|range| BasePosition::from_u32(range.start)..BasePosition::from_u32(range.end));

        let mut response = minimal(&positions, &rows, &ranges);
        response.head.runs = &[3];
        response.head.visible = 3;
        let bytes = response.encode();

        // POSITIONS: xy pairs of base positions 1, 2, 6.
        let mut expected = Vec::new();
        for position in [1_usize, 2, 6] {
            expected.extend_from_slice(&positions[position].x().to_le_bytes());
            expected.extend_from_slice(&positions[position].y().to_le_bytes());
        }
        assert_eq!(section(&bytes, 1).expect("POSITIONS is present"), expected);

        // ROW_IDS: rows 101, 102, 106.
        let mut expected = Vec::new();
        for row in [101_u32, 102, 106] {
            expected.extend_from_slice(&row.to_le_bytes());
        }
        assert_eq!(section(&bytes, 2).expect("ROW_IDS is present"), expected);

        // TYPE_MASK is absent without coloredTypeIds, MASS reserved.
        assert_eq!(section(&bytes, 3), None);
        assert_eq!(section(&bytes, 4), None);
    }

    #[test]
    fn masks_interleave_list_and_dense_membership() {
        let positions = [Vec2::new(0.0, 0.0); 22];
        let rows: Vec<WireRow<NodeRowId>> = (0..22).map(WireRow::pinned).collect();
        // Delivered points: base positions 4, 5, 6, 20, 21.
        let ranges = [4_u32..7, 20..22]
            .map(|range| BasePosition::from_u32(range.start)..BasePosition::from_u32(range.end));

        // type 0: list members at 5 and 20 (33 lies outside the base
        // domain of any range and is never consulted).
        let list = [5_u32, 20, 33].map(BasePosition::from_u32);
        // type 1: dense bits at 4 and 21 over N = 22.
        let dense = dense_set(22, &[4, 21]);
        // type 2: no members.
        let empty: [BasePosition; 0] = [];
        let masks = [
            Membership::List(&list),
            Membership::Dense(&dense),
            Membership::List(&empty),
        ];

        let mut response = minimal(&positions, &rows, &ranges);
        response.head.runs = &[5];
        response.head.visible = 5;
        response.masks = Some(&masks);
        let bytes = response.encode();

        // Stride ceil(3/8) = 1. Point order 4, 5, 6, 20, 21:
        // type 1 | type 0 | none | type 0 | type 1.
        assert_eq!(
            section(&bytes, 3).expect("TYPE_MASK is present"),
            [0b010, 0b001, 0b000, 0b001, 0b010]
        );
    }

    #[test]
    fn wide_masks_round_the_stride_up() {
        let positions = [Vec2::new(0.0, 0.0); 4];
        let rows: Vec<WireRow<NodeRowId>> = (0..4).map(WireRow::pinned).collect();
        let ranges = [0_u32..4]
            .map(|range| BasePosition::from_u32(range.start)..BasePosition::from_u32(range.end));

        // With nine types the stride is 2. Type 8's bit is byte 1, bit 0.
        let low = [0_u32, 2].map(BasePosition::from_u32);
        let high = [2_u32].map(BasePosition::from_u32);
        let empty: [BasePosition; 0] = [];
        let masks = [
            Membership::List(&low),
            Membership::List(&empty),
            Membership::List(&empty),
            Membership::List(&empty),
            Membership::List(&empty),
            Membership::List(&empty),
            Membership::List(&empty),
            Membership::List(&empty),
            Membership::List(&high),
        ];

        let mut response = minimal(&positions, &rows, &ranges);
        response.head.runs = &[4];
        response.masks = Some(&masks);
        let bytes = response.encode();

        assert_eq!(
            section(&bytes, 3).expect("TYPE_MASK is present"),
            [1, 0, 0, 0, 1, 1, 0, 0]
        );
    }

    #[test]
    fn masks_merge_a_gathered_delivered_set() {
        let positions = [Vec2::new(0.0, 0.0); 22];
        let rows: Vec<WireRow<NodeRowId>> = (0..22).map(WireRow::pinned).collect();
        // The same five points as the range form, gathered: today's masked walk visits
        // ascending corpus buckets, so its list ascends in base position.
        let delivered = [4_u32, 5, 6, 20, 21].map(BasePosition::from_u32);

        let list = [5_u32, 20, 33].map(BasePosition::from_u32);
        let dense = dense_set(22, &[4, 21]);
        let empty: [BasePosition; 0] = [];
        let masks = [
            Membership::List(&list),
            Membership::Dense(&dense),
            Membership::List(&empty),
        ];

        let mut response = minimal(&positions, &rows, &[]);
        response.delivered = DeliveredSet::Positions(&delivered);
        response.head.first_bucket = 0;
        response.head.runs = &[5];
        response.head.visible = 5;
        response.masks = Some(&masks);
        let bytes = response.encode();

        // Point order 4, 5, 6, 20, 21: type 1 | type 0 | none | type 0 | type 1 - the
        // range form's column, reached through the other producer shape.
        assert_eq!(
            section(&bytes, 3).expect("TYPE_MASK is present"),
            [0b010, 0b001, 0b000, 0b001, 0b010]
        );
    }

    /// Scope-bucket delivery order does not ascend in corpus base position, so this test proves
    /// every column association against delivered lists that break the ascent.
    ///
    /// The memberships give the five points five distinct masks, so no permutation error can
    /// coincide with the right answer, and the first list keeps the lowest position first and the
    /// highest last: a merge that assumed monotonicity still spans the correct window and still
    /// mis-attributes the interior, which is the silent shape of the defect.
    #[test]
    fn masks_follow_delivery_order_when_it_inverts_base_order() {
        // Coordinates and row ids are both distinct per base position and distinct from each
        // other, so a column indexed by the wrong quantity cannot coincide with the right one.
        let positions: Vec<Vec2> = (0..22_u8)
            .map(|index| Vec2::new(f32::from(index), -f32::from(index)))
            .collect();
        let rows: Vec<WireRow<NodeRowId>> =
            (0..22_u32).map(|row| WireRow::pinned(100 + row)).collect();

        // type 0: 5 and 20 (33 lies outside the base domain and is never consulted).
        let list = [5_u32, 20, 33].map(BasePosition::from_u32);
        // type 1: dense bits at 4, 20 and 21 over N = 22.
        let dense = dense_set(22, &[4, 20, 21]);
        // type 2: 6 and 21.
        let third = [6_u32, 21].map(BasePosition::from_u32);
        let masks = [
            Membership::List(&list),
            Membership::Dense(&dense),
            Membership::List(&third),
        ];
        // Masks by base position are 0b010 at 4, 0b001 at 5, 0b100 at 6, 0b011 at 20, and 0b110 at
        // 21.

        let scrambled = [4_u32, 20, 6, 5, 21].map(BasePosition::from_u32);
        let mut response = minimal(&positions, &rows, &[]);
        response.delivered = DeliveredSet::Positions(&scrambled);
        response.head.first_bucket = 0;
        response.head.runs = &[2, 3];
        response.head.visible = 5;
        response.masks = Some(&masks);
        let bytes = response.encode();

        // The column is f32 xy pairs in delivered order, so the flat reading is the contract's.
        let (coordinates, _) = section(&bytes, 1)
            .expect("POSITIONS is present")
            .as_chunks::<4>();
        let delivered_points: Vec<f32> = coordinates
            .iter()
            .copied()
            .map(f32::from_le_bytes)
            .collect();
        assert_eq!(
            delivered_points,
            [4.0, -4.0, 20.0, -20.0, 6.0, -6.0, 5.0, -5.0, 21.0, -21.0]
        );

        let (row_ids, _) = section(&bytes, 2)
            .expect("ROW_IDS is present")
            .as_chunks::<4>();
        let delivered_rows: Vec<u32> = row_ids.iter().copied().map(u32::from_le_bytes).collect();
        assert_eq!(delivered_rows, [104, 120, 106, 105, 121]);

        // Point order 4, 20, 6, 5, 21. A monotone cursor answers [2, 3, 0, 0, 6] here. The count
        // and the length are right and nothing panics, yet two points come back unmasked.
        assert_eq!(
            section(&bytes, 3).expect("TYPE_MASK is present"),
            [0b010, 0b011, 0b100, 0b001, 0b110]
        );

        // The literal inversion sets delivery order fully descending in base position.
        let inverted = [21_u32, 20, 6, 5, 4].map(BasePosition::from_u32);
        response.delivered = DeliveredSet::Positions(&inverted);
        let bytes = response.encode();

        assert_eq!(
            section(&bytes, 3).expect("TYPE_MASK is present"),
            [0b110, 0b011, 0b100, 0b001, 0b010]
        );
    }

    #[test]
    fn trailer_encodes_labels_and_icons() {
        let positions = [Vec2::new(0.0, 0.0); 12];
        let rows: Vec<WireRow<NodeRowId>> = (0..12).map(WireRow::pinned).collect();
        let ranges = [10_u32..12]
            .map(|range| BasePosition::from_u32(range.start)..BasePosition::from_u32(range.end));

        let mut response = minimal(&positions, &rows, &ranges);
        response.trailer = Some(TileTrailer {
            labels: &const { [Label::new("a"), Label::empty()] },
            icons: &const { [Icon::empty(), Icon::new("\u{fc}")] },
        });
        let bytes = response.encode();

        // The HEAD echoes the trailer.
        let head = section(&bytes, 0).expect("HEAD is present");
        assert_eq!(head[head.len() - 2..], [0x0A, 0xF5]);

        // The tail follows the last padded column:
        // map(2): 0 ["a", null] | 1 [null, "ü"].
        let last = super::directory(&bytes, 2).1 as usize;
        let tail = &bytes[last.next_multiple_of(8)..];
        assert_eq!(
            tail,
            [
                0xA2, 0x00, 0x82, 0x61, 0x61, 0xF6, 0x01, 0x82, 0xF6, 0x62, 0xC3, 0xBC
            ]
        );
    }

    #[test]
    fn zero_point_tile_is_present_empty() {
        let positions: [Vec2; 0] = [];
        let rows: [WireRow<NodeRowId>; 0] = [];
        let ranges: [core::ops::Range<BasePosition>; 0] = [];

        let mut response = minimal(&positions, &rows, &ranges);
        response.head.runs = &[0];
        response.head.visible = 0;
        response.head.children = 0;
        let bytes = response.encode();

        let (start, end) = super::directory(&bytes, 1);
        assert_eq!(start, end);
        assert_ne!(start, 0, "zero points are present-empty, not absent");
        assert_eq!(super::directory(&bytes, 2), (start, end));
    }

    #[test]
    #[should_panic(expected = "must count exactly the HEAD runs")]
    fn disagreeing_runs_are_rejected() {
        let positions = [Vec2::new(0.0, 0.0); 12];
        let rows: Vec<WireRow<NodeRowId>> = (0..12).map(WireRow::pinned).collect();
        let ranges = [10_u32..12]
            .map(|range| BasePosition::from_u32(range.start)..BasePosition::from_u32(range.end));

        let mut response = minimal(&positions, &rows, &ranges);
        response.head.runs = &[3];
        let _bytes = response.encode();
    }

    #[test]
    #[should_panic(expected = "reserved zero")]
    fn reserved_children_bits_are_rejected() {
        let positions = [Vec2::new(0.0, 0.0); 12];
        let rows: Vec<WireRow<NodeRowId>> = (0..12).map(WireRow::pinned).collect();
        let ranges = [10_u32..12]
            .map(|range| BasePosition::from_u32(range.start)..BasePosition::from_u32(range.end));

        let mut response = minimal(&positions, &rows, &ranges);
        response.head.children = 16;
        let _bytes = response.encode();
    }

    #[test]
    #[should_panic(expected = "trailer labels must cover")]
    fn short_trailers_are_rejected() {
        let positions = [Vec2::new(0.0, 0.0); 12];
        let rows: Vec<WireRow<NodeRowId>> = (0..12).map(WireRow::pinned).collect();
        let ranges = [10_u32..12]
            .map(|range| BasePosition::from_u32(range.start)..BasePosition::from_u32(range.end));

        let mut response = minimal(&positions, &rows, &ranges);
        response.trailer = Some(TileTrailer {
            labels: &const { [Label::new("a")] },
            icons: &const { [Icon::empty(); 2] },
        });
        let _bytes = response.encode();
    }
}

mod edges {
    use alloc::borrow::Cow;
    use std::sync::LazyLock;

    use hashql_core::id::IdSlice;

    use super::{EdgesResponse, EdgesTrailer, Label, Sha256Digest, identity_of, section};
    use crate::serve::{TableIndex, neighbourhood::EdgeColumns};

    /// The three-edge columns behind the minimal response.
    static EDGES: LazyLock<EdgeColumns> = LazyLock::new(|| {
        EdgeColumns::pinned([
            (4, 7, identity_of(0x11)),
            (9, 2, identity_of(0x22)),
            (4, 11, identity_of(0x33)),
        ])
    });

    /// A three-edge response without a trailer.
    fn minimal() -> EdgesResponse<'static> {
        EdgesResponse {
            generation: Sha256Digest::from_bytes_unchecked([0xCD; 32]),
            variant: 1,
            complete: false,
            edges: &EDGES,
            trailer: None,
        }
    }

    #[test]
    fn head_encodes_by_hand() {
        let bytes = minimal().encode();
        assert_eq!(bytes[0..8], *b"SALTILEE");

        // map(5): 0 bstr(32) | 1 uint 1 | 2 uint 3 | 3 false |
        // 4 false.
        let mut expected = vec![0xA5, 0x00, 0x58, 0x20];
        expected.extend_from_slice(&[0xCD; 32]);
        expected.extend_from_slice(&[0x01, 0x01, 0x02, 0x03, 0x03, 0xF4, 0x04, 0xF4]);
        assert_eq!(section(&bytes, 0).expect("HEAD is present"), expected);
    }

    #[test]
    fn columns_encode_little_endian() {
        let bytes = minimal().encode();

        let mut expected = Vec::new();
        for source in [4_u32, 9, 4] {
            expected.extend_from_slice(&source.to_le_bytes());
        }
        assert_eq!(
            section(&bytes, 1).expect("EDGE_SOURCES is present"),
            expected
        );

        // EDGE_IDS: raw 32-byte identity records, concatenated.
        let mut expected = Vec::new();
        for id in [[0x11_u8; 32], [0x22; 32], [0x33; 32]] {
            expected.extend_from_slice(&id);
        }
        assert_eq!(section(&bytes, 3).expect("EDGE_IDS is present"), expected);
    }

    #[test]
    fn trailer_carries_the_link_columns() {
        let mut response = minimal();
        response.trailer = Some(EdgesTrailer {
            type_table: IdSlice::from_raw(&const { [Cow::Borrowed("s"), Cow::Borrowed("t")] }),
            link_labels: IdSlice::from_raw(
                &const { [Label::new("a"), Label::empty(), Label::empty()] },
            ),
            link_type_ids: IdSlice::from_raw(
                &const { [Some(TableIndex::new(1)), Some(TableIndex::new(0)), None] },
            ),
        });
        let bytes = response.encode();

        let head = section(&bytes, 0).expect("HEAD is present");
        assert_eq!(head[head.len() - 2..], [0x04, 0xF5]);

        let last = super::directory(&bytes, 3).1 as usize;
        let tail = &bytes[last.next_multiple_of(8)..];
        // map(3): 0 ["s", "t"] | 1 ["a", null, null] |
        // 2 [1, 0, null].
        let expected = [
            0xA3, 0x00, 0x82, 0x61, 0x73, 0x61, 0x74, 0x01, 0x83, 0x61, 0x61, 0xF6, 0xF6, 0x02,
            0x83, 0x01, 0x00, 0xF6,
        ];
        assert_eq!(tail, expected);
    }

    #[test]
    fn zero_edge_response_is_present_empty() {
        let empty = EdgeColumns::pinned([]);
        let mut response = minimal();
        response.edges = &empty;
        let bytes = response.encode();

        for slot in 1..4 {
            let (start, end) = super::directory(&bytes, slot);
            assert_eq!(start, end);
            assert_ne!(start, 0);
        }
    }

    #[test]
    #[should_panic(expected = "link type ids must cover")]
    fn short_trailers_are_rejected() {
        let mut response = minimal();
        response.trailer = Some(EdgesTrailer {
            type_table: IdSlice::from_raw(&[]),
            link_labels: IdSlice::from_raw(&const { [Label::empty(); 3] }),
            link_type_ids: IdSlice::from_raw(&[None]),
        });
        let _bytes = response.encode();
    }
}

mod locate {
    use alloc::borrow::Cow;
    use std::sync::LazyLock;

    use hashql_core::id::{Id as _, IdSlice};
    use type_system::ontology::id::VersionedUrl;

    use super::{
        BasePosition, DenseBitSlice, Label, LocateResponse, LocateTrailer, Membership, PropertyMap,
        PropertyValue, Sha256Digest, TileCoordinate, Vec2, WireRow, dense_set, identity_of,
        section,
    };
    use crate::serve::{TableIndex, hydrate::EdgeSlot, neighbourhood::EdgeColumns};

    /// The four-point base-order coordinate column behind the tests.
    fn points() -> [Vec2; 4] {
        [
            Vec2::new(0.0, 0.5),
            Vec2::new(1.0, 1.5),
            Vec2::new(2.0, 2.5),
            Vec2::new(3.0, 3.5),
        ]
    }

    /// The two-edge link-type lists behind the minimal trailer: both empty.
    static NO_TYPES: [Vec<TableIndex<VersionedUrl>>; 2] = [Vec::new(), Vec::new()];

    /// The two-edge completeness set behind the minimal trailer: nothing complete.
    static NO_FLAGS: LazyLock<Box<DenseBitSlice<EdgeSlot>>> = LazyLock::new(|| dense_set(2, &[]));

    /// The two-edge columns behind the minimal response.
    static EDGES: LazyLock<EdgeColumns> = LazyLock::new(|| {
        EdgeColumns::pinned([(10, 12, identity_of(0x44)), (12, 13, identity_of(0x55))])
    });

    /// A three-node, two-edge response with an all-null trailer.
    ///
    /// Delivered base positions 2, 0, 3 (source first) over a four-point base column. Locate is the
    /// detail view, so every document includes the trailer, and the minimal document has empty
    /// tables and null columns.
    fn minimal(positions: &[Vec2]) -> LocateResponse<'_> {
        LocateResponse {
            generation: Sha256Digest::from_bytes_unchecked([0xAB; 32]),
            variant: 0,
            cell: TileCoordinate { z: 2, x: 1, y: 3 },
            complete: true,
            entity_id: identity_of(0xEE),
            type_ids_complete: false,
            properties_complete: true,
            delivered: IdSlice::from_raw(
                &const {
                    [
                        BasePosition::from_u32(2),
                        BasePosition::from_u32(0),
                        BasePosition::from_u32(3),
                    ]
                },
            ),
            positions: IdSlice::from_raw(positions),
            rows: IdSlice::from_raw(
                &const {
                    [
                        WireRow::pinned(10),
                        WireRow::pinned(11),
                        WireRow::pinned(12),
                        WireRow::pinned(13),
                    ]
                },
            ),
            masks: None,
            edges: &EDGES,
            trailer: LocateTrailer {
                type_table: IdSlice::from_raw(&[]),
                property_table: IdSlice::from_raw(&[]),
                labels: IdSlice::from_raw(&const { [Label::empty(); 3] }),
                type_ids: IdSlice::from_raw(&[None, None, None]),
                properties: None,
                link_labels: IdSlice::from_raw(&const { [Label::empty(); 2] }),
                link_type_ids: IdSlice::from_raw(&NO_TYPES),
                link_type_ids_complete: &NO_FLAGS,
                link_properties: IdSlice::from_raw(&[None, None]),
                link_properties_complete: &NO_FLAGS,
            },
        }
    }

    #[test]
    fn head_encodes_by_hand() {
        let positions = points();
        let bytes = minimal(&positions).encode();
        assert_eq!(bytes[0..8], *b"SALTILEL");

        // map(10): 0 bstr(32) | 1 uint 0 | 2 uint 3 | 3 uint 2 |
        // 4 [2, 1, 3] | 5 uint 2 | 6 true | 7 bstr(32) | 8 false |
        // 9 true.
        let mut expected = vec![0xAA, 0x00, 0x58, 0x20];
        expected.extend_from_slice(&[0xAB; 32]);
        expected.extend_from_slice(&[
            0x01, 0x00, 0x02, 0x03, 0x03, 0x02, 0x04, 0x83, 0x02, 0x01, 0x03, 0x05, 0x02, 0x06,
            0xF5, 0x07, 0x58, 0x20,
        ]);
        expected.extend_from_slice(&[0xEE; 32]);
        expected.extend_from_slice(&[0x08, 0xF4, 0x09, 0xF5]);
        assert_eq!(section(&bytes, 0).expect("HEAD is present"), expected);
    }

    #[test]
    fn columns_gather_in_delivered_order() {
        let positions = points();
        let bytes = minimal(&positions).encode();

        // POSITIONS: base positions 2, 0, 3 as xy pairs.
        let mut expected = Vec::new();
        for point in [positions[2], positions[0], positions[3]] {
            expected.extend_from_slice(&point.x().to_le_bytes());
            expected.extend_from_slice(&point.y().to_le_bytes());
        }
        assert_eq!(section(&bytes, 1).expect("POSITIONS is present"), expected);

        // ROW_IDS: the row column read at 2, 0, 3.
        let mut expected = Vec::new();
        for row in [12_u32, 10, 13] {
            expected.extend_from_slice(&row.to_le_bytes());
        }
        assert_eq!(section(&bytes, 2).expect("ROW_IDS is present"), expected);

        // No coloredTypeIds: TYPE_MASK is absent, not empty.
        assert!(section(&bytes, 3).is_none());

        // Endpoint columns, edge order.
        for (slot, column) in [(4_usize, [10_u32, 12]), (5, [12, 13])] {
            let mut expected = Vec::new();
            for value in column {
                expected.extend_from_slice(&value.to_le_bytes());
            }
            assert_eq!(
                section(&bytes, slot).expect("edge columns are present"),
                expected,
                "slot {slot}",
            );
        }

        // EDGE_IDS: raw 32-byte identity records, concatenated.
        let mut expected = Vec::new();
        for id in [[0x44_u8; 32], [0x55; 32]] {
            expected.extend_from_slice(&id);
        }
        assert_eq!(section(&bytes, 6).expect("EDGE_IDS is present"), expected);
    }

    #[test]
    fn masks_probe_the_delivered_list() {
        let positions = points();
        // type 0: list members at base positions 0 and 2; type 1:
        // dense bit at 3 over N = 4.
        let list = [0_u32, 2].map(BasePosition::from_u32);
        let dense = dense_set(4, &[3]);
        let masks = [Membership::List(&list), Membership::Dense(&dense)];

        let mut response = minimal(&positions);
        response.masks = Some(&masks);
        let bytes = response.encode();

        // Stride ceil(2/8) = 1. Delivered order 2, 0, 3:
        // type 0 | type 0 | type 1.
        assert_eq!(
            section(&bytes, 3).expect("TYPE_MASK is present"),
            [0b01, 0b01, 0b10]
        );
    }

    #[test]
    fn trailer_encodes_by_hand() {
        let positions = points();
        let lists = [vec![TableIndex::new(1), TableIndex::new(0)], Vec::new()];
        let source_map = PropertyMap::new_unchecked(vec![
            (TableIndex::new(0), PropertyValue::Text("x")),
            (TableIndex::new(1), PropertyValue::Integer(-2)),
        ]);
        let link_map = PropertyMap::new_unchecked(vec![
            (TableIndex::new(0), PropertyValue::Boolean(true)),
            (TableIndex::new(1), PropertyValue::Null),
        ]);
        let link_properties: [Option<&PropertyMap<'_>>; 2] = [Some(&link_map), None];
        // Slot 0's type list is complete and slot 1's property map is, over the two delivered
        // edges.
        let type_flags = dense_set::<EdgeSlot>(2, &[0]);
        let property_flags = dense_set::<EdgeSlot>(2, &[1]);
        let mut response = minimal(&positions);
        response.trailer = LocateTrailer {
            type_table: IdSlice::from_raw(&const { [Cow::Borrowed("s"), Cow::Borrowed("t")] }),
            property_table: IdSlice::from_raw(&const { [Cow::Borrowed("a"), Cow::Borrowed("b")] }),
            labels: IdSlice::from_raw(&const { [Label::new("n"), Label::empty(), Label::empty()] }),
            type_ids: IdSlice::from_raw(
                &const { [Some(TableIndex::new(1)), None, Some(TableIndex::new(0))] },
            ),
            properties: Some(&source_map),
            link_labels: IdSlice::from_raw(&const { [Label::new("l"), Label::empty()] }),
            link_type_ids: IdSlice::from_raw(&lists),
            link_type_ids_complete: &type_flags,
            link_properties: IdSlice::from_raw(&link_properties),
            link_properties_complete: &property_flags,
        };
        let bytes = response.encode();

        let last = super::directory(&bytes, 6).1 as usize;
        let tail = &bytes[last.next_multiple_of(8)..];
        // map(10): 0 ["s", "t"] | 1 ["a", "b"] | 2 ["n", null x2] |
        // 3 [1, null, 0] | 4 {0: "x", 1: -2} | 5 ["l", null] |
        // 6 [[1, 0], []] | 7 bstr 0b01 in one 8-byte word |
        // 8 [{0: true, 1: null}, null] | 9 bstr 0b10 in one 8-byte word.
        let expected = [
            0xAA, 0x00, 0x82, 0x61, 0x73, 0x61, 0x74, 0x01, 0x82, 0x61, 0x61, 0x61, 0x62, 0x02,
            0x83, 0x61, 0x6E, 0xF6, 0xF6, 0x03, 0x83, 0x01, 0xF6, 0x00, 0x04, 0xA2, 0x00, 0x61,
            0x78, 0x01, 0x21, 0x05, 0x82, 0x61, 0x6C, 0xF6, 0x06, 0x82, 0x82, 0x01, 0x00, 0x80,
            0x07, 0x48, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x08, 0x82, 0xA2, 0x00,
            0xF5, 0x01, 0xF6, 0xF6, 0x09, 0x48, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        ];
        assert_eq!(tail, expected);
    }

    #[test]
    fn source_only_response_is_present_empty_on_edges() {
        let positions = points();
        let no_edges = dense_set::<EdgeSlot>(0, &[]);
        let empty = EdgeColumns::pinned([]);
        let mut response = minimal(&positions);
        response.delivered = IdSlice::from_raw(&const { [BasePosition::from_u32(1)] });
        response.edges = &empty;
        response.trailer.labels = IdSlice::from_raw(&const { [Label::empty()] });
        response.trailer.type_ids = IdSlice::from_raw(&[None]);
        response.trailer.link_labels = IdSlice::from_raw(&[]);
        response.trailer.link_type_ids = IdSlice::from_raw(&[]);
        response.trailer.link_type_ids_complete = &no_edges;
        response.trailer.link_properties = IdSlice::from_raw(&[]);
        response.trailer.link_properties_complete = &no_edges;
        let bytes = response.encode();

        for slot in [4_usize, 5, 6] {
            let (start, end) = super::directory(&bytes, slot);
            assert_eq!(start, end, "slot {slot}");
            assert_ne!(start, 0, "slot {slot}");
        }
    }

    #[test]
    #[should_panic(expected = "labels must cover exactly the delivered nodes")]
    fn short_trailers_are_rejected() {
        let positions = points();
        let mut response = minimal(&positions);
        response.trailer.labels = IdSlice::from_raw(&const { [Label::empty()] });
        let _bytes = response.encode();
    }

    #[test]
    #[should_panic(expected = "type ids must cover exactly the delivered nodes")]
    fn short_type_id_columns_are_rejected() {
        let positions = points();
        let mut response = minimal(&positions);
        response.trailer.type_ids = IdSlice::from_raw(&[None]);
        let _bytes = response.encode();
    }

    #[test]
    #[should_panic(expected = "type completeness must cover exactly the delivered edges")]
    fn short_bitmask_columns_are_rejected() {
        // One edge slot where the response delivers two.
        let positions = points();
        let short = dense_set::<EdgeSlot>(1, &[]);
        let mut response = minimal(&positions);
        response.trailer.link_type_ids_complete = &short;
        let _bytes = response.encode();
    }

    #[test]
    #[should_panic(expected = "property map keys must ascend")]
    fn descending_property_keys_are_rejected() {
        let _map = PropertyMap::new_unchecked(vec![
            (TableIndex::new(1), PropertyValue::Null),
            (TableIndex::new(0), PropertyValue::Null),
        ]);
    }
}
