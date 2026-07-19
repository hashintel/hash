use std::fs;

use camino::Utf8PathBuf;

use super::{Adjacency, InvalidAdjacencyFile, MappedAdjacency};
use crate::{
    dataset::{EdgeRowId, NodeRowId},
    file::adjacency::{EdgeWidth, read::AdjacencyFile, write::write_lists},
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

    MappedAdjacency::new(AdjacencyFile::open(&path).expect("the fixture file should open"))
        .expect("the fixture adjacency should validate")
}

fn list(edges: Option<super::EdgeList<'_>>) -> Vec<u64> {
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
    let mapped = mapped(&dir, "fixture.adjc", &adjacency);

    assert_eq!(mapped.rows(), ROWS as u64);
    assert_eq!(mapped.edges(), ENDPOINTS.len() as u64);

    // Outgoing lists per node row, ascending: the parallel pair leaves
    // node 0, the self-loop leaves and arrives at node 3.
    assert_eq!(list(mapped.outgoing(NodeRowId::new(0))), [0, 3]);
    assert_eq!(list(mapped.outgoing(NodeRowId::new(1))), [] as [u64; 0]);
    assert_eq!(list(mapped.outgoing(NodeRowId::new(2))), [1]);
    assert_eq!(list(mapped.outgoing(NodeRowId::new(3))), [2]);
    assert_eq!(list(mapped.outgoing(NodeRowId::new(4))), [] as [u64; 0]);

    assert_eq!(list(mapped.incoming(NodeRowId::new(0))), [] as [u64; 0]);
    assert_eq!(list(mapped.incoming(NodeRowId::new(1))), [0, 3]);
    assert_eq!(list(mapped.incoming(NodeRowId::new(2))), [] as [u64; 0]);
    assert_eq!(list(mapped.incoming(NodeRowId::new(3))), [1, 2]);
    assert_eq!(list(mapped.incoming(NodeRowId::new(4))), [] as [u64; 0]);

    // The incident slice is the contiguous outgoing-then-incoming
    // concatenation; the self-loop appears in both runs of node 3.
    assert_eq!(list(mapped.incident(NodeRowId::new(3))), [2, 1, 2]);
    assert_eq!(list(mapped.incident(NodeRowId::new(4))), [] as [u64; 0]);

    // Beyond the node domain there is no list.
    assert!(mapped.outgoing(NodeRowId::new(ROWS as u64)).is_none());
    assert!(mapped.incoming(NodeRowId::new(u64::MAX)).is_none());
    assert!(mapped.incident(NodeRowId::new(ROWS as u64)).is_none());
}

#[test]
fn the_build_is_independent_of_the_endpoint_values_within_a_row() {
    // A permuted edge order is a different corpus (edge rows are
    // positional), but every list still comes out strictly ascending.
    let permuted: [[u64; 2]; 4] = [ENDPOINTS[3], ENDPOINTS[1], ENDPOINTS[0], ENDPOINTS[2]];
    let dir = scratch("permuted");
    let adjacency = Adjacency::build(ROWS, &permuted);
    let mapped = mapped(&dir, "permuted.adjc", &adjacency);

    assert_eq!(list(mapped.outgoing(NodeRowId::new(0))), [0, 2]);
    assert_eq!(list(mapped.incoming(NodeRowId::new(3))), [1, 3]);
    assert_eq!(list(mapped.incident(NodeRowId::new(3))), [3, 1, 3]);
}

#[test]
fn contains_agrees_with_a_linear_scan() {
    let dir = scratch("contains");
    let adjacency = Adjacency::build(ROWS, &ENDPOINTS);
    let mapped = mapped(&dir, "contains.adjc", &adjacency);

    // Every (node, direction, edge) answer matches the linear scan
    // over the same run, misses between and beyond hits included.
    for node in 0..ROWS as u64 {
        let node = NodeRowId::new(node);
        for list in [
            mapped.outgoing(node).expect("the node row is in domain"),
            mapped.incoming(node).expect("the node row is in domain"),
        ] {
            for edge in 0..=ENDPOINTS.len() as u64 {
                let edge = EdgeRowId::new(edge);
                assert_eq!(
                    list.contains(edge),
                    list.iter().any(|held| held.get() == edge.get()),
                    "node {node:?}, edge {edge:?}",
                );
            }
        }
    }

    // The gapped outgoing run of node 0 answers both boundaries: it
    // holds edges 0 and 3 and misses the rows between.
    let outgoing = mapped
        .outgoing(NodeRowId::new(0))
        .expect("node row 0 is in domain");
    assert!(outgoing.contains(EdgeRowId::new(0)));
    assert!(!outgoing.contains(EdgeRowId::new(1)));
    assert!(!outgoing.contains(EdgeRowId::new(2)));
    assert!(outgoing.contains(EdgeRowId::new(3)));
    assert!(!outgoing.contains(EdgeRowId::new(4)));
}

#[test]
fn an_edgeless_corpus_builds_empty_lists() {
    let dir = scratch("edgeless");
    let adjacency = Adjacency::build(2, &[]);
    let mapped = mapped(&dir, "edgeless.adjc", &adjacency);

    assert_eq!(mapped.rows(), 2);
    assert_eq!(mapped.edges(), 0);
    assert!(
        mapped
            .incident(NodeRowId::new(0))
            .expect("row 0 is in domain")
            .is_empty()
    );
}

/// Writes raw regions and opens them as a mapped adjacency.
fn open_raw(
    dir: &Utf8PathBuf,
    name: &str,
    fenceposts: &[u64],
    values: &[u64],
) -> Result<MappedAdjacency, InvalidAdjacencyFile> {
    let path = dir.join(name);
    let mut file = fs::File::create(&path).expect("the raw file should create");
    write_lists(fenceposts, values, EdgeWidth::U64, &mut file).expect("the raw lists should write");
    drop(file);

    MappedAdjacency::new(AdjacencyFile::open(&path).expect("the raw file should open"))
}

#[test]
fn violated_list_invariants_are_rejected() {
    let dir = scratch("invariants");

    // One node, one self-loop edge: the minimal valid shape.
    let _valid = open_raw(&dir, "valid.adjc", &[0, 1, 2], &[0, 0])
        .expect("the minimal valid shape validates");

    // The first fencepost must open the value array.
    assert_eq!(
        open_raw(&dir, "start.adjc", &[1, 1, 2], &[0, 0])
            .expect_err("a nonzero opening fencepost is invalid"),
        InvalidAdjacencyFile::Start,
    );

    // Fenceposts must not step backwards.
    assert_eq!(
        open_raw(&dir, "unordered.adjc", &[0, 2, 1, 1, 2], &[0, 0])
            .expect_err("a backwards fencepost is invalid"),
        InvalidAdjacencyFile::Unordered { position: 2 },
    );

    // A value must stay below the edge count.
    assert_eq!(
        open_raw(&dir, "domain.adjc", &[0, 1, 2], &[0, 1])
            .expect_err("an out-of-domain edge row is invalid"),
        InvalidAdjacencyFile::Domain { slot: 1 },
    );

    // Runs must ascend strictly.
    assert_eq!(
        open_raw(&dir, "run-order.adjc", &[0, 2, 4], &[1, 0, 0, 1])
            .expect_err("an unsorted run is invalid"),
        InvalidAdjacencyFile::RunOrder { run: 0 },
    );

    // An edge must not occupy two slots of one direction, even across
    // different nodes' runs.
    assert_eq!(
        open_raw(&dir, "duplicate.adjc", &[0, 1, 1, 2, 2], &[0, 0])
            .expect_err("a doubled outgoing slot is invalid"),
        InvalidAdjacencyFile::Duplicate { edge: 0 },
    );
}
