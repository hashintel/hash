use std::fs;

use camino::Utf8PathBuf;
use sprs::CsMatViewI;

use super::{Adjacency, EdgeList, InvalidAdjacencyFile, MappedAdjacency};
use crate::{
    dataset::{EdgeRowId, NodeRowId},
    file::sprs::{read::SprsFile, write::write_matrix},
    integrity::{Sha256, Writer},
};

fn scratch(name: &str) -> Utf8PathBuf {
    let dir = Utf8PathBuf::from_path_buf(std::env::temp_dir())
        .expect("the temp directory is UTF-8")
        .join(format!(
            "hash-graph-atlas-salt-adjacency-{}-{name}",
            std::process::id()
        ));
    let _: Result<(), std::io::Error> = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).expect("the scratch directory should create");
    dir
}

/// The five-node fixture with a parallel pair, a self-loop, and a
/// zero-degree node.
///
/// Edge rows: 0 and 3 both `0 -> 1` (parallel), 1 is `2 -> 3`, 2 is the
/// self-loop `3 -> 3`. Node row 4 touches nothing.
const ENDPOINTS: [[u64; 2]; 4] = [[0, 1], [2, 3], [3, 3], [0, 1]];
const ROWS: usize = 5;

fn mapped(dir: &Utf8PathBuf, name: &str, adjacency: &Adjacency) -> MappedAdjacency {
    let path = dir.join(name);
    let mut file = fs::File::create(&path).expect("the fixture file should create");
    adjacency
        .write_into(&mut file)
        .expect("the adjacency should write");
    drop(file);

    MappedAdjacency::new(SprsFile::open(&path).expect("the fixture file should open"))
        .expect("the fixture adjacency should validate")
}

fn list(edges: Option<EdgeList<'_>>) -> Vec<u64> {
    edges
        .expect("the queried node row is in domain")
        .iter()
        .map(EdgeRowId::get)
        .collect()
}

#[test]
fn the_build_matches_the_hand_computed_lists() {
    let dir = scratch("hand-computed");
    let adjacency = Adjacency::build(ROWS, &ENDPOINTS);
    let mapped = mapped(&dir, "fixture.sprs", &adjacency);

    assert_eq!(mapped.rows(), ROWS as u64);
    assert_eq!(mapped.edges(), ENDPOINTS.len() as u64);

    // Outgoing lists per node row, ascending: the parallel pair leaves
    // node 0 as edges 0 and 3.
    assert_eq!(list(mapped.outgoing(NodeRowId::new(0))), [0, 3]);
    assert_eq!(list(mapped.outgoing(NodeRowId::new(1))), [] as [u64; 0]);
    assert_eq!(list(mapped.outgoing(NodeRowId::new(2))), [1]);
    assert_eq!(list(mapped.outgoing(NodeRowId::new(3))), [2]);
    assert_eq!(list(mapped.outgoing(NodeRowId::new(4))), [] as [u64; 0]);

    // Incoming lists mirror the targets; the self-loop arrives at its
    // own node.
    assert_eq!(list(mapped.incoming(NodeRowId::new(1))), [0, 3]);
    assert_eq!(list(mapped.incoming(NodeRowId::new(3))), [1, 2]);

    // The incident slice concatenates the runs; the self-loop appears
    // in both.
    assert_eq!(list(mapped.incident(NodeRowId::new(3))), [2, 1, 2]);
    assert_eq!(mapped.degree(NodeRowId::new(3)), Some(3));
    assert_eq!(mapped.degree(NodeRowId::new(4)), Some(0));

    // Out-of-domain rows answer None.
    assert!(mapped.outgoing(NodeRowId::new(5)).is_none());
    assert!(mapped.degree(NodeRowId::new(5)).is_none());
}

#[test]
fn contains_agrees_with_a_linear_scan() {
    let dir = scratch("contains");
    let adjacency = Adjacency::build(ROWS, &ENDPOINTS);
    let mapped = mapped(&dir, "fixture.sprs", &adjacency);

    for node in 0..ROWS as u64 {
        for direction in [
            mapped.outgoing(NodeRowId::new(node)),
            mapped.incoming(NodeRowId::new(node)),
        ] {
            let run = direction.expect("the node row is in domain");
            for edge in 0..ENDPOINTS.len() as u64 {
                let linear = run.iter().any(|held| held.get() == edge);
                assert_eq!(
                    run.contains(EdgeRowId::new(edge)),
                    linear,
                    "node {node} edge {edge}",
                );
            }
        }
    }
}

#[test]
fn an_edgeless_corpus_builds_empty_lists() {
    let dir = scratch("edgeless");
    let adjacency = Adjacency::build(2, &[]);
    let mapped = mapped(&dir, "edgeless.sprs", &adjacency);

    assert_eq!(mapped.rows(), 2);
    assert_eq!(mapped.edges(), 0);
    assert!(
        mapped
            .incident(NodeRowId::new(0))
            .expect("row 0 is in domain")
            .is_empty()
    );
}

/// Writes a hand-built structure-only matrix and opens it as a mapped
/// adjacency.
fn open_structure(
    dir: &Utf8PathBuf,
    name: &str,
    shape: (usize, usize),
    fenceposts: &[u64],
    values: &[u64],
) -> Result<MappedAdjacency, InvalidAdjacencyFile> {
    let path = dir.join(name);
    let mut writer = Writer {
        accumulator: Sha256::new(),
        writer: fs::File::create(&path).expect("the raw file should create"),
    };
    let units = vec![(); values.len()];
    let matrix = CsMatViewI::<'_, (), u64, u64>::try_new(shape, fenceposts, values, &units)
        .expect("the hand-built structure is a valid compressed matrix");
    write_matrix(&matrix, &mut writer).expect("the raw matrix should write");

    MappedAdjacency::new(SprsFile::open(&path).expect("the raw file should open"))
}

#[test]
fn violated_list_invariants_are_rejected() {
    let dir = scratch("violations");

    // An odd row dimension pairs no runs.
    assert!(matches!(
        open_structure(&dir, "odd.sprs", (1, 1), &[0, 0], &[]),
        Err(InvalidAdjacencyFile::OddRows { rows: 1 }),
    ));

    // An odd entry count holds no two slots per edge.
    assert!(matches!(
        open_structure(&dir, "slots.sprs", (2, 1), &[0, 1, 1], &[0]),
        Err(InvalidAdjacencyFile::Slots { entries: 1 }),
    ));

    // A column dimension beyond the edge-domain bound is not the
    // canonical artifact.
    assert!(matches!(
        open_structure(&dir, "bound.sprs", (2, 5), &[0, 1, 2], &[0, 0]),
        Err(InvalidAdjacencyFile::Bound {
            columns: 5,
            edges: 1,
        }),
    ));

    // An edge in two slots of one direction: both outgoing runs hold
    // edge 0.
    assert!(matches!(
        open_structure(&dir, "duplicate.sprs", (4, 1), &[0, 1, 1, 2, 2], &[0, 0]),
        Err(InvalidAdjacencyFile::Duplicate { edge: 0 }),
    ));

    // A valued matrix is not the structure-only artifact.
    let path = dir.join("valued.sprs");
    let mut writer = Writer {
        accumulator: Sha256::new(),
        writer: fs::File::create(&path).expect("the valued file should create"),
    };
    let valued = CsMatViewI::<'_, f32, u64, u64>::try_new((2, 1), &[0, 1, 2], &[0, 0], &[1.0, 2.0])
        .expect("the valued matrix is a valid compressed matrix");
    write_matrix(&valued, &mut writer).expect("the valued matrix should write");
    assert!(matches!(
        MappedAdjacency::new(SprsFile::open(&path).expect("the valued file should open")),
        Err(InvalidAdjacencyFile::Matrix(_)),
    ));
}

/// A fencepost column anchored past zero passes the compressed-row
/// check - the entry count reads relative to the first post - but
/// leaves leading slots no run owns, which the adjacency rejects.
#[test]
#[expect(
    clippy::little_endian_bytes,
    reason = "the surgery edits the format's pinned little-endian fencepost region"
)]
fn a_shifted_fencepost_column_is_rejected() {
    let dir = scratch("shifted");
    let path = dir.join("shifted.sprs");

    let adjacency = Adjacency::build(2, &[[0, 1]]);
    let mut file = fs::File::create(&path).expect("the fixture file should create");
    adjacency
        .write_into(&mut file)
        .expect("the adjacency should write");
    drop(file);

    // Shift every fencepost up by one: monotonicity and the relative
    // entry count survive, the zero anchor does not. The posts sit in
    // the page-aligned region behind the header, eight bytes each.
    let mut bytes = fs::read(&path).expect("the fixture file should read");
    let posts = 2 * 2 + 1;
    for post in 0..posts {
        let offset = 4096 + post * 8;
        let mut value = u64::from_le_bytes(
            bytes[offset..offset + 8]
                .try_into()
                .expect("eight bytes slice exactly"),
        );
        value += 1;
        bytes[offset..offset + 8].copy_from_slice(&value.to_le_bytes());
    }
    fs::write(&path, &bytes).expect("the shifted file should write");

    assert!(matches!(
        MappedAdjacency::new(SprsFile::open(&path).expect("the shifted file should open")),
        Err(InvalidAdjacencyFile::Start),
    ));
}

#[test]
fn the_build_is_independent_of_the_endpoint_values_within_a_row() {
    // A permuted edge order is a different corpus (edge rows are
    // positional), but every list still comes out strictly ascending.
    let permuted: [[u64; 2]; 4] = [ENDPOINTS[3], ENDPOINTS[1], ENDPOINTS[0], ENDPOINTS[2]];
    let dir = scratch("permuted");
    let adjacency = Adjacency::build(ROWS, &permuted);
    let mapped = mapped(&dir, "permuted.sprs", &adjacency);

    assert_eq!(list(mapped.outgoing(NodeRowId::new(0))), [0, 2]);
    assert_eq!(list(mapped.incoming(NodeRowId::new(3))), [1, 3]);
    assert_eq!(list(mapped.incident(NodeRowId::new(3))), [3, 1, 3]);
}

/// Wide indices read back through the same accessors: a hand-built
/// eight-byte matrix validates and serves runs like the narrow files
/// the writer emits.
#[test]
fn wide_indices_read_back() {
    let dir = scratch("wide");
    let mapped = open_structure(&dir, "wide.sprs", (2, 1), &[0, 1, 2], &[0, 0])
        .expect("hand-built wide adjacency should validate");

    assert_eq!(mapped.rows(), 1);
    assert_eq!(mapped.edges(), 1);
    assert_eq!(list(mapped.outgoing(NodeRowId::new(0))), [0]);
    assert_eq!(list(mapped.incoming(NodeRowId::new(0))), [0]);
}

/// The retired format's reader inverts the test encoder at both
/// widths, so migrated lists are the published lists verbatim.
#[test]
fn the_retired_format_round_trips() {
    let adjacency = Adjacency::build(ROWS, &ENDPOINTS);
    for width in [4, 8] {
        let bytes = super::legacy::write_legacy(&adjacency, width);
        assert_eq!(
            super::legacy::read_legacy(&bytes).expect("the retired bytes should parse"),
            adjacency,
            "width {width}",
        );
    }
}
