//! Certificates for the attraction file's geometry.
//!
//! Header equations, byte-level round trips, and rejection of foreign or torn bytes.

use core::assert_matches;
use std::{fs, path::PathBuf};

use zerocopy::{F32, IntoBytes as _, U32, U64};

use super::{EdgeRecord, FileHeader, GroupRecord, read::AttractionFile, write::write_records};
use crate::file::attraction::read::OpenAttractionError;

#[test]
fn header_bytes_lead_with_magic_and_version() {
    let header = FileHeader::new(3, 17, 100);
    let bytes = header.as_bytes();

    assert!(bytes.len() >= 40, "the header covers the asserted bytes");
    assert_eq!(&bytes[0..8], b"SALTATRC");
    assert_eq!(&bytes[8..12], &0_u32.to_le_bytes());
    assert_eq!(&bytes[16..24], &3_u64.to_le_bytes());
    assert_eq!(&bytes[24..32], &17_u64.to_le_bytes());
    assert_eq!(&bytes[32..40], &100_u64.to_le_bytes());
}

#[test]
fn geometry_equations_match_hand_computed_offsets() {
    // 3 groups occupy 96 bytes, padded to one region unit.
    let header = FileHeader::new(3, 17, 100);
    assert_eq!(header.edges_offset(), Some(8192));
    assert_eq!(header.expected_file_len(), Some(8192 + 17 * 40));

    // 128 groups fill exactly one region unit: no padding.
    let exact = FileHeader::new(128, 1, 100);
    assert_eq!(exact.edges_offset(), Some(4096 + 4096));

    // An empty index is exactly one header.
    let empty = FileHeader::new(0, 0, 0);
    assert_eq!(empty.edges_offset(), Some(4096));
    assert_eq!(empty.expected_file_len(), Some(4096));

    // Overflowing geometry matches no real file.
    let absurd = FileHeader::new(u64::MAX, u64::MAX, u64::MAX);
    assert_eq!(absurd.expected_file_len(), None);
}

/// A per-test scratch file path under the system temp directory.
fn scratch(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "hash-graph-atlas-attraction-file-{}",
        std::process::id(),
    ));
    fs::create_dir_all(&dir).expect("the temp directory is writable");
    dir.join(name)
}

fn group(relation: u64, first_edge: u64, weights: [f32; 3]) -> GroupRecord {
    GroupRecord {
        relation: U64::new(relation),
        first_edge: U64::new(first_edge),
        coincident: F32::new(weights[0]),
        proximal: F32::new(weights[1]),
        strength: F32::new(weights[2]),
        reserved: U32::new(0),
    }
}

fn edge(edge: u64, source: u64, target: u64, confidence: f32, degree: f32) -> EdgeRecord {
    EdgeRecord {
        edge: U64::new(edge),
        source: U64::new(source),
        target: U64::new(target),
        confidence: F32::new(confidence),
        normalization: F32::new(degree),
        scored: U32::new(0b101),
        reserved: U32::new(0),
    }
}

fn fixture_bytes() -> Vec<u8> {
    let groups = [group(3, 0, [0.5, 0.5, 1.0]), group(9, 2, [0.0, 1.0, 1.0])];
    let edges = [
        edge(0, 0, 1, 1.0, 0.5),
        edge(1, 2, 3, 0.5, 0.5),
        edge(2, 0, 2, 0.25, 1.0),
    ];

    let mut bytes = Vec::new();
    write_records(8, groups.into_iter(), 3, edges.into_iter(), &mut bytes)
        .expect("writing into a vector cannot fail");
    bytes
}

#[test]
#[expect(
    clippy::float_cmp,
    reason = "round-tripped wire values are bit-exact: the file stores the written f32 bits \
              verbatim, so exact equality is the contract"
)]
fn written_records_reopen_verbatim() {
    let path = scratch("roundtrip.atrc");
    fs::write(&path, fixture_bytes()).expect("the scratch file is writable");

    let file = AttractionFile::open(&path).expect("the written file reopens");

    assert_eq!(file.rows(), 8);
    let groups = file.groups();
    assert_eq!(groups.len(), 2);
    assert_eq!(groups[0].relation.get(), 3);
    assert_eq!(groups[0].first_edge.get(), 0);
    assert_eq!(groups[0].coincident.get(), 0.5);
    assert_eq!(groups[1].relation.get(), 9);
    assert_eq!(groups[1].first_edge.get(), 2);
    assert_eq!(groups[1].proximal.get(), 1.0);

    let edges = file.edges();
    assert_eq!(edges.len(), 3);
    assert_eq!(edges[0].edge.get(), 0);
    assert_eq!(edges[1].source.get(), 2);
    assert_eq!(edges[1].target.get(), 3);
    assert_eq!(edges[2].confidence.get(), 0.25);
    assert_eq!(edges[2].normalization.get(), 1.0);
    assert_eq!(edges[0].scored.get(), 0b101);
}

#[test]
fn empty_index_reopens() {
    // Zero counts are valid geometry: two empty regions.
    let path = scratch("empty.atrc");
    let mut bytes = Vec::new();
    write_records(0, core::iter::empty(), 0, core::iter::empty(), &mut bytes)
        .expect("writing into a vector cannot fail");
    fs::write(&path, bytes).expect("the scratch file is writable");

    let file = AttractionFile::open(&path).expect("the empty file reopens");
    assert_eq!(file.rows(), 0);
    assert!(file.groups().is_empty());
    assert!(file.edges().is_empty());
}

#[test]
#[should_panic(expected = "the edge stream's length promise holds")]
fn writer_rejects_a_broken_edge_count_promise() {
    let groups = [group(3, 0, [0.5, 0.5, 1.0])];
    let edges = [edge(0, 0, 1, 1.0, 0.5)];

    let mut bytes = Vec::new();
    let _result = write_records(8, groups.into_iter(), 2, edges.into_iter(), &mut bytes);
}

#[test]
fn open_rejects_foreign_and_torn_bytes() {
    let undersized = scratch("undersized.atrc");
    fs::write(&undersized, [0_u8; 16]).expect("the scratch file is writable");
    assert_matches!(
        AttractionFile::open(&undersized),
        Err(OpenAttractionError::Undersized { actual: 16 }),
    );

    let foreign = scratch("foreign.atrc");
    let mut bytes = fixture_bytes();
    bytes[..8].copy_from_slice(b"SALTELSE");
    fs::write(&foreign, &bytes).expect("the scratch file is writable");
    assert_matches!(
        AttractionFile::open(&foreign),
        Err(OpenAttractionError::Header(_)),
    );

    let future = scratch("future-version.atrc");
    let mut bytes = fixture_bytes();
    bytes[8..12].copy_from_slice(&1_u32.to_le_bytes());
    fs::write(&future, &bytes).expect("the scratch file is writable");
    assert_matches!(
        AttractionFile::open(&future),
        Err(OpenAttractionError::Header(_)),
    );

    let torn = scratch("torn.atrc");
    let mut bytes = fixture_bytes();
    bytes.truncate(bytes.len() - 1);
    fs::write(&torn, &bytes).expect("the scratch file is writable");
    assert_matches!(
        AttractionFile::open(&torn),
        Err(OpenAttractionError::Length { .. }),
    );
}
