use hashql_core::id::Id as _;

use super::subtract;
use crate::{identity::NodeRowId, morton::Depth, serve2::schedule::DeliveredNodes};

fn delivered(rows: &[u64], runs: &[usize]) -> DeliveredNodes {
    DeliveredNodes {
        rows: rows.iter().copied().map(NodeRowId::new).collect(),
        first_bucket: Depth::MIN,
        runs: runs.to_vec(),
    }
}

fn nodes(rows: &[u64]) -> Vec<NodeRowId> {
    rows.iter().copied().map(NodeRowId::new).collect()
}

#[track_caller]
fn assert_partitioned(delivered: &DeliveredNodes) {
    assert_eq!(
        delivered.runs.iter().sum::<usize>(),
        delivered.rows.len(),
        "the runs should re-sum to the delivered count"
    );
}

/// Each withdrawn row leaves the delivery and debits the run that owned it.
#[test]
fn subtract_run_decrement() {
    let mut delivery = delivered(&[4, 5, 6, 20, 21], &[2, 2, 1]);

    subtract(&mut delivery, |node| {
        node == NodeRowId::new(5) || node == NodeRowId::new(21)
    });

    assert_eq!(delivery.rows, nodes(&[4, 6, 20]));
    assert_eq!(
        delivery.runs,
        [1, 2, 0],
        "each withdrawal should debit its owning run"
    );
    assert_partitioned(&delivery);
}

/// Runs that were already empty keep their positional slots through the subtraction.
#[test]
fn subtract_zero_length_runs() {
    let mut delivery = delivered(&[0, 4, 5, 6, 7, 8], &[1, 0, 3, 2]);

    subtract(&mut delivery, |node| {
        node == NodeRowId::new(0) || node == NodeRowId::new(8)
    });

    assert_eq!(delivery.rows, nodes(&[4, 5, 6, 7]));
    assert_eq!(
        delivery.runs,
        [0, 0, 3, 1],
        "zero-length runs should keep their slots"
    );
    assert_partitioned(&delivery);
}

/// Withdrawing the first and last row of a run leaves the interior intact.
#[test]
fn subtract_run_edges() {
    let mut delivery = delivered(&[3, 4, 5, 6, 7], &[5]);

    subtract(&mut delivery, |node| {
        node == NodeRowId::new(3) || node == NodeRowId::new(7)
    });

    assert_eq!(delivery.rows, nodes(&[4, 5, 6]));
    assert_eq!(delivery.runs, [3]);
    assert_partitioned(&delivery);
}

/// A fully withdrawn delivery keeps every run slot at zero length.
#[test]
fn subtract_all() {
    let mut delivery = delivered(&[2, 3, 4, 9], &[3, 1]);

    subtract(&mut delivery, |_| true);

    assert!(
        delivery.rows.is_empty(),
        "no row should survive a full withdrawal"
    );
    assert_eq!(delivery.runs, [0, 0], "the run slots should survive");
    assert_partitioned(&delivery);
}

/// A predicate withdrawing nothing leaves rows and runs untouched.
#[test]
fn subtract_none() {
    let mut delivery = delivered(&[1, 2, 3], &[1, 2]);

    subtract(&mut delivery, |_| false);

    assert_eq!(delivery.rows, nodes(&[1, 2, 3]));
    assert_eq!(delivery.runs, [1, 2]);
    assert_partitioned(&delivery);
}

/// An empty delivery passes through with its run slots intact.
#[test]
fn subtract_empty() {
    let mut delivery = delivered(&[], &[0, 0]);

    subtract(&mut delivery, |_| true);

    assert!(delivery.rows.is_empty(), "no row should appear");
    assert_eq!(delivery.runs, [0, 0]);
    assert_partitioned(&delivery);
}
