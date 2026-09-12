#![expect(
    clippy::little_endian_bytes,
    reason = "the tests read the envelope directory and build its little-endian columns"
)]
#![expect(
    clippy::big_endian_bytes,
    reason = "CBOR arguments are network byte order (RFC 8949 section 3)"
)]

use alloc::{alloc::Global, collections::BTreeMap};
use core::iter;

use hashql_core::id::{Id as _, IdVec, bit_vec::BitMatrix};
use type_system::ontology::{VersionedUrl, id::BaseUrl};

use super::{
    super::{
        LocateDocument,
        trailer::{LocateTrailer, PropertyMap},
    },
    LocateResponse,
};
use crate::{
    bitset::DenseBitSlice,
    dataset::auxiliary::Label,
    file::generation::GenerationId,
    identity::NodeRowId,
    integrity::Sha256Digest,
    math::Vec2,
    morton::{Depth, MortonTile},
    postgres::id::{ArchivedEntityId, ArchivedEntityUuid, ArchivedWebId},
    serve::{
        codec::EncodedRowId,
        document::{Document as _, masks::TypeMasks},
        hydrate::{EdgeSlot, NodeSlot, scalar::ScalarValue},
        intern::InternTable,
        membership::SelectionSlot,
    },
};

/// The envelope prefix width.
const PREFIX: usize = 16;
/// The width of one directory entry.
const ENTRY: usize = 8;
/// The slot count of a `SALTILEL` envelope.
const SLOTS: usize = 7;
/// The directory index of the mask column.
const MASK_SLOT: usize = 3;

const CBOR_TRUE: u8 = 0xF5;
const CBOR_FALSE: u8 = 0xF4;
const CBOR_NULL: u8 = 0xF6;
/// The head of a double-precision float.
const CBOR_HEAD_F64: u8 = 0xFB;

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

/// Encodes a signed integer: major type 0 when non-negative, major type 1 otherwise.
///
/// The negative branch widens to `i128` instead of reusing the writer's bitwise negation.
fn cbor_int(value: i64) -> Vec<u8> {
    if value >= 0 {
        cbor_head(0, value.cast_unsigned())
    } else {
        let argument = -1_i128 - i128::from(value);
        cbor_head(
            1,
            u64::try_from(argument).expect("should fit the negated argument"),
        )
    }
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

/// Encodes a double-precision float: the head, then the bit pattern in network byte order.
fn cbor_f64(value: f64) -> Vec<u8> {
    let mut bytes = vec![CBOR_HEAD_F64];
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

/// Derives a dense bit slice's expected word bytes from the bit indexes a test set.
fn expected_bit_words(domain: usize, set: &[usize]) -> Vec<u8> {
    let mut words = vec![0_u64; domain.div_ceil(64)];
    for &bit in set {
        words[bit >> 6] |= 1_u64 << (bit & 63);
    }

    let mut bytes = Vec::new();
    for word in words {
        bytes.extend_from_slice(&word.to_le_bytes());
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

/// Returns the mandatory trailer: the bytes past the last slot's padding.
///
/// A directory entry records its slot's unpadded end. The writer then pads to the next multiple
/// of eight before writing the trailer, which puts the trailer at the aligned end rather than at
/// the recorded one. Locate skips only the mask column, and the edge-identity column is the last
/// slot it writes.
fn trailer_bytes(buffer: &[u8]) -> &[u8] {
    let (_, end) = slot_range(buffer, SLOTS - 1);
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

fn row(value: u32) -> EncodedRowId<NodeRowId> {
    EncodedRowId::new_unchecked(value)
}

fn identity(web: u8, entity: u8) -> ArchivedEntityId {
    ArchivedEntityId {
        web_id: ArchivedWebId::from_bytes([web; 16]),
        entity_uuid: ArchivedEntityUuid::from_bytes([entity; 16]),
    }
}

/// The 32 identity bytes `HEAD` key 7 carries for [`identity`].
fn identity_bytes(web: u8, entity: u8) -> Vec<u8> {
    let mut bytes = Vec::new();
    bytes.extend_from_slice(&[web; 16]);
    bytes.extend_from_slice(&[entity; 16]);
    bytes
}

fn property_url(name: &str) -> BaseUrl {
    BaseUrl::new(format!("https://example.com/property/{name}/"))
        .expect("should parse the fixture property URL")
}

/// Assembles one `SALTILEL` envelope from its parts, independent of `EnvelopeWriter`.
///
/// Padding to the next eight-byte boundary follows each present slot's payload. A `None` slot
/// keeps the directory's initial zero entry: what an omitted mask column leaves behind.
fn build_envelope(slots: &[Option<Vec<u8>>], trailer: &[u8]) -> Vec<u8> {
    let mut buffer = Vec::new();
    buffer.extend_from_slice(b"SALTILEL");
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
    buffer.extend_from_slice(trailer);
    buffer
}

/// A trailer with every array present and carrying no node and no link.
fn empty_trailer() -> LocateTrailer<'static> {
    LocateTrailer {
        type_urls: InternTable::new(),
        property_urls: InternTable::new(),
        labels: IdVec::<NodeSlot, &Label>::from_raw(Vec::new()),
        representative_type_urls: IdVec::from_raw(Vec::new()),
        properties: None,
        type_ids_complete: false,
        properties_complete: false,
        link_labels: IdVec::<EdgeSlot, &Label>::from_raw(Vec::new()),
        link_type_urls: IdVec::from_raw(Vec::new()),
        link_type_urls_complete: DenseBitSlice::new_empty(0),
        link_properties: IdVec::from_raw(Vec::new()),
        link_properties_complete: DenseBitSlice::new_empty(0),
    }
}

/// The wire bytes of [`empty_trailer`]: ten keys over empty collections and a null map.
fn expected_empty_trailer() -> Vec<u8> {
    cbor_map([
        (0, cbor_array([])),
        (1, cbor_array([])),
        (2, cbor_array([])),
        (3, cbor_array([])),
        (4, vec![CBOR_NULL]),
        (5, cbor_array([])),
        (6, cbor_array([])),
        (7, cbor_bytes(&[])),
        (8, cbor_array([])),
        (9, cbor_bytes(&[])),
    ])
}

/// A nonroot source alone in its ego graph, with an empty trailer.
fn minimal_document(generation: GenerationId) -> LocateDocument<'static> {
    LocateDocument {
        generation,
        coordinate: tile(2, 1, 3),
        entity_id: identity(0xCC, 0xDD),
        complete: true,
        positions: IdVec::<NodeSlot, Vec2>::from_raw(Vec::new()),
        ids: IdVec::<NodeSlot, EncodedRowId<NodeRowId>>::from_raw(Vec::new()),
        type_masks: None,
        edge_ids: IdVec::<EdgeSlot, ArchivedEntityId>::from_raw(Vec::new()),
        edge_sources: IdVec::<EdgeSlot, EncodedRowId<NodeRowId>>::from_raw(Vec::new()),
        edge_targets: IdVec::<EdgeSlot, EncodedRowId<NodeRowId>>::from_raw(Vec::new()),
        trailer: empty_trailer(),
    }
}

/// The ten-key `HEAD` map of [`minimal_document`], over the given variant and flags.
fn expected_minimal_head(
    digest: &[u8],
    variant: u64,
    type_ids_complete: bool,
    properties_complete: bool,
) -> Vec<u8> {
    cbor_map([
        (0, cbor_bytes(digest)),
        (1, cbor_uint(variant)),
        (2, cbor_uint(0)),
        (3, cbor_uint(2)),
        (4, cbor_array([cbor_uint(2), cbor_uint(1), cbor_uint(3)])),
        (5, cbor_uint(0)),
        (6, cbor_bool(true)),
        (7, cbor_bytes(&identity_bytes(0xCC, 0xDD))),
        (8, cbor_bool(type_ids_complete)),
        (9, cbor_bool(properties_complete)),
    ])
}

/// The minimal document replaces a longer prepopulated buffer with the whole envelope.
///
/// The one case compared byte for byte. Every other test decodes the directory and checks one
/// region.
#[test]
fn response_encode_minimal_shape() {
    let (digest, generation) = generation_of(0x20);
    let document = minimal_document(generation);

    let mut buffer = Vec::new_in(&Global);
    buffer.resize(512, 0xDD);
    let _completed = document
        .encode(&mut buffer)
        .expect("should complete the minimal locate response");

    let expected = build_envelope(
        &[
            Some(expected_minimal_head(&digest, 0, false, false)),
            Some(Vec::new()),
            Some(Vec::new()),
            None,
            Some(Vec::new()),
            Some(Vec::new()),
            Some(Vec::new()),
        ],
        &expected_empty_trailer(),
    );

    assert_eq!(
        buffer.as_slice(),
        expected.as_slice(),
        "should replace the buffer with six present slots, one skipped and the mandatory trailer"
    );
}

/// The response echoes its own `variant` field rather than a fixed value.
///
/// `Document::encode` always passes zero. A nonzero variant needs the response built directly.
#[test]
fn response_variant_nonzero() {
    let (digest, generation) = generation_of(0x21);
    let document = minimal_document(generation);

    let mut buffer = Vec::new_in(&Global);
    let _completed = LocateResponse {
        variant: 3,
        document: &document,
    }
    .encode_into(&mut buffer);

    assert_eq!(
        slot_bytes(&buffer, 0),
        expected_minimal_head(&digest, 3, false, false).as_slice(),
        "should echo variant 3 at head key 1 rather than a fixed value"
    );
}

/// An omitted mask column and a present-but-empty one differ in the directory alone.
#[test]
fn response_mask_omitted_versus_empty() {
    let (_, generation) = generation_of(0x22);
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

    let (_, generation) = generation_of(0x23);
    let present = LocateDocument {
        type_masks: Some(TypeMasks {
            bits: BitMatrix::<NodeSlot, SelectionSlot>::new(0, 2),
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

/// Node order and edge order stay independent, and the source's own identity crosses verbatim.
///
/// The edge columns permute their endpoints against the node order. A writer that sorted a
/// column, or filled one column from another, disagrees with at least one expectation here.
#[test]
fn response_node_and_edge_order() {
    let (_, generation) = generation_of(0x24);
    let document = LocateDocument {
        entity_id: identity(0x40, 0x41),
        positions: IdVec::from_raw(vec![Vec2::new(1.0, 2.0), Vec2::new(3.0, 4.0)]),
        ids: IdVec::from_raw(vec![row(30), row(10)]),
        edge_ids: IdVec::from_raw(vec![identity(0x50, 0x51), identity(0x60, 0x61)]),
        edge_sources: IdVec::from_raw(vec![row(10), row(30)]),
        edge_targets: IdVec::from_raw(vec![row(10), row(10)]),
        ..minimal_document(generation)
    };

    let mut buffer = Vec::new_in(&Global);
    let _completed = document
        .encode(&mut buffer)
        .expect("should complete the ego-graph locate response");

    let mut expected_positions = Vec::new();
    for value in [1.0_f32, 2.0, 3.0, 4.0] {
        expected_positions.extend_from_slice(&value.to_bits().to_le_bytes());
    }
    let expected_ids: Vec<u8> = [30_u32, 10]
        .iter()
        .flat_map(|value| value.to_le_bytes())
        .collect();
    let expected_sources: Vec<u8> = [10_u32, 30]
        .iter()
        .flat_map(|value| value.to_le_bytes())
        .collect();
    let expected_targets: Vec<u8> = [10_u32, 10]
        .iter()
        .flat_map(|value| value.to_le_bytes())
        .collect();
    let mut expected_edge_ids = identity_bytes(0x50, 0x51);
    expected_edge_ids.extend(identity_bytes(0x60, 0x61));

    assert_eq!(
        slot_bytes(&buffer, 1),
        expected_positions.as_slice(),
        "should keep the node positions in document order"
    );
    assert_eq!(
        slot_bytes(&buffer, 2),
        expected_ids.as_slice(),
        "should keep the node rows in document order"
    );
    assert_eq!(
        slot_bytes(&buffer, 4),
        expected_sources.as_slice(),
        "should keep the edge sources in their own order, independent of the node rows"
    );
    assert_eq!(
        slot_bytes(&buffer, 5),
        expected_targets.as_slice(),
        "should keep the edge targets in their own order, independent of the sources"
    );
    assert_eq!(
        slot_bytes(&buffer, 6),
        expected_edge_ids.as_slice(),
        "should keep the edge identities in document order"
    );

    let mut expected_source = cbor_uint(7);
    expected_source.extend(cbor_bytes(&identity_bytes(0x40, 0x41)));
    assert_contains(
        slot_bytes(&buffer, 0),
        &expected_source,
        "should carry the source's own upstream identity verbatim at head key 7",
    );

    let mut expected_counts = cbor_uint(2);
    expected_counts.extend(cbor_uint(2));
    assert_contains(
        slot_bytes(&buffer, 0),
        &expected_counts,
        "should report two delivered nodes at head key 2",
    );
    let mut expected_edges = cbor_uint(5);
    expected_edges.extend(cbor_uint(2));
    assert_contains(
        slot_bytes(&buffer, 0),
        &expected_edges,
        "should report two delivered edges at head key 5",
    );
}

/// The trailer's two completeness flags reach `HEAD` keys 8 and 9 independently.
#[test]
fn response_completeness_flags() {
    for (type_ids_complete, properties_complete) in
        [(false, false), (true, false), (false, true), (true, true)]
    {
        let (digest, generation) = generation_of(0x25);
        let mut document = minimal_document(generation);
        document.trailer.type_ids_complete = type_ids_complete;
        document.trailer.properties_complete = properties_complete;

        let mut buffer = Vec::new_in(&Global);
        let _completed = document
            .encode(&mut buffer)
            .expect("should complete the locate response");

        assert_eq!(
            slot_bytes(&buffer, 0),
            expected_minimal_head(&digest, 0, type_ids_complete, properties_complete).as_slice(),
            "should encode type_ids_complete={type_ids_complete} at head key 8 and \
             properties_complete={properties_complete} at head key 9"
        );
    }
}

/// The source's property map holds every [`ScalarValue`] variant, keyed by property index.
#[test]
fn trailer_scalar_variants() {
    let (_, generation) = generation_of(0x26);
    let mut property_urls = InternTable::new();
    let string = property_urls.intern(property_url("name"));
    let integer = property_urls.intern(property_url("age"));
    let float = property_urls.intern(property_url("weight"));
    let boolean = property_urls.intern(property_url("active"));
    let null = property_urls.intern(property_url("note"));

    let document = LocateDocument {
        positions: IdVec::from_raw(vec![Vec2::ZERO]),
        ids: IdVec::from_raw(vec![row(0)]),
        trailer: LocateTrailer {
            labels: IdVec::from_raw(vec![Label::new("source")]),
            representative_type_urls: IdVec::from_raw(vec![None]),
            properties: Some(PropertyMap(BTreeMap::from([
                (string, ScalarValue::String("Ada".to_owned())),
                (integer, ScalarValue::Integer(-7)),
                (float, ScalarValue::Float(0.5)),
                (boolean, ScalarValue::Bool(true)),
                (null, ScalarValue::Null),
            ]))),
            property_urls,
            ..empty_trailer()
        },
        ..minimal_document(generation)
    };

    let mut buffer = Vec::new_in(&Global);
    let _completed = document
        .encode(&mut buffer)
        .expect("should complete the hydrated locate response");

    let mut expected = cbor_uint(4);
    expected.extend(cbor_map([
        (string.as_u64(), cbor_text("Ada")),
        (integer.as_u64(), cbor_int(-7)),
        (float.as_u64(), cbor_f64(0.5)),
        (boolean.as_u64(), cbor_bool(true)),
        (null.as_u64(), vec![CBOR_NULL]),
    ]));

    assert_contains(
        trailer_bytes(&buffer),
        &expected,
        "should encode each scalar variant in its own CBOR shape, keyed by property index",
    );
}

/// An unresolved source reads `null` at trailer key 4, and a resolved empty one reads a map.
#[test]
fn trailer_properties_null_versus_empty() {
    let (_, generation) = generation_of(0x27);
    let unresolved = minimal_document(generation);

    let mut buffer = Vec::new_in(&Global);
    let _completed = unresolved
        .encode(&mut buffer)
        .expect("should complete the unresolved locate response");
    let mut expected_null = cbor_uint(4);
    expected_null.push(CBOR_NULL);
    assert_contains(
        trailer_bytes(&buffer),
        &expected_null,
        "an unresolved source should read null at trailer key 4",
    );

    let (_, generation) = generation_of(0x28);
    let resolved = LocateDocument {
        trailer: LocateTrailer {
            properties: Some(PropertyMap(BTreeMap::new())),
            ..empty_trailer()
        },
        ..minimal_document(generation)
    };

    let mut buffer = Vec::new_in(&Global);
    let _completed = resolved
        .encode(&mut buffer)
        .expect("should complete the resolved locate response");
    let mut expected_empty = cbor_uint(4);
    expected_empty.extend(cbor_map([]));
    assert_contains(
        trailer_bytes(&buffer),
        &expected_empty,
        "a resolved source with no properties should read an empty map rather than null",
    );
}

/// A URL the source and a link both reference interns once, under one table index.
#[test]
fn trailer_url_interning_shared() {
    let (_, generation) = generation_of(0x29);
    let mut type_urls = InternTable::new();
    let shared = type_urls.intern(
        "https://example.com/types/shared/v/1"
            .parse::<VersionedUrl>()
            .expect("should parse the fixture type URL"),
    );

    let document = LocateDocument {
        positions: IdVec::from_raw(vec![Vec2::new(1.0, 2.0)]),
        ids: IdVec::from_raw(vec![row(0)]),
        edge_ids: IdVec::from_raw(vec![identity(0x70, 0x71)]),
        edge_sources: IdVec::from_raw(vec![row(0)]),
        edge_targets: IdVec::from_raw(vec![row(1)]),
        trailer: LocateTrailer {
            labels: IdVec::from_raw(vec![Label::new("source")]),
            representative_type_urls: IdVec::from_raw(vec![Some(shared)]),
            link_labels: IdVec::from_raw(vec![Label::new("link")]),
            link_type_urls: IdVec::from_raw(vec![vec![shared]]),
            link_type_urls_complete: DenseBitSlice::new_empty(1),
            link_properties: IdVec::from_raw(vec![None]),
            link_properties_complete: DenseBitSlice::new_empty(1),
            type_urls,
            ..empty_trailer()
        },
        ..minimal_document(generation)
    };

    let mut buffer = Vec::new_in(&Global);
    let _completed = document
        .encode(&mut buffer)
        .expect("should complete the interned locate response");

    let expected = cbor_map([
        (
            0,
            cbor_array([cbor_text("https://example.com/types/shared/v/1")]),
        ),
        (1, cbor_array([])),
        (2, cbor_array([cbor_text("source")])),
        (3, cbor_array([cbor_uint(shared.as_u64())])),
        (4, vec![CBOR_NULL]),
        (5, cbor_array([cbor_text("link")])),
        (6, cbor_array([cbor_array([cbor_uint(shared.as_u64())])])),
        (7, cbor_bytes(&expected_bit_words(1, &[]))),
        (8, cbor_array([vec![CBOR_NULL]])),
        (9, cbor_bytes(&expected_bit_words(1, &[]))),
    ]);

    assert_eq!(
        trailer_bytes(&buffer),
        expected.as_slice(),
        "should intern the shared URL once and reference one table index from node and link"
    );
}

/// Both link completeness bit arrays cross the 64-bit word boundary independently.
///
/// Seventy edges put the boundary inside the array rather than at its edge. Their patterns
/// differ, which stops either from standing in for the other.
#[test]
fn trailer_bit_completeness_word_boundary() {
    const EDGES: usize = 70;

    let (_, generation) = generation_of(0x2A);
    let mut link_type_urls_complete = DenseBitSlice::<EdgeSlot>::new_empty(EDGES);
    link_type_urls_complete.insert(EdgeSlot::from_usize(63));
    link_type_urls_complete.insert(EdgeSlot::from_usize(64));

    let mut link_properties_complete = DenseBitSlice::<EdgeSlot>::new_empty(EDGES);
    link_properties_complete.insert(EdgeSlot::from_usize(0));
    link_properties_complete.insert(EdgeSlot::from_usize(64));

    let document = LocateDocument {
        positions: IdVec::from_raw(vec![Vec2::ZERO]),
        ids: IdVec::from_raw(vec![row(0)]),
        edge_ids: IdVec::from_raw(vec![identity(0x01, 0x01); EDGES]),
        edge_sources: IdVec::from_raw(vec![row(0); EDGES]),
        edge_targets: IdVec::from_raw(vec![row(0); EDGES]),
        trailer: LocateTrailer {
            labels: IdVec::from_raw(vec![Label::EMPTY]),
            representative_type_urls: IdVec::from_raw(vec![None]),
            link_labels: IdVec::from_raw(vec![Label::EMPTY; EDGES]),
            link_type_urls: IdVec::from_raw(vec![Vec::new(); EDGES]),
            link_type_urls_complete,
            link_properties: IdVec::from_raw(iter::repeat_with(|| None).take(EDGES).collect()),
            link_properties_complete,
            ..empty_trailer()
        },
        ..minimal_document(generation)
    };

    let mut buffer = Vec::new_in(&Global);
    let _completed = document
        .encode(&mut buffer)
        .expect("should complete the wide locate response");
    let trailer = trailer_bytes(&buffer);

    let expected_type_urls = expected_bit_words(EDGES, &[63, 64]);
    let expected_properties = expected_bit_words(EDGES, &[0, 64]);
    assert_eq!(
        expected_type_urls.len(),
        16,
        "seventy edges should occupy two eight-byte words"
    );

    let mut expected_type_urls_entry = cbor_uint(7);
    expected_type_urls_entry.extend(cbor_bytes(&expected_type_urls));
    assert_contains(
        trailer,
        &expected_type_urls_entry,
        "should carry the link-type-url completeness words with both boundary bits set",
    );

    let mut expected_properties_entry = cbor_uint(9);
    expected_properties_entry.extend(cbor_bytes(&expected_properties));
    assert_contains(
        trailer,
        &expected_properties_entry,
        "should carry the link-property completeness words with their own distinct pattern",
    );
}
