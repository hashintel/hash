use super::{ConstantImportance, DegreeImportance, ImportanceSignal as _, RankingConfig};
use crate::{identity::NodeRowId, salt::adjacency::Adjacency};

/// The five-node fixture.
///
/// A parallel pair `0 → 1`, one `2 → 3`, a self-loop at 3, and node 4 untouched.
fn fixture() -> Adjacency {
    let endpoints: [[NodeRowId; 2]; 4] = [
        [NodeRowId::new(0), NodeRowId::new(1)],
        [NodeRowId::new(2), NodeRowId::new(3)],
        [NodeRowId::new(3), NodeRowId::new(3)],
        [NodeRowId::new(0), NodeRowId::new(1)],
    ];

    Adjacency::build(5, &endpoints)
}

#[test]
fn default_incident_degree() {
    assert_eq!(RankingConfig::default(), RankingConfig::IncidentDegree);
}

#[test]
fn constant_column() {
    let column = ConstantImportance.derive(4);
    assert_eq!(*column.as_raw(), [0.0; 4]);
}

#[test]
fn incident_degree_hand_count() {
    let adjacency = fixture();

    // A hand count over the fixture gives these degrees. Node 0 sends the parallel pair, node 1
    // receives it, node 2 sends once, node 3 receives twice and holds both slots of its self-loop,
    // and node 4 touches nothing.
    let column = DegreeImportance::new(&adjacency).derive(5);
    assert_eq!(*column.as_raw(), [2.0, 2.0, 1.0, 3.0, 0.0]);
}

#[test]
#[should_panic(expected = "the adjacency spans the generation's node rows")]
fn row_domain_mismatch() {
    let adjacency = fixture();

    let _column = DegreeImportance::new(&adjacency).derive(4);
}
