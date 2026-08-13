//! Certificates for the attraction file's geometry.
//!
//! Header equations, byte-level round trips, and rejection of foreign or torn bytes.

use core::assert_matches;
use std::{fs, path::PathBuf};

use zerocopy::IntoBytes as _;

use super::{
    EdgeKind, EdgeRecord, FileHeader, GroupRecord, NodeKind, read::AttractionFile,
    write::write_records,
};
use crate::{
    file::{
        attraction::read::OpenAttractionError,
        region::{header::HeaderError, machine::Machine},
    },
    identity::{EdgeRowId, NodeRowId, OntologyRowId},
    math::{NonNegative, PositiveUnitFraction, UnitFraction},
};

#[test]
fn header_bytes_lead_with_magic_and_version() {
    let header = FileHeader::new(NodeKind::NodeRowId, EdgeKind::EdgeRowId, 3, 17, 100);
    let bytes = header.as_bytes();

    assert!(bytes.len() >= 44, "the header covers the asserted bytes");
    assert_eq!(&bytes[0..8], b"SALTATRC");
    assert_eq!(&bytes[8..12], &2_u32.to_le_bytes());
    assert_eq!(&bytes[12..16], Machine::current().as_bytes());
    // The founding domains encode as zero, so zero is each kind slot's default.
    assert_eq!(&bytes[16..18], &0_u16.to_le_bytes());
    assert_eq!(&bytes[18..20], &0_u16.to_le_bytes());
    assert_eq!(&bytes[20..28], &3_u64.to_le_bytes());
    assert_eq!(&bytes[28..36], &17_u64.to_le_bytes());
    assert_eq!(&bytes[36..44], &100_u64.to_le_bytes());
}

#[test]
fn geometry_equations_match_hand_computed_offsets() {
    // 3 groups occupy 96 bytes, padded to one region unit.
    let header = FileHeader::new(NodeKind::NodeRowId, EdgeKind::EdgeRowId, 3, 17, 100);
    assert_eq!(header.edges_offset(), Some(8192));
    assert_eq!(
        header.expected_file_len(size_of::<EdgeRecord<NodeRowId, EdgeRowId>>() as u64),
        Some(8192 + 17 * 48)
    );

    // 128 groups fill exactly one region unit: no padding.
    let exact = FileHeader::new(NodeKind::NodeRowId, EdgeKind::EdgeRowId, 128, 1, 100);
    assert_eq!(exact.edges_offset(), Some(4096 + 4096));

    // An empty index is exactly one header.
    let empty = FileHeader::new(NodeKind::NodeRowId, EdgeKind::EdgeRowId, 0, 0, 0);
    assert_eq!(empty.edges_offset(), Some(4096));
    assert_eq!(
        empty.expected_file_len(size_of::<EdgeRecord<NodeRowId, EdgeRowId>>() as u64),
        Some(4096)
    );

    // Overflowing geometry matches no real file.
    let absurd = FileHeader::new(
        NodeKind::NodeRowId,
        EdgeKind::EdgeRowId,
        u64::MAX,
        u64::MAX,
        u64::MAX,
    );
    assert_eq!(
        absurd.expected_file_len(size_of::<EdgeRecord<NodeRowId, EdgeRowId>>() as u64),
        None
    );
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

fn group(relation: u64, edge_offset: u64, weights: [f32; 3]) -> GroupRecord {
    let weight = |value: f32| NonNegative::new(value).expect("the fixture weights are in domain");
    GroupRecord::new(
        OntologyRowId::new(relation),
        edge_offset,
        weight(weights[0]),
        weight(weights[1]),
        weight(weights[2]),
    )
}

fn edge(
    edge: u64,
    source: u64,
    target: u64,
    confidence: f64,
    degree: f64,
) -> EdgeRecord<NodeRowId, EdgeRowId> {
    EdgeRecord::new(
        EdgeRowId::new(edge),
        NodeRowId::new(source),
        NodeRowId::new(target),
        UnitFraction::new(confidence).expect("the fixture confidences are in domain"),
        PositiveUnitFraction::new(degree).expect("the fixture degrees are in domain"),
        0b101,
    )
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
fn written_records_reopen_verbatim() {
    let path = scratch("roundtrip.atrc");
    fs::write(&path, fixture_bytes()).expect("the scratch file is writable");

    let file =
        AttractionFile::<NodeRowId, EdgeRowId>::open(&path).expect("the written file reopens");

    assert_eq!(file.rows(), 8);
    let groups = file.groups();
    assert_eq!(groups.len(), 2);
    assert_eq!(groups[0].relation(), OntologyRowId::new(3));
    assert_eq!(groups[0].edge_offset(), 0);
    assert_eq!(groups[0].coincident(), 0.5);
    assert_eq!(groups[1].relation(), OntologyRowId::new(9));
    assert_eq!(groups[1].edge_offset(), 2);
    assert_eq!(groups[1].proximal(), 1.0);

    let edges = file.edges();
    assert_eq!(edges.len(), 3);
    assert_eq!(edges[0].edge(), EdgeRowId::new(0));
    assert_eq!(edges[1].source(), NodeRowId::new(2));
    assert_eq!(edges[1].target(), NodeRowId::new(3));
    assert_eq!(edges[2].confidence(), 0.25);
    assert_eq!(edges[2].normalization(), 1.0);
    assert_eq!(edges[0].scored(), 0b101);
}

#[test]
fn empty_index_reopens() {
    // Zero counts are valid geometry: two empty regions.
    let path = scratch("empty.atrc");
    let mut bytes = Vec::new();
    write_records(
        0,
        core::iter::empty(),
        0,
        core::iter::empty::<EdgeRecord<NodeRowId, EdgeRowId>>(),
        &mut bytes,
    )
    .expect("writing into a vector cannot fail");
    fs::write(&path, bytes).expect("the scratch file is writable");

    let file = AttractionFile::<NodeRowId, EdgeRowId>::open(&path).expect("the empty file reopens");
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
        AttractionFile::<NodeRowId, EdgeRowId>::open(&undersized),
        Err(OpenAttractionError::Header(HeaderError::Undersized {
            actual: 16
        })),
    );

    let foreign = scratch("foreign.atrc");
    let mut bytes = fixture_bytes();
    bytes[..8].copy_from_slice(b"SALTELSE");
    fs::write(&foreign, &bytes).expect("the scratch file is writable");
    assert_matches!(
        AttractionFile::<NodeRowId, EdgeRowId>::open(&foreign),
        Err(OpenAttractionError::Header(_)),
    );

    let future = scratch("future-version.atrc");
    let mut bytes = fixture_bytes();
    bytes[8..12].copy_from_slice(&3_u32.to_le_bytes());
    fs::write(&future, &bytes).expect("the scratch file is writable");
    assert_matches!(
        AttractionFile::<NodeRowId, EdgeRowId>::open(&future),
        Err(OpenAttractionError::Header(_)),
    );

    let torn = scratch("torn.atrc");
    let mut bytes = fixture_bytes();
    bytes.truncate(bytes.len() - 1);
    fs::write(&torn, &bytes).expect("the scratch file is writable");
    assert_matches!(
        AttractionFile::<NodeRowId, EdgeRowId>::open(&torn),
        Err(OpenAttractionError::Length { .. }),
    );

    // An unminted row domain fails the header parse itself: the kind enums admit only declared
    // values, so no comparison is ever reached.
    let unminted_endpoint = scratch("unminted-endpoint.atrc");
    let mut bytes = fixture_bytes();
    bytes[16..18].copy_from_slice(&1_u16.to_le_bytes());
    fs::write(&unminted_endpoint, &bytes).expect("the scratch file is writable");
    assert_matches!(
        AttractionFile::<NodeRowId, EdgeRowId>::open(&unminted_endpoint),
        Err(OpenAttractionError::Header(_)),
    );

    let unminted_edge = scratch("unminted-edge.atrc");
    let mut bytes = fixture_bytes();
    bytes[18..20].copy_from_slice(&1_u16.to_le_bytes());
    fs::write(&unminted_edge, &bytes).expect("the scratch file is writable");
    assert_matches!(
        AttractionFile::<NodeRowId, EdgeRowId>::open(&unminted_edge),
        Err(OpenAttractionError::Header(_)),
    );
}
