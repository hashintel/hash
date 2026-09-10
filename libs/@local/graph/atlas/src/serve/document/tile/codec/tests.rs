#![expect(
    clippy::little_endian_bytes,
    reason = "the tests read the envelope directory and build its little-endian columns"
)]
#![expect(
    clippy::big_endian_bytes,
    reason = "CBOR arguments are network byte order (RFC 8949 section 3)"
)]

use alloc::alloc::Global;

use hashql_core::id::{IdVec, bit_vec::BitMatrix};

use super::{
    super::{GlobalHead, TileDocument, TileSlot, TileTrailer},
    TileResponse,
};
use crate::{
    dataset::auxiliary::{Icon, Label},
    file::generation::GenerationId,
    identity::NodeRowId,
    integrity::Sha256Digest,
    math::{Bounds2, Vec2},
    morton::{Depth, MortonTile},
    serve::{
        codec::EncodedRowId,
        document::{Document as _, Mode, masks::TypeMasks},
        membership::SelectionSlot,
    },
};

/// The envelope prefix width.
const PREFIX: usize = 16;
/// The width of one directory entry.
const ENTRY: usize = 8;
/// The slot count of a `SALTILET` envelope.
const SLOTS: usize = 5;
/// The directory index of the mask column.
const MASK_SLOT: usize = 3;
/// The directory index of the slot reserved for density.
const DENSITY_SLOT: usize = 4;

const CBOR_TRUE: u8 = 0xF5;
const CBOR_FALSE: u8 = 0xF4;
const CBOR_NULL: u8 = 0xF6;
/// The head of a single-precision float.
const CBOR_HEAD_F32: u8 = 0xFA;

/// Encodes one CBOR head in shortest form (RFC 8949 section 3).
///
/// # Panics
///
/// Panics above 255. No expectation in this module reaches a two-byte argument.
fn cbor_head(major: u8, argument: u64) -> Vec<u8> {
    let ty = major << 5;
    match argument {
        0..0x18 => vec![ty | u8::try_from(argument).expect("should fit the inline argument")],
        0x18..=0xFF => vec![
            ty | 0x18,
            u8::try_from(argument).expect("should fit the one-byte argument"),
        ],
        _ => panic!("should stay below a two-byte CBOR argument"),
    }
}

fn cbor_uint(value: u64) -> Vec<u8> {
    cbor_head(0, value)
}

fn cbor_bytes(value: &[u8]) -> Vec<u8> {
    let mut bytes = cbor_head(2, value.len() as u64);
    bytes.extend_from_slice(value);
    bytes
}

fn cbor_text(value: &str) -> Vec<u8> {
    let mut bytes = cbor_head(3, value.len() as u64);
    bytes.extend_from_slice(value.as_bytes());
    bytes
}

fn cbor_bool(value: bool) -> Vec<u8> {
    vec![if value { CBOR_TRUE } else { CBOR_FALSE }]
}

/// Encodes a single-precision float: the head, then the bit pattern in network byte order.
fn cbor_f32(value: f32) -> Vec<u8> {
    let mut bytes = vec![CBOR_HEAD_F32];
    bytes.extend_from_slice(&value.to_bits().to_be_bytes());
    bytes
}

/// Concatenates one definite-length array from its items.
fn cbor_array(items: impl IntoIterator<Item = Vec<u8>>) -> Vec<u8> {
    let items: Vec<_> = items.into_iter().collect();
    let mut bytes = cbor_head(4, items.len() as u64);
    for item in items {
        bytes.extend(item);
    }
    bytes
}

/// Concatenates one definite-length map from its unsigned keys and encoded values.
fn cbor_map(pairs: impl IntoIterator<Item = (u64, Vec<u8>)>) -> Vec<u8> {
    let pairs: Vec<_> = pairs.into_iter().collect();
    let mut bytes = cbor_head(5, pairs.len() as u64);
    for (key, value) in pairs {
        bytes.extend(cbor_uint(key));
        bytes.extend(value);
    }
    bytes
}

/// Reads one directory entry, never a slot's payload.
fn slot_range(buffer: &[u8], slot: usize) -> (usize, usize) {
    let at = PREFIX + ENTRY * slot;
    let start = u32::from_le_bytes(
        buffer[at..at + 4]
            .try_into()
            .expect("should contain a start offset"),
    );
    let end = u32::from_le_bytes(
        buffer[at + 4..at + 8]
            .try_into()
            .expect("should contain an end offset"),
    );
    (start as usize, end as usize)
}

fn slot_bytes(buffer: &[u8], slot: usize) -> &[u8] {
    let (start, end) = slot_range(buffer, slot);
    &buffer[start..end]
}

/// Returns the bytes the writer appended past the last written slot's padding.
///
/// The mask column goes unwritten whenever a request selects no types. The density slot goes
/// unwritten in every response. Either way the final directory entry stays zero, and the trailer
/// follows the last slot the writer filled, at that slot's recorded end rounded up to the next
/// multiple of eight.
fn trailer_bytes(buffer: &[u8]) -> &[u8] {
    let (_, end) = (0..SLOTS)
        .rev()
        .map(|slot| slot_range(buffer, slot))
        .find(|&extent| extent != (0, 0))
        .expect("should find the always-present HEAD slot");
    &buffer[end.next_multiple_of(8)..]
}

#[track_caller]
fn assert_contains(haystack: &[u8], needle: &[u8], message: &str) {
    assert!(
        haystack
            .windows(needle.len())
            .any(|window| window == needle),
        "{message}"
    );
}

/// Builds a generation identity from a repeated byte, beside the digest bytes it echoes.
fn generation_of(byte: u8) -> ([u8; Sha256Digest::BYTES], GenerationId) {
    let bytes = [byte; Sha256Digest::BYTES];
    (
        bytes,
        GenerationId::from_digest(Sha256Digest::from_bytes_unchecked(bytes)),
    )
}

fn tile(z: u8, x: u32, y: u32) -> MortonTile {
    MortonTile {
        z: Depth::new(z),
        x,
        y,
    }
}

/// Assembles one `SALTILET` envelope from its parts, independent of `EnvelopeWriter`.
///
/// Padding to the next eight-byte boundary follows each present slot's payload. A `None` slot
/// keeps the directory's initial zero entry: what the omitted mask column and the reserved
/// density slot leave behind.
fn build_envelope(slots: &[Option<Vec<u8>>], trailer: Option<&[u8]>) -> Vec<u8> {
    let mut buffer = Vec::new();
    buffer.extend_from_slice(b"SALTILET");
    buffer.extend_from_slice(&1_u16.to_le_bytes());
    buffer.extend_from_slice(&0_u16.to_le_bytes());
    buffer.extend_from_slice(
        &u16::try_from(slots.len())
            .expect("should fit the fixture's slot count")
            .to_le_bytes(),
    );
    buffer.extend_from_slice(&0_u16.to_le_bytes());

    let mut directory = vec![0_u8; slots.len() * ENTRY];
    buffer.resize(PREFIX + directory.len(), 0);

    for (index, slot) in slots.iter().enumerate() {
        let Some(payload) = slot else { continue };

        let start = buffer.len();
        buffer.extend_from_slice(payload);
        let end = buffer.len();
        buffer.resize(end.next_multiple_of(8), 0);

        let at = index * ENTRY;
        directory[at..at + 4].copy_from_slice(
            &u32::try_from(start)
                .expect("should fit the fixture's offsets")
                .to_le_bytes(),
        );
        directory[at + 4..at + ENTRY].copy_from_slice(
            &u32::try_from(end)
                .expect("should fit the fixture's offsets")
                .to_le_bytes(),
        );
    }

    buffer[PREFIX..PREFIX + directory.len()].copy_from_slice(&directory);
    if let Some(trailer) = trailer {
        buffer.extend_from_slice(trailer);
    }
    buffer
}

/// A nonroot delta tile with an empty row set and minimal detail.
fn minimal_document(generation: GenerationId) -> TileDocument<'static> {
    TileDocument {
        generation,
        coordinate: tile(2, 1, 3),
        mode: Mode::Delta,
        first_bucket: Depth::new(2),
        runs: Vec::new(),
        positions: IdVec::<TileSlot, Vec2>::from_raw(Vec::new()),
        ids: IdVec::<TileSlot, EncodedRowId<NodeRowId>>::from_raw(Vec::new()),
        type_masks: None,
        global: None,
        children: 0,
        trailer: None,
    }
}

/// The nine-key `HEAD` map of [`minimal_document`], over `rows` delivered rows.
///
/// Global metadata adds key 8 between keys 7 and 9, which the tests that carry it build for
/// themselves.
fn expected_minimal_head(digest: &[u8], variant: u64, rows: u64, trailer: bool) -> Vec<u8> {
    cbor_map([
        (0, cbor_bytes(digest)),
        (1, cbor_uint(variant)),
        (2, cbor_array([cbor_uint(2), cbor_uint(1), cbor_uint(3)])),
        (3, cbor_uint(0)),
        (4, cbor_uint(rows)),
        (6, cbor_uint(2)),
        (7, cbor_array([])),
        (9, cbor_uint(0)),
        (10, cbor_bool(trailer)),
    ])
}

/// The minimal document replaces a longer prepopulated buffer with the whole envelope.
///
/// The one case compared byte for byte. Every other test decodes the directory and checks one
/// region.
#[test]
fn response_encode_minimal_shape() {
    let (digest, generation) = generation_of(0x10);
    let document = minimal_document(generation);

    let mut buffer = Vec::new_in(&Global);
    buffer.resize(512, 0xDD);
    let _completed = document
        .encode(&mut buffer)
        .expect("should complete the minimal tile response");

    let expected = build_envelope(
        &[
            Some(expected_minimal_head(&digest, 0, 0, false)),
            Some(Vec::new()),
            Some(Vec::new()),
            None,
            None,
        ],
        None,
    );

    assert_eq!(
        buffer.as_slice(),
        expected.as_slice(),
        "should replace the buffer with HEAD, the two geometry slots and two skipped entries"
    );
}

/// The response echoes its own `variant` field rather than a fixed value.
///
/// `Document::encode` always passes zero. A nonzero variant needs the response built directly.
#[test]
fn response_variant_nonzero() {
    let (digest, generation) = generation_of(0x11);
    let document = minimal_document(generation);

    let mut buffer = Vec::new_in(&Global);
    let _completed = TileResponse {
        variant: 5,
        document: &document,
    }
    .encode_into(&mut buffer);

    assert_eq!(
        slot_bytes(&buffer, 0),
        expected_minimal_head(&digest, 5, 0, false).as_slice(),
        "should echo variant 5 at head key 1 rather than a fixed value"
    );
}

/// The geometry slots keep the document's own slot order, positions before rows.
#[test]
fn response_geometry_columns() {
    let (digest, generation) = generation_of(0x19);
    let document = TileDocument {
        positions: IdVec::from_raw(vec![Vec2::new(2.0, -4.0), Vec2::new(0.5, 0.0)]),
        ids: IdVec::from_raw(vec![
            EncodedRowId::new_unchecked(0x0102_0304),
            EncodedRowId::new_unchecked(7),
        ]),
        ..minimal_document(generation)
    };

    let mut buffer = Vec::new_in(&Global);
    let _completed = document
        .encode(&mut buffer)
        .expect("should complete the tile response");

    let mut expected_positions = Vec::new();
    for value in [2.0_f32, -4.0, 0.5, 0.0] {
        expected_positions.extend_from_slice(&value.to_bits().to_le_bytes());
    }

    assert_eq!(
        slot_bytes(&buffer, 0),
        expected_minimal_head(&digest, 0, 2, false).as_slice(),
        "should report two delivered rows at head key 4"
    );
    assert_eq!(
        slot_bytes(&buffer, 1),
        expected_positions.as_slice(),
        "should encode each position's x then y in slot order"
    );
    assert_eq!(
        slot_bytes(&buffer, 2),
        [0x04, 0x03, 0x02, 0x01, 0x07, 0x00, 0x00, 0x00],
        "should encode each row id little-endian in slot order"
    );
}

/// An omitted mask column and a present-but-empty one differ in the directory alone.
///
/// A skipped slot never records an entry, and its extent stays the envelope's initial `(0, 0)`.
/// A present-but-empty column records `(start, start)` at whatever offset the earlier slots
/// reached, which is past the directory and never zero.
#[test]
fn response_mask_omitted_versus_empty() {
    let (_, generation) = generation_of(0x12);
    let omitted = minimal_document(generation);

    let mut buffer = Vec::new_in(&Global);
    let _completed = omitted
        .encode(&mut buffer)
        .expect("should complete the response without a mask column");
    assert_eq!(
        slot_range(&buffer, MASK_SLOT),
        (0, 0),
        "an omitted mask column should leave the directory entry at its initial (0, 0)"
    );

    let (_, generation) = generation_of(0x13);
    let present = TileDocument {
        type_masks: Some(TypeMasks {
            bits: BitMatrix::<TileSlot, SelectionSlot>::new(0, 3),
        }),
        ..minimal_document(generation)
    };

    let mut buffer = Vec::new_in(&Global);
    let _completed = present
        .encode(&mut buffer)
        .expect("should complete the response with an empty mask column");
    let (start, end) = slot_range(&buffer, MASK_SLOT);
    assert_eq!(
        start, end,
        "a present-but-empty mask column should record a zero-length extent"
    );
    assert!(
        start >= PREFIX + ENTRY * SLOTS,
        "the present-but-empty column should sit past the directory rather than at offset zero"
    );
}

/// Slot 4 stays reserved: the writer skips it even in a response that fills every other slot.
#[test]
fn response_density_reserved() {
    let (_, generation) = generation_of(0x18);
    let document = TileDocument {
        positions: IdVec::from_raw(vec![Vec2::new(1.0, 2.0)]),
        ids: IdVec::from_raw(vec![EncodedRowId::new_unchecked(7)]),
        type_masks: Some(TypeMasks {
            bits: BitMatrix::<TileSlot, SelectionSlot>::new(1, 3),
        }),
        ..minimal_document(generation)
    };

    let mut buffer = Vec::new_in(&Global);
    let _completed = document
        .encode(&mut buffer)
        .expect("should complete the response with a mask column");

    for slot in 0..DENSITY_SLOT {
        assert_ne!(
            slot_range(&buffer, slot),
            (0, 0),
            "slot {slot} should record an extent"
        );
    }
    assert_eq!(
        slot_range(&buffer, DENSITY_SLOT),
        (0, 0),
        "the reserved density slot should stay at its initial (0, 0)"
    );
}

/// Root global metadata carries the schedule's bounds under key 1 and lifts `HEAD` to ten keys.
#[test]
fn response_global_with_bounds() {
    let (_, generation) = generation_of(0x14);
    let min = Vec2::new(-1.5, 2.0);
    let max = Vec2::new(3.5, 6.0);
    let document = TileDocument {
        global: Some(GlobalHead {
            visible: 7,
            bounds: Some(Bounds2::new(min, max).expect("should accept ordered finite corners")),
            min_resolution: 4,
        }),
        ..minimal_document(generation)
    };

    let mut buffer = Vec::new_in(&Global);
    let _completed = document
        .encode(&mut buffer)
        .expect("should complete the root tile response");

    let mut expected = cbor_uint(8);
    expected.extend(cbor_map([
        (0, cbor_uint(7)),
        (
            1,
            cbor_array([cbor_f32(-1.5), cbor_f32(2.0), cbor_f32(3.5), cbor_f32(6.0)]),
        ),
        (2, cbor_uint(4)),
    ]));

    let head = slot_bytes(&buffer, 0);
    assert_contains(
        head,
        &expected,
        "should carry a three-key global map with the bounds array at head key 8",
    );
    assert_eq!(
        head[0],
        cbor_head(5, 10)[0],
        "should declare a ten-key HEAD map when global metadata is present"
    );
}

/// Without bounds the global map keeps its two-key form: key 1 is absent rather than null.
#[test]
fn response_global_without_bounds() {
    let (_, generation) = generation_of(0x15);
    let document = TileDocument {
        global: Some(GlobalHead {
            visible: 0,
            bounds: None,
            min_resolution: 0,
        }),
        ..minimal_document(generation)
    };

    let mut buffer = Vec::new_in(&Global);
    let _completed = document
        .encode(&mut buffer)
        .expect("should complete the bound-free root tile response");

    let mut expected = cbor_uint(8);
    expected.extend(cbor_map([(0, cbor_uint(0)), (2, cbor_uint(0))]));

    let head = slot_bytes(&buffer, 0);
    assert_contains(
        head,
        &expected,
        "should carry a two-key global map with no bounds key rather than a null placeholder",
    );
    assert!(
        !head.contains(&CBOR_NULL),
        "should place no null anywhere in the head"
    );
    assert_eq!(
        head[0],
        cbor_head(5, 10)[0],
        "should declare a ten-key HEAD map when global metadata is present"
    );
}

/// The run partition, the mode code and the children bitmask encode as literals.
///
/// The expected mode codes are the literals 0 and 1 rather than a call to `Mode::code`.
#[test]
fn response_mode_runs_children() {
    for (mode, code) in [(Mode::Delta, 0_u64), (Mode::Total, 1_u64)] {
        let (digest, generation) = generation_of(0x16);
        let document = TileDocument {
            mode,
            runs: vec![2, 0, 5],
            children: 0b1011,
            ..minimal_document(generation)
        };

        let mut buffer = Vec::new_in(&Global);
        let _completed = document
            .encode(&mut buffer)
            .expect("should complete the tile response");

        let expected = cbor_map([
            (0, cbor_bytes(&digest)),
            (1, cbor_uint(0)),
            (2, cbor_array([cbor_uint(2), cbor_uint(1), cbor_uint(3)])),
            (3, cbor_uint(code)),
            (4, cbor_uint(0)),
            (6, cbor_uint(2)),
            (7, cbor_array([cbor_uint(2), cbor_uint(0), cbor_uint(5)])),
            (9, cbor_uint(0b1011)),
            (10, cbor_bool(false)),
        ]);

        assert_eq!(
            slot_bytes(&buffer, 0),
            expected.as_slice(),
            "mode {mode:?} should encode wire code {code}, the run partition [2, 0, 5] and the \
             children bitmask 0b1011"
        );
    }
}

/// The trailer's label and icon arrays null their entries independently.
///
/// The fixture's three rows leave the row column ending off an eight-byte boundary, which puts
/// the trailer's start past both the padding and the two skipped trailing slots.
#[test]
fn response_trailer_labels_icons() {
    let (digest, generation) = generation_of(0x17);
    let document = TileDocument {
        positions: IdVec::from_raw(vec![
            Vec2::new(1.0, 2.0),
            Vec2::new(3.0, 4.0),
            Vec2::new(5.0, 6.0),
        ]),
        ids: IdVec::from_raw(vec![
            EncodedRowId::new_unchecked(11),
            EncodedRowId::new_unchecked(12),
            EncodedRowId::new_unchecked(13),
        ]),
        trailer: Some(TileTrailer {
            labels: IdVec::<TileSlot, &Label>::from_raw(vec![
                Label::new("north"),
                Label::EMPTY,
                Label::new("south"),
            ]),
            icons: IdVec::<TileSlot, &Icon>::from_raw(vec![
                Icon::empty(),
                Icon::new("marker"),
                Icon::empty(),
            ]),
        }),
        ..minimal_document(generation)
    };

    let mut buffer = Vec::new_in(&Global);
    let _completed = document
        .encode(&mut buffer)
        .expect("should complete the auxiliary tile response");

    let expected = cbor_map([
        (
            0,
            cbor_array([cbor_text("north"), vec![CBOR_NULL], cbor_text("south")]),
        ),
        (
            1,
            cbor_array([vec![CBOR_NULL], cbor_text("marker"), vec![CBOR_NULL]]),
        ),
    ]);

    let (_, rows_end) = slot_range(&buffer, 2);
    assert_ne!(
        rows_end & 7,
        0,
        "the fixture's row column should end off an eight-byte boundary"
    );
    assert_eq!(
        trailer_bytes(&buffer),
        expected.as_slice(),
        "should pair each slot's label and icon independently, nulling only the empty one"
    );
    assert_eq!(
        slot_bytes(&buffer, 0),
        expected_minimal_head(&digest, 0, 3, true).as_slice(),
        "should report the present trailer at head key 10"
    );
}
