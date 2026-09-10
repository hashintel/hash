#![expect(
    clippy::little_endian_bytes,
    reason = "the tests read the envelope directory and build its little-endian columns"
)]

use alloc::alloc::Global;

use hashql_core::id::IdVec;
use type_system::ontology::VersionedUrl;

use super::{
    super::{EdgeSlot, EdgesDocument, EdgesTrailer},
    EdgesResponse,
};
use crate::{
    dataset::auxiliary::Label,
    file::generation::GenerationId,
    identity::NodeRowId,
    integrity::Sha256Digest,
    postgres::id::{ArchivedEntityId, ArchivedEntityUuid, ArchivedWebId},
    serve::{codec::EncodedRowId, document::Document as _, intern::InternTable},
};

/// The envelope prefix width.
const PREFIX: usize = 16;
/// The width of one directory entry.
const ENTRY: usize = 8;
/// The slot count of a `SALTILEE` envelope.
const SLOTS: usize = 4;

const CBOR_TRUE: u8 = 0xF5;
const CBOR_FALSE: u8 = 0xF4;
const CBOR_NULL: u8 = 0xF6;

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

/// Returns the bytes the writer appended past the last slot's padding.
///
/// A directory entry records its slot's unpadded end. The writer then pads to the next multiple
/// of eight before writing the trailer, which puts the trailer at the aligned end rather than at
/// the recorded one. Edges declares four slots and skips none, and the identity column is the
/// last slot it writes.
fn trailer_bytes(buffer: &[u8]) -> &[u8] {
    let (_, end) = slot_range(buffer, SLOTS - 1);
    &buffer[end.next_multiple_of(8)..]
}

/// Builds a generation identity from a repeated byte, beside the digest bytes it echoes.
fn generation_of(byte: u8) -> ([u8; Sha256Digest::BYTES], GenerationId) {
    let bytes = [byte; Sha256Digest::BYTES];
    (
        bytes,
        GenerationId::from_digest(Sha256Digest::from_bytes_unchecked(bytes)),
    )
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

/// Assembles one `SALTILEE` envelope from its parts, independent of `EnvelopeWriter`.
///
/// Padding to the next eight-byte boundary follows each present slot's payload. A `None` slot
/// keeps the directory's initial zero entry.
fn build_envelope(slots: &[Option<Vec<u8>>], trailer: Option<&[u8]>) -> Vec<u8> {
    let mut buffer = Vec::new();
    buffer.extend_from_slice(b"SALTILEE");
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

/// A complete delivery of zero edges at minimal detail.
fn minimal_document(generation: GenerationId) -> EdgesDocument<'static> {
    EdgesDocument {
        generation,
        ids: IdVec::<EdgeSlot, ArchivedEntityId>::from_raw(Vec::new()),
        sources: IdVec::<EdgeSlot, EncodedRowId<NodeRowId>>::from_raw(Vec::new()),
        targets: IdVec::<EdgeSlot, EncodedRowId<NodeRowId>>::from_raw(Vec::new()),
        trailer: None,
        complete: true,
    }
}

/// The `HEAD` map of a document with `count` edges.
fn expected_head(
    digest: &[u8],
    variant: u64,
    count: u64,
    complete: bool,
    trailer: bool,
) -> Vec<u8> {
    cbor_map([
        (0, cbor_bytes(digest)),
        (1, cbor_uint(variant)),
        (2, cbor_uint(count)),
        (3, cbor_bool(complete)),
        (4, cbor_bool(trailer)),
    ])
}

/// A zero-edge minimal document replaces a longer prepopulated buffer with the whole envelope.
///
/// The one case compared byte for byte. Every other test decodes the directory and checks one
/// region.
#[test]
fn document_encode_minimal_empty() {
    let (digest, generation) = generation_of(0xAB);
    let document = minimal_document(generation);

    let mut buffer = Vec::new_in(&Global);
    buffer.resize(512, 0xDD);
    let _completed = document
        .encode(&mut buffer)
        .expect("should complete the minimal edges response");

    let expected = build_envelope(
        &[
            Some(expected_head(&digest, 0, 0, true, false)),
            Some(Vec::new()),
            Some(Vec::new()),
            Some(Vec::new()),
        ],
        None,
    );

    assert_eq!(
        buffer.as_slice(),
        expected.as_slice(),
        "should replace the buffer with the prefix, directory, padded head and empty data slots"
    );
}

/// The columns keep the document's own row order, and the head reports the truncation.
#[test]
fn document_encode_ordered_columns_truncated() {
    let (digest, generation) = generation_of(0x01);
    let document = EdgesDocument {
        ids: IdVec::from_raw(vec![
            identity(0x30, 0x31),
            identity(0x10, 0x11),
            identity(0x20, 0x21),
        ]),
        sources: IdVec::from_raw(vec![row(300), row(100), row(200)]),
        targets: IdVec::from_raw(vec![row(301), row(101), row(201)]),
        complete: false,
        ..minimal_document(generation)
    };

    let mut buffer = Vec::new_in(&Global);
    let _completed = document
        .encode(&mut buffer)
        .expect("should complete the truncated edges response");

    let expected_sources: Vec<u8> = [300_u32, 100, 200]
        .iter()
        .flat_map(|value| value.to_le_bytes())
        .collect();
    let expected_targets: Vec<u8> = [301_u32, 101, 201]
        .iter()
        .flat_map(|value| value.to_le_bytes())
        .collect();
    let mut expected_ids = Vec::new();
    for (web, entity) in [(0x30_u8, 0x31_u8), (0x10, 0x11), (0x20, 0x21)] {
        expected_ids.extend_from_slice(&[web; 16]);
        expected_ids.extend_from_slice(&[entity; 16]);
    }

    assert_eq!(
        slot_bytes(&buffer, 0),
        expected_head(&digest, 0, 3, false, false).as_slice(),
        "should report three edges and a truncated delivery in the head"
    );
    assert_eq!(
        slot_bytes(&buffer, 1),
        expected_sources.as_slice(),
        "should encode sources in the document's own row order"
    );
    assert_eq!(
        slot_bytes(&buffer, 2),
        expected_targets.as_slice(),
        "should encode targets in the document's own row order"
    );
    assert_eq!(
        slot_bytes(&buffer, 3),
        expected_ids.as_slice(),
        "should encode identities in the document's own row order"
    );
}

/// The response echoes its own `variant` field rather than a fixed value.
///
/// `Document::encode` always passes zero. A nonzero variant needs the response built directly.
#[test]
fn response_variant_nonzero() {
    let (digest, generation) = generation_of(0x02);
    let document = minimal_document(generation);

    let mut buffer = Vec::new_in(&Global);
    let _completed = EdgesResponse {
        generation: document.generation,
        variant: 9,
        document: &document,
    }
    .encode_into(&mut buffer);

    assert_eq!(
        slot_bytes(&buffer, 0),
        expected_head(&digest, 9, 0, true, false).as_slice(),
        "should echo variant 9 at head key 1 and the generation at head key 0"
    );
}

/// A document without a trailer reports it in the head and appends nothing after the slots.
#[test]
fn trailer_absent() {
    let (digest, generation) = generation_of(0x03);
    let document = EdgesDocument {
        ids: IdVec::from_raw(vec![identity(0x01, 0x02)]),
        sources: IdVec::from_raw(vec![row(1)]),
        targets: IdVec::from_raw(vec![row(2)]),
        ..minimal_document(generation)
    };

    let mut buffer = Vec::new_in(&Global);
    let _completed = document
        .encode(&mut buffer)
        .expect("should complete the minimal-detail edges response");

    assert_eq!(
        slot_bytes(&buffer, 0),
        expected_head(&digest, 0, 1, true, false).as_slice(),
        "should report no trailer at head key 4"
    );
    assert!(
        trailer_bytes(&buffer).is_empty(),
        "should append no bytes past the last slot's padding"
    );
}

/// The auxiliary trailer's label and type-index arrays stay aligned to the edge slots.
///
/// The expected indexes are the literals 0 and 1 because the fixture interns alpha before beta.
#[test]
fn trailer_auxiliary_aligned() {
    let (digest, generation) = generation_of(0x04);
    let mut interner = InternTable::new();
    let alpha = interner.intern(
        "https://example.com/types/alpha/v/1"
            .parse::<VersionedUrl>()
            .expect("should parse the fixture type URL"),
    );
    let beta = interner.intern(
        "https://example.com/types/beta/v/1"
            .parse::<VersionedUrl>()
            .expect("should parse the fixture type URL"),
    );

    let document = EdgesDocument {
        ids: IdVec::from_raw(vec![
            identity(0x01, 0x01),
            identity(0x02, 0x02),
            identity(0x03, 0x03),
        ]),
        sources: IdVec::from_raw(vec![row(0), row(1), row(2)]),
        targets: IdVec::from_raw(vec![row(3), row(4), row(5)]),
        trailer: Some(EdgesTrailer {
            labels: IdVec::<EdgeSlot, &Label>::from_raw(vec![
                Label::new("north"),
                Label::EMPTY,
                Label::new("south"),
            ]),
            representative_type_urls: IdVec::from_raw(vec![Some(alpha), None, Some(beta)]),
            representative_type_urls_interner: interner,
        }),
        ..minimal_document(generation)
    };

    let mut buffer = Vec::new_in(&Global);
    let _completed = document
        .encode(&mut buffer)
        .expect("should complete the auxiliary edges response");

    let expected = cbor_map([
        (
            0,
            cbor_array([
                cbor_text("https://example.com/types/alpha/v/1"),
                cbor_text("https://example.com/types/beta/v/1"),
            ]),
        ),
        (
            1,
            cbor_array([cbor_text("north"), vec![CBOR_NULL], cbor_text("south")]),
        ),
        (2, cbor_array([cbor_uint(0), vec![CBOR_NULL], cbor_uint(1)])),
    ]);

    assert_eq!(
        trailer_bytes(&buffer),
        expected.as_slice(),
        "should carry the URL table and the label and index arrays aligned to the edge slots"
    );
    assert_eq!(
        slot_bytes(&buffer, 0),
        expected_head(&digest, 0, 3, true, true).as_slice(),
        "should report the present trailer at head key 4"
    );
}

/// An auxiliary trailer over zero edges keeps every array present but empty.
#[test]
fn trailer_auxiliary_empty() {
    let (digest, generation) = generation_of(0x05);
    let document = EdgesDocument {
        trailer: Some(EdgesTrailer {
            labels: IdVec::<EdgeSlot, &Label>::from_raw(Vec::new()),
            representative_type_urls: IdVec::from_raw(Vec::new()),
            representative_type_urls_interner: InternTable::new(),
        }),
        ..minimal_document(generation)
    };

    let mut buffer = Vec::new_in(&Global);
    let _completed = document
        .encode(&mut buffer)
        .expect("should complete the empty auxiliary edges response");

    let expected = cbor_map([
        (0, cbor_array([])),
        (1, cbor_array([])),
        (2, cbor_array([])),
    ]);

    assert_eq!(
        trailer_bytes(&buffer),
        expected.as_slice(),
        "should keep the URL table and the label and index arrays present but empty"
    );
    assert_eq!(
        slot_bytes(&buffer, 0),
        expected_head(&digest, 0, 0, true, true).as_slice(),
        "should report the trailer as present though every array inside it is empty"
    );
}
