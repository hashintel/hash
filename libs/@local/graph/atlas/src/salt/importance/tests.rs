use std::fs;

use camino::Utf8PathBuf;

use super::{ConstantImportance, DegreeImportance, ImportanceSignal as _, RankingConfig};
use crate::{
    file::{WriteInto as _, sprs::read::SprsFile},
    salt::adjacency::{Adjacency, AdjacencyArchive},
};

fn scratch(name: &str) -> Utf8PathBuf {
    let dir = Utf8PathBuf::from_path_buf(std::env::temp_dir())
        .expect("the temp directory is UTF-8")
        .join(format!(
            "hash-graph-atlas-importance-{}-{name}",
            std::process::id()
        ));
    let _: Result<(), std::io::Error> = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).expect("the scratch directory should create");
    dir
}

/// The five-node fixture.
///
/// A parallel pair `0 → 1`, one `2 → 3`, a self-loop at 3, and node 4 untouched.
fn mapped_fixture(name: &str) -> AdjacencyArchive {
    let endpoints: [[u64; 2]; 4] = [[0, 1], [2, 3], [3, 3], [0, 1]];
    let path = scratch(name).join("fixture.sprs");

    let adjacency = Adjacency::build(5, &endpoints);
    let mut file = fs::File::create(&path).expect("the fixture file should create");
    adjacency
        .write_into(&mut file)
        .expect("the adjacency should write");
    drop(file);

    AdjacencyArchive::new(SprsFile::open(&path).expect("the fixture file should open"))
        .expect("the fixture adjacency should validate")
}

#[test]
fn default_signal_is_incident_degree() {
    assert_eq!(RankingConfig::default(), RankingConfig::IncidentDegree);
}

#[test]
fn constant_signal_weighs_every_row_equally() {
    let column = ConstantImportance.derive(4);
    assert_eq!(column, [0.0; 4]);
}

#[test]
fn degrees_match_a_hand_count_of_incident_slots() {
    let adjacency = mapped_fixture("hand-count");

    // By hand over the fixture: node 0 sends the parallel pair, node 1
    // receives it, node 2 sends once, node 3 receives twice and holds
    // both slots of its self-loop, node 4 touches nothing.
    let column = DegreeImportance::new(&adjacency).derive(5);
    assert_eq!(column, [2.0, 2.0, 1.0, 3.0, 0.0]);
}

#[test]
#[should_panic(expected = "the adjacency spans the generation's node rows")]
fn row_domain_mismatch_is_a_producer_bug() {
    let adjacency = mapped_fixture("mismatch");

    let _column = DegreeImportance::new(&adjacency).derive(4);
}
