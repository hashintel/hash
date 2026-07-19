//! Wire encoder tests: hand-derived bytes for every layer.
//!
//! CBOR expectations come from RFC 8949 appendix A where the profile
//! covers them and are derived by hand at the byte level otherwise;
//! envelope and response expectations are derived in comments before
//! the assertions. The checked-in goldens (`goldens.rs`) carry the
//! cross-language corpus; these tests pin the layers separately so a
//! failure names its layer.

use proptest::prelude::*;

use super::{
    Kind, Mode,
    cbor::CborWriter,
    edges::{EdgesResponse, EdgesTrailer},
    envelope::EnvelopeWriter,
    tile::{GlobalHead, TileCoordinate, TileHead, TileResponse, TileTrailer},
};
use crate::{
    integrity::Sha256Digest,
    math::{Bounds2, Vec2},
    salt::postings::mapped::Membership,
};

/// Reads slot `slot`'s directory entry from a finished response.
pub(super) fn directory(bytes: &[u8], slot: usize) -> (u32, u32) {
    let entry = 16 + 8 * slot;
    let start = u32::from_le_bytes(bytes[entry..entry + 4].try_into().expect("four bytes"));
    let end = u32::from_le_bytes(bytes[entry + 4..entry + 8].try_into().expect("four bytes"));

    (start, end)
}

/// Slices slot `slot`'s payload; [`None`] when the slot is absent.
pub(super) fn section(bytes: &[u8], slot: usize) -> Option<&[u8]> {
    let (start, end) = directory(bytes, slot);
    if (start, end) == (0, 0) {
        return None;
    }

    Some(&bytes[start as usize..end as usize])
}

mod cbor {
    use super::CborWriter;

    /// Encodes one value through a fresh writer.
    fn encoded(emit: impl FnOnce(&mut CborWriter)) -> Vec<u8> {
        let mut writer = CborWriter::new();
        emit(&mut writer);
        writer.into_bytes()
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
            (65535, vec![0x19, 0xFF, 0xFF]),
            (65536, vec![0x1A, 0x00, 0x01, 0x00, 0x00]),
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
    fn a_two_slot_envelope_lays_out_by_hand() {
        let mut envelope = EnvelopeWriter::new(Kind::Tile, 2);
        envelope.present(&[0xAA, 0xBB, 0xCC]);
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
        envelope.present(&[0x01]);
        envelope.present(&[]);
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
    fn the_trailer_follows_the_aligned_end_unpadded() {
        let mut envelope = EnvelopeWriter::new(Kind::Tile, 1);
        envelope.present(&[0x11, 0x22]);
        let bytes = envelope.finish_with_trailer(&[0xA0]);

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
        envelope.present(&[0x01]);
        envelope.present(&[0x02]);
    }

    #[test]
    #[should_panic(expected = "declares 2 slots")]
    fn missing_slots_are_rejected() {
        let mut envelope = EnvelopeWriter::new(Kind::Tile, 2);
        envelope.present(&[0x01]);
        let _bytes = envelope.finish();
    }
}

proptest! {
    /// The directory laws hold for every present/absent payload mix:
    /// sequential 8-aligned starts from the fixed payload origin,
    /// extents matching payload lengths, zero padding, and a total
    /// length of the last present end aligned to 8.
    #[test]
    fn envelope_directory_laws(
        payloads in proptest::collection::vec(
            proptest::option::weighted(0.7, proptest::collection::vec(any::<u8>(), 0..64)),
            1..12,
        ),
    ) {
        // Slot 0 is always present.
        let mut payloads = payloads;
        if payloads[0].is_none() {
            payloads[0] = Some(vec![0xFF]);
        }

        let slots = payloads.len() as u16;
        let mut envelope = EnvelopeWriter::new(Kind::Tile, slots);
        for payload in &payloads {
            match payload {
                Some(bytes) => envelope.present(bytes),
                None => envelope.absent(),
            }
        }
        let bytes = envelope.finish();

        let mut cursor = 16 + 8 * payloads.len();
        prop_assert_eq!(cursor % 8, 0);
        for (slot, payload) in payloads.iter().enumerate() {
            let (start, end) = directory(&bytes, slot);
            match payload {
                Some(expected) => {
                    prop_assert_eq!(start as usize, cursor);
                    prop_assert_eq!(start % 8, 0);
                    prop_assert_eq!((end - start) as usize, expected.len());
                    prop_assert_eq!(&bytes[start as usize..end as usize], &expected[..]);

                    let padded = (end as usize).next_multiple_of(8);
                    prop_assert!(bytes[end as usize..padded].iter().all(|&byte| byte == 0));
                    cursor = padded;
                }
                None => prop_assert_eq!((start, end), (0, 0)),
            }
        }
        prop_assert_eq!(bytes.len(), cursor);
    }
}

mod tile {
    use super::{
        Bounds2, GlobalHead, Membership, Mode, Sha256Digest, TileCoordinate, TileHead,
        TileResponse, TileTrailer, Vec2, section,
    };

    /// A tiny consistent tile: two points from one delta run.
    fn minimal<'doc>(
        positions: &'doc [Vec2],
        rows: &'doc [u32],
        ranges: &'doc [core::ops::Range<u32>],
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
            ranges,
            positions,
            rows,
            masks: None,
            trailer: None,
        }
    }

    #[test]
    fn the_head_encodes_by_hand() {
        let positions = [Vec2::new(0.0, 0.0); 12];
        let rows: Vec<u32> = (0..12).collect();
        let ranges = [10_u32..12];
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
    fn the_global_map_encodes_by_hand() {
        let positions = [Vec2::new(0.0, 0.0); 12];
        let rows: Vec<u32> = (0..12).collect();
        let ranges = [10_u32..12];
        let mut response = minimal(&positions, &rows, &ranges);
        response.head.global = Some(GlobalHead {
            visible: 40,
            bounds: Bounds2::new(Vec2::new(-0.5, -1.0), Vec2::new(0.25, 1.0)),
            min_resolution: 12,
        });
        let bytes = response.encode();

        let head = section(&bytes, 0).expect("HEAD is present");
        // Eleven entries now, and key 8 sits between 7 and 9:
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
            .map(|index| Vec2::new(f32::from(index) * 0.25, -1.0 + f32::from(index) * 0.125))
            .collect();
        let rows: Vec<u32> = (0..8).map(|index| 100 + index).collect();
        let ranges = [1_u32..3, 6..7];

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
        let rows: Vec<u32> = (0..22).collect();
        // Delivered points: base positions 4, 5, 6, 20, 21.
        let ranges = [4_u32..7, 20..22];

        // type 0: list members at 5 and 20 (33 lies outside the base
        // domain of any range and is never consulted).
        let list = [5_u32, 20, 33];
        // type 1: dense bits at 4 and 21 over N = 22 (one word).
        let dense = [(1_u32 << 4) | (1 << 21)];
        // type 2: no members.
        let empty: [u32; 0] = [];
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
        let rows: Vec<u32> = (0..4).collect();
        let ranges = [0_u32..4];

        // Nine types: stride 2. Type 8's bit is byte 1, bit 0.
        let low = [0_u32, 2];
        let high = [2_u32];
        let empty: [u32; 0] = [];
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
    fn the_trailer_encodes_labels_and_icons() {
        let positions = [Vec2::new(0.0, 0.0); 12];
        let rows: Vec<u32> = (0..12).collect();
        let ranges = [10_u32..12];

        let mut response = minimal(&positions, &rows, &ranges);
        response.trailer = Some(TileTrailer {
            labels: &[Some("a"), None],
            icons: &[None, Some("\u{fc}")],
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
    fn a_zero_point_tile_is_present_empty() {
        let positions: [Vec2; 0] = [];
        let rows: [u32; 0] = [];
        let ranges: [core::ops::Range<u32>; 0] = [];

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
    #[should_panic(expected = "must agree on the point count")]
    fn disagreeing_runs_are_rejected() {
        let positions = [Vec2::new(0.0, 0.0); 12];
        let rows: Vec<u32> = (0..12).collect();
        let ranges = [10_u32..12];

        let mut response = minimal(&positions, &rows, &ranges);
        response.head.runs = &[3];
        let _bytes = response.encode();
    }

    #[test]
    #[should_panic(expected = "reserved zero")]
    fn reserved_children_bits_are_rejected() {
        let positions = [Vec2::new(0.0, 0.0); 12];
        let rows: Vec<u32> = (0..12).collect();
        let ranges = [10_u32..12];

        let mut response = minimal(&positions, &rows, &ranges);
        response.head.children = 16;
        let _bytes = response.encode();
    }

    #[test]
    #[should_panic(expected = "trailer labels must cover")]
    fn short_trailers_are_rejected() {
        let positions = [Vec2::new(0.0, 0.0); 12];
        let rows: Vec<u32> = (0..12).collect();
        let ranges = [10_u32..12];

        let mut response = minimal(&positions, &rows, &ranges);
        response.trailer = Some(TileTrailer {
            labels: &[Some("a")],
            icons: &[None, None],
        });
        let _bytes = response.encode();
    }
}

mod edges {
    use super::{EdgesResponse, EdgesTrailer, Sha256Digest, section};

    /// A three-edge response without a trailer.
    fn minimal() -> EdgesResponse<'static> {
        EdgesResponse {
            generation: Sha256Digest::from_bytes_unchecked([0xCD; 32]),
            variant: 1,
            complete: false,
            sources: &[4, 9, 4],
            targets: &[7, 2, 11],
            edge_rows: &[100, 205, 3],
            trailer: None,
        }
    }

    #[test]
    fn the_head_encodes_by_hand() {
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

        let mut expected = Vec::new();
        for edge in [100_u32, 205, 3] {
            expected.extend_from_slice(&edge.to_le_bytes());
        }
        assert_eq!(
            section(&bytes, 3).expect("EDGE_ROW_IDS is present"),
            expected
        );
    }

    #[test]
    fn the_trailer_carries_four_arrays() {
        let mut response = minimal();
        response.trailer = Some(EdgesTrailer {
            link_labels: &[Some("a"), None, None],
            link_icons: &[None, None, None],
            link_type_labels: &[None, Some("b"), None],
            link_type_icons: &[None, None, None],
        });
        let bytes = response.encode();

        let head = section(&bytes, 0).expect("HEAD is present");
        assert_eq!(head[head.len() - 2..], [0x04, 0xF5]);

        let last = super::directory(&bytes, 3).1 as usize;
        let tail = &bytes[last.next_multiple_of(8)..];
        // map(4): 0 ["a", null, null] | 1 [null x3] |
        // 2 [null, "b", null] | 3 [null x3].
        assert_eq!(
            tail,
            [
                0xA4, 0x00, 0x83, 0x61, 0x61, 0xF6, 0xF6, 0x01, 0x83, 0xF6, 0xF6, 0xF6, 0x02, 0x83,
                0xF6, 0x61, 0x62, 0xF6, 0x03, 0x83, 0xF6, 0xF6, 0xF6,
            ]
        );
    }

    #[test]
    fn a_zero_edge_response_is_present_empty() {
        let mut response = minimal();
        response.sources = &[];
        response.targets = &[];
        response.edge_rows = &[];
        let bytes = response.encode();

        for slot in 1..4 {
            let (start, end) = super::directory(&bytes, slot);
            assert_eq!(start, end);
            assert_ne!(start, 0);
        }
    }

    #[test]
    #[should_panic(expected = "must cover the same edges")]
    fn ragged_columns_are_rejected() {
        let mut response = minimal();
        response.targets = &[7, 2];
        let _bytes = response.encode();
    }

    #[test]
    #[should_panic(expected = "link type labels must cover")]
    fn short_trailers_are_rejected() {
        let mut response = minimal();
        response.trailer = Some(EdgesTrailer {
            link_labels: &[None, None, None],
            link_icons: &[None, None, None],
            link_type_labels: &[None],
            link_type_icons: &[None, None, None],
        });
        let _bytes = response.encode();
    }
}
