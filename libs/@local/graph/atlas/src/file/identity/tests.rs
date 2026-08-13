#![expect(
    clippy::little_endian_bytes,
    reason = "the wire-layout assertions pin the format's canonical little-endian bytes"
)]
use core::assert_matches;
use std::{fs, path::PathBuf};

use hashql_core::id::IdSlice;
use zerocopy::{IntoBytes as _, TryFromBytes as _};

use super::{
    FileHeader, Key as _, KeyKind, Kind, PaddedFileHeader, PayloadSpan,
    read::{IdentityFile, OpenIdentityError},
    write::write_regions,
};
use crate::{
    dataset::{
        auxiliary::{Icon, Label},
        memory::{MemoryNodeId, MemoryOntologyId},
    },
    file::region::{header::HeaderError, machine::Machine},
    identity::{NodeRowId, OntologyRowId},
};

#[test]
fn header_wire_layout() {
    let header = PaddedFileHeader::new(FileHeader::new(Kind::Nodes, KeyKind::U64Le, 7, 100, 50));
    let bytes = header.as_bytes();

    // The literal length pins the layout and bounds the region slices.
    assert_eq!(bytes.len(), 4096);
    assert_eq!(&bytes[..8], b"SALTIDNT");
    assert_eq!(&bytes[8..12], &2_u32.to_le_bytes(), "version 2");
    assert_eq!(
        &bytes[12..16],
        Machine::current().as_bytes(),
        "machine information"
    );
    assert_eq!(&bytes[16..18], &1_u16.to_le_bytes(), "kind: nodes");
    assert_eq!(
        &bytes[18..20],
        &0x0102_u16.to_le_bytes(),
        "key kind: u64 LE",
    );
    assert_eq!(&bytes[20..28], &7_u64.to_le_bytes(), "row count");
    assert_eq!(&bytes[28..36], &100_u64.to_le_bytes(), "index size");
    assert_eq!(&bytes[36..44], &50_u64.to_le_bytes(), "payload size");
    assert!(
        bytes[44..].iter().all(|&byte| byte == 0),
        "writers emit zero padding",
    );
}

#[test]
fn geometry_pads_every_region_to_page_boundaries() {
    // 7 eight-byte keys are 56 bytes, padded to one 4096-byte unit; 100 index bytes and 7
    // sixteen-byte spans pad likewise. The trailing 50 payload bytes end the file unpadded.
    let header = FileHeader::new(Kind::Nodes, KeyKind::U64Le, 7, 100, 50);
    assert_eq!(header.index_offset(), Some(2 * 4096));
    assert_eq!(header.spans_offset(), Some(3 * 4096));
    assert_eq!(header.payload_offset(), Some(4 * 4096));
    assert_eq!(header.expected_file_len(), Some(4 * 4096 + 50));

    // 512 eight-byte keys and 4096 index bytes each fill exactly one region unit: no padding.
    let exact = FileHeader::new(Kind::Nodes, KeyKind::U64Le, 512, 4096, 0);
    assert_eq!(exact.index_offset(), Some(2 * 4096));
    assert_eq!(exact.spans_offset(), Some(3 * 4096));
    assert_eq!(exact.payload_offset(), Some(5 * 4096));
    assert_eq!(exact.expected_file_len(), Some(5 * 4096));

    // Overflowing geometry matches no real file.
    let overflow = FileHeader::new(Kind::Nodes, KeyKind::U64Le, u64::MAX, 1, 1);
    assert_eq!(overflow.expected_file_len(), None);
}

#[test]
fn key_kinds_declare_their_types_width() {
    assert_eq!(KeyKind::OntologyTypeUuid.width(), 16);
    assert_eq!(KeyKind::EntityId.width(), 32);
    assert_eq!(KeyKind::U8Le.width(), 1);
    assert_eq!(KeyKind::U16Le.width(), 2);
    assert_eq!(KeyKind::U64Le.width(), 8);
    assert_eq!(MemoryNodeId::KIND, KeyKind::U64Le);
}

/// A per-test scratch file path under the system temp directory.
fn scratch(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "hash-graph-atlas-identity-file-{}",
        std::process::id(),
    ));
    fs::create_dir_all(&dir).expect("the temp directory is writable");
    dir.join(name)
}

// Eight-byte keys in row order; ascending key-byte order is rows 2, 0, 1.
const KEYS: [MemoryNodeId; 3] = [
    MemoryNodeId::new(u64::from_le_bytes([9, 0, 0, 1, 0, 0, 0, 0])),
    MemoryNodeId::new(u64::from_le_bytes([9, 0, 0, 2, 0, 0, 0, 0])),
    MemoryNodeId::new(u64::from_le_bytes([3, 7, 7, 7, 0, 0, 0, 0])),
];

// Rows 0 and 2 carry equal payload bytes, so interning gives them one span.
const PAYLOADS: [&str; 3] = ["beta", "alpha", "beta"];

/// Borrows `text` as a label.
fn label(text: &str) -> &Label {
    Label::try_ref_from_bytes(text.as_bytes()).expect("UTF-8 text is a valid label")
}

fn fixture_bytes() -> Vec<u8> {
    let mut bytes = Vec::new();
    write_regions(
        Kind::Nodes,
        IdSlice::<NodeRowId, _>::from_raw(&KEYS),
        PAYLOADS.map(label),
        &mut bytes,
    )
    .expect("writing into a vector cannot fail");
    bytes
}

#[test]
fn written_regions_reopen_verbatim() {
    let path = scratch("roundtrip.idnt");
    fs::write(&path, fixture_bytes()).expect("the scratch file is writable");

    let file = IdentityFile::open(&path).expect("the written file reopens");

    assert_eq!(file.kind(), Kind::Nodes);
    assert_eq!(file.key_kind(), KeyKind::U64Le);
    assert_eq!(file.rows(), 3);

    // The key column is the input verbatim, in row order.
    assert_eq!(file.keys(), KEYS.as_bytes());

    // The index resolves each key to its row and nothing else.
    let index = file.index();
    assert_eq!(index.len(), 3);
    for (row, key) in KEYS.iter().enumerate() {
        assert_eq!(index.get(key.as_bytes()), Some(row as u64));
    }
    assert_eq!(index.get([0; 8]), None);

    // Interning writes each distinct payload once, in first-appearance order, and rows carrying
    // equal bytes share one span.
    assert_eq!(file.payload(), b"betaalpha".as_slice());
    assert_eq!(
        file.spans(),
        [
            PayloadSpan::new(0, 4),
            PayloadSpan::new(4, 5),
            PayloadSpan::new(0, 4),
        ],
    );
}

#[test]
fn empty_table_reopens() {
    // A zero count is valid geometry: the regions are empty apart from the index, which parses
    // with zero keys in it.
    let keys: [MemoryOntologyId; 0] = [];
    let payloads: [&Icon; 0] = [];
    let mut bytes = Vec::new();
    write_regions(
        Kind::Ontology,
        IdSlice::<OntologyRowId, _>::from_raw(&keys),
        payloads,
        &mut bytes,
    )
    .expect("writing into a vector cannot fail");

    let path = scratch("empty.idnt");
    fs::write(&path, bytes).expect("the scratch file is writable");

    let file = IdentityFile::open(&path).expect("the empty file reopens");
    assert_eq!(file.kind(), Kind::Ontology);
    assert_eq!(file.rows(), 0);
    assert!(file.keys().is_empty());
    assert_eq!(file.index().len(), 0);
    assert!(file.spans().is_empty());
    assert!(file.payload().is_empty());
}

#[test]
fn open_rejects_foreign_and_torn_bytes() {
    let undersized = scratch("undersized.idnt");
    fs::write(&undersized, [0_u8; 16]).expect("the scratch file is writable");
    assert_matches!(
        IdentityFile::open(&undersized),
        Err(OpenIdentityError::Header(HeaderError::Undersized {
            actual: 16
        })),
    );

    let foreign = scratch("foreign.idnt");
    let mut bytes = fixture_bytes();
    bytes[..8].copy_from_slice(b"SALTELSE");
    fs::write(&foreign, &bytes).expect("the scratch file is writable");
    assert_matches!(
        IdentityFile::open(&foreign),
        Err(OpenIdentityError::Header(_)),
    );

    // Layout version 0 is a predecessor format's, and this parse speaks only version 2.
    let old_version = scratch("old-version.idnt");
    let mut bytes = fixture_bytes();
    bytes[8..12].copy_from_slice(&0_u32.to_le_bytes());
    fs::write(&old_version, &bytes).expect("the scratch file is writable");
    assert_matches!(
        IdentityFile::open(&old_version),
        Err(OpenIdentityError::Header(_)),
    );

    let alien_kind = scratch("alien-kind.idnt");
    let mut bytes = fixture_bytes();
    bytes[16..18].copy_from_slice(&3_u16.to_le_bytes());
    fs::write(&alien_kind, &bytes).expect("the scratch file is writable");
    assert_matches!(
        IdentityFile::open(&alien_kind),
        Err(OpenIdentityError::Header(_)),
    );

    let alien_key_kind = scratch("alien-key-kind.idnt");
    let mut bytes = fixture_bytes();
    bytes[18..20].copy_from_slice(&0x0200_u16.to_le_bytes());
    fs::write(&alien_key_kind, &bytes).expect("the scratch file is writable");
    assert_matches!(
        IdentityFile::open(&alien_key_kind),
        Err(OpenIdentityError::Header(_)),
    );

    let torn = scratch("torn.idnt");
    let mut bytes = fixture_bytes();
    bytes.truncate(bytes.len() - 1);
    fs::write(&torn, &bytes).expect("the scratch file is writable");
    assert_matches!(
        IdentityFile::open(&torn),
        Err(OpenIdentityError::Length { .. }),
    );

    // Zeroing the index region leaves the geometry intact and the fst parse is what refuses.
    // Three eight-byte keys pad to one region unit, so the index starts at 8192; its exact size
    // sits at header bytes 28..36.
    let mangled_index = scratch("mangled-index.idnt");
    let mut bytes = fixture_bytes();
    let index_bytes = u64::from_le_bytes(bytes[28..36].try_into().expect("eight bytes"));
    let start = 8192_usize;
    let end = start + usize::try_from(index_bytes).expect("the index fits the address space");
    bytes[start..end].fill(0);
    fs::write(&mangled_index, &bytes).expect("the scratch file is writable");
    assert_matches!(
        IdentityFile::open(&mangled_index),
        Err(OpenIdentityError::Index(_)),
    );
}

#[test]
#[should_panic(expected = "one payload per key")]
fn writer_rejects_disagreeing_columns() {
    let payloads = ["a", "b"].map(label);
    let mut bytes = Vec::new();
    let _result = write_regions(
        Kind::Nodes,
        IdSlice::<NodeRowId, _>::from_raw(&KEYS),
        payloads,
        &mut bytes,
    );
}

#[test]
#[should_panic(expected = "two rows carry one key")]
fn writer_rejects_duplicate_keys() {
    let keys = [KEYS[0], KEYS[0]];
    let payloads = ["a", "b"].map(label);
    let mut bytes = Vec::new();
    let _result = write_regions(
        Kind::Nodes,
        IdSlice::<NodeRowId, _>::from_raw(&keys),
        payloads,
        &mut bytes,
    );
}
