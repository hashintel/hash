use core::assert_matches;
use std::fs;

use camino::Utf8PathBuf;
use hashql_core::id::Id as _;
use sprs::CsMatViewI;

use super::{Adjacency, AdjacencyArchive, EdgeList, artifact::InvalidAdjacencyFile};
use crate::{
    file::{
        WriteInto as _,
        sprs::{read::SprsFile, write::write_matrix},
    },
    identity::{EdgeRowId, NodeRowId},
    integrity::{Sha256, Writer},
};

/// Recreates a per-process scratch directory for the named case.
///
/// # Panics
///
/// Panics if the system temporary path is not UTF-8 or directory creation fails.
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

/// The five-node fixture with a parallel pair, a self-loop, and a zero-degree node.
///
/// Edge row 0 and edge row 3 are both `0 → 1` (parallel). Edge row 1 is `2 → 3` and edge row 2 is
/// the self-loop `3 → 3`. Node row 4 touches nothing.
const ENDPOINTS: [[NodeRowId; 2]; 4] = [
    [NodeRowId::new(0), NodeRowId::new(1)],
    [NodeRowId::new(2), NodeRowId::new(3)],
    [NodeRowId::new(3), NodeRowId::new(3)],
    [NodeRowId::new(0), NodeRowId::new(1)],
];
/// Node row count of the endpoint fixture.
const ROWS: usize = 5;

/// Writes `adjacency` to `name` under `dir` and reopens it as a validated mapped archive.
///
/// # Panics
///
/// Panics if file creation, writing, opening, or adjacency validation fails.
fn mapped(dir: &Utf8PathBuf, name: &str, adjacency: &Adjacency) -> AdjacencyArchive {
    let path = dir.join(name);
    let mut file = fs::File::create(&path).expect("the fixture file should create");
    adjacency
        .write_into(&mut file)
        .expect("the adjacency should write");
    drop(file);

    AdjacencyArchive::new(SprsFile::open(&path).expect("the fixture file should open"))
        .expect("the fixture adjacency should validate")
}

/// Collects an in-domain edge list as row numbers.
///
/// # Panics
///
/// Panics if `edges` is [`None`].
fn list(edges: Option<EdgeList<'_>>) -> Vec<u64> {
    edges
        .expect("the queried node row is in domain")
        .iter()
        .map(EdgeRowId::as_u64)
        .collect()
}

#[test]
fn build_matches_the_hand_computed_lists() {
    let dir = scratch("hand-computed");
    let adjacency = Adjacency::build(ROWS, &ENDPOINTS);
    let mapped = mapped(&dir, "fixture.sprs", &adjacency);

    assert_eq!(mapped.rows(), ROWS as u64);
    assert_eq!(mapped.edges(), ENDPOINTS.len() as u64);

    // the parallel pair leaves node 0 as edges 0 and 3.
    assert_eq!(list(mapped.outgoing(NodeRowId::new(0))), [0, 3]);
    assert_eq!(list(mapped.outgoing(NodeRowId::new(1))), [] as [u64; 0]);
    assert_eq!(list(mapped.outgoing(NodeRowId::new(2))), [1]);
    assert_eq!(list(mapped.outgoing(NodeRowId::new(3))), [2]);
    assert_eq!(list(mapped.outgoing(NodeRowId::new(4))), [] as [u64; 0]);

    // the self-loop occupies both directions at node 3.
    assert_eq!(list(mapped.incoming(NodeRowId::new(1))), [0, 3]);
    assert_eq!(list(mapped.incoming(NodeRowId::new(3))), [1, 2]);

    assert_eq!(list(mapped.incoming(NodeRowId::new(4))), [] as [u64; 0]);

    assert!(mapped.outgoing(NodeRowId::new(5)).is_none());
    assert!(mapped.incoming(NodeRowId::new(5)).is_none());
}

#[test]
fn edgeless_corpus_builds_empty_lists() {
    let dir = scratch("edgeless");
    let adjacency = Adjacency::build(2, &[]);
    let mapped = mapped(&dir, "edgeless.sprs", &adjacency);

    assert_eq!(mapped.rows(), 2);
    assert_eq!(mapped.edges(), 0);
    assert_eq!(list(mapped.outgoing(NodeRowId::new(0))), [] as [u64; 0]);
    assert_eq!(list(mapped.incoming(NodeRowId::new(0))), [] as [u64; 0]);
}

/// Writes a hand-built structure-only matrix and opens it as a mapped adjacency.
///
/// # Errors
///
/// Returns [`InvalidAdjacencyFile`] if the matrix violates the adjacency list contract.
///
/// # Panics
///
/// Panics if the compressed matrix is invalid or file creation, writing, or mapping fails.
fn open_structure(
    dir: &Utf8PathBuf,
    name: &str,
    shape: (usize, usize),
    fenceposts: &[u64],
    values: &[u64],
) -> Result<AdjacencyArchive, InvalidAdjacencyFile> {
    let path = dir.join(name);
    let mut writer = Writer {
        accumulator: Sha256::new(),
        writer: fs::File::create(&path).expect("the raw file should create"),
    };
    let units = vec![(); values.len()];
    let matrix = CsMatViewI::<'_, (), u64, u64>::try_new(shape, fenceposts, values, &units)
        .expect("the hand-built structure is a valid compressed matrix");
    write_matrix(&matrix, &mut writer).expect("the raw matrix should write");

    AdjacencyArchive::new(SprsFile::open(&path).expect("the raw file should open"))
}

#[test]
fn violated_list_invariants_are_rejected() {
    let dir = scratch("violations");

    assert_matches!(
        open_structure(&dir, "odd.sprs", (1, 1), &[0, 0], &[]),
        Err(InvalidAdjacencyFile::OddRows { rows: 1 }),
    );

    assert_matches!(
        open_structure(&dir, "slots.sprs", (2, 1), &[0, 1, 1], &[0]),
        Err(InvalidAdjacencyFile::Slots { entries: 1 }),
    );

    assert_matches!(
        open_structure(&dir, "bound.sprs", (2, 5), &[0, 1, 2], &[0, 0]),
        Err(InvalidAdjacencyFile::Bound {
            columns: 5,
            edges: 1,
        }),
    );

    // both outgoing runs hold edge 0, although each run alone is valid.
    assert_matches!(
        open_structure(&dir, "duplicate.sprs", (4, 1), &[0, 1, 1, 2, 2], &[0, 0]),
        Err(InvalidAdjacencyFile::Duplicate { edge }) if edge == EdgeRowId::MIN
    );

    let path = dir.join("valued.sprs");
    let mut writer = Writer {
        accumulator: Sha256::new(),
        writer: fs::File::create(&path).expect("the valued file should create"),
    };
    let valued = CsMatViewI::<'_, f32, u64, u64>::try_new((2, 1), &[0, 1, 2], &[0, 0], &[1.0, 2.0])
        .expect("the valued matrix is a valid compressed matrix");
    write_matrix(&valued, &mut writer).expect("the valued matrix should write");
    assert_matches!(
        AdjacencyArchive::new(SprsFile::open(&path).expect("the valued file should open")),
        Err(InvalidAdjacencyFile::Matrix(_)),
    );
}

/// A nonzero first fencepost preserves sprs' relative-offset structure.
///
/// Adding the same offset to every post preserves every relative run and the entry count. Adjacency
/// lookups use raw posts as array indices and therefore require the first post to be zero.
#[test]
#[expect(
    clippy::little_endian_bytes,
    reason = "the fixture edits the format's little-endian fencepost region"
)]
fn shifted_fencepost_column_is_rejected() {
    let dir = scratch("shifted");
    let path = dir.join("shifted.sprs");

    let adjacency = Adjacency::build(2, &[[NodeRowId::new(0), NodeRowId::new(1)]]);
    let mut file = fs::File::create(&path).expect("the fixture file should create");
    adjacency
        .write_into(&mut file)
        .expect("the adjacency should write");
    drop(file);

    // the eight-byte posts begin immediately after the 4096-byte header.
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

    assert_matches!(
        AdjacencyArchive::new(SprsFile::open(&path).expect("the shifted file should open")),
        Err(InvalidAdjacencyFile::Start),
    );
}

#[test]
fn build_is_independent_of_the_endpoint_values_within_a_row() {
    // permuting endpoints changes edge row identities. Runs still sort by the new row order.
    let permuted: [[NodeRowId; 2]; 4] = [ENDPOINTS[3], ENDPOINTS[1], ENDPOINTS[0], ENDPOINTS[2]];
    let dir = scratch("permuted");
    let adjacency = Adjacency::build(ROWS, &permuted);
    let mapped = mapped(&dir, "permuted.sprs", &adjacency);

    assert_eq!(list(mapped.outgoing(NodeRowId::new(0))), [0, 2]);
    assert_eq!(list(mapped.outgoing(NodeRowId::new(3))), [3]);
    assert_eq!(list(mapped.incoming(NodeRowId::new(3))), [1, 3]);
}

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

mod miri {
    use crate::{file::WriteInto as _, identity::NodeRowId, salt::adjacency::Adjacency};

    #[test]
    fn writing_to_memory_conjures_the_unit_region() {
        let endpoints = [
            [NodeRowId::new(0), NodeRowId::new(1)],
            [NodeRowId::new(1), NodeRowId::new(2)],
            [NodeRowId::new(0), NodeRowId::new(2)],
        ];
        let adjacency = Adjacency::build(3, &endpoints);

        let mut bytes = Vec::new();
        let _digest = adjacency
            .write_into(&mut bytes)
            .expect("an in-memory write cannot fail");

        assert!(!bytes.is_empty());
    }
}
