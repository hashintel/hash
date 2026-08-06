use sprs::errors::StructureErrorKind;

use super::{Runs, RunsBuilder, RunsError};
use crate::identity::NodeRowId;

fn node(row: u64) -> NodeRowId {
    NodeRowId::new(row)
}

#[test]
fn from_parts_accepts_a_valid_structure() {
    let runs = Runs::<NodeRowId, u32>::from_parts(vec![0, 2, 2, 5], vec![10, 11, 20, 21, 22])
        .expect("anchored, non-decreasing fenceposts closing at the item count are valid");

    assert_eq!(runs.runs(), 3);
    assert_eq!(runs.items(), [10, 11, 20, 21, 22]);
    assert_eq!(runs.run(node(0)), [10, 11]);
    assert_eq!(runs.run(node(1)), [0_u32; 0]);
    assert_eq!(runs.run(node(2)), [20, 21, 22]);
    assert_eq!(runs.span(node(2)), 2..5);
    assert_eq!(
        runs.iter().map(|(key, value)| value).collect::<Vec<_>>(),
        [&[10_u32, 11] as &[_], &[], &[20, 21, 22]]
    );
}

#[test]
fn from_parts_accepts_an_empty_domain() {
    let runs = Runs::<NodeRowId, u32>::from_parts(vec![0], vec![])
        .expect("a lone zero anchor closes an empty structure");

    assert_eq!(runs.runs(), 0);
    assert!(runs.items().is_empty());
    assert_eq!(runs.iter().next(), None);
}

#[test]
fn from_parts_rejects_each_broken_fencepost_rule() {
    assert_eq!(
        Runs::<NodeRowId, u32>::from_parts(vec![], vec![])
            .expect_err("an empty fencepost column is invalid"),
        RunsError::Missing
    );
    assert_eq!(
        Runs::<NodeRowId, u32>::from_parts(vec![1, 2], vec![0, 0])
            .expect_err("a nonzero anchor is invalid"),
        RunsError::Anchor
    );
    assert_eq!(
        Runs::<NodeRowId, u32>::from_parts(vec![0, 3, 2], vec![0, 0, 0])
            .expect_err("a decreasing fencepost is invalid"),
        RunsError::Order { index: 2 }
    );
    assert_eq!(
        Runs::<NodeRowId, u32>::from_parts(vec![0, 2], vec![0, 0, 0])
            .expect_err("a fencepost column that closes short of the items is invalid"),
        RunsError::Close { post: 2, items: 3 }
    );
}

#[test]
fn from_pairs_groups_pairs_by_key_and_keeps_arrival_order() {
    let pairs = [(node(2), 7_u32), (node(0), 3), (node(2), 9), (node(0), 4)];
    let runs = Runs::from_pairs(4, pairs.into_iter());

    assert_eq!(runs.runs(), 4);
    assert_eq!(runs.run(node(0)), [3, 4]);
    assert_eq!(runs.run(node(1)), [0_u32; 0]);
    assert_eq!(runs.run(node(2)), [7, 9]);
    assert_eq!(runs.run(node(3)), [0_u32; 0]);
    assert_eq!(runs.items(), [3, 4, 7, 9]);
}

#[test]
fn from_pairs_accepts_an_empty_domain() {
    let runs = Runs::<NodeRowId, u32>::from_pairs(0, core::iter::empty());

    assert_eq!(runs.runs(), 0);
    assert!(runs.items().is_empty());
}

#[test]
#[should_panic(expected = "every pair names a key inside the domain")]
fn from_pairs_rejects_a_key_outside_the_domain() {
    let _runs = Runs::from_pairs(2, [(node(2), 1_u32)].into_iter());
}

/// An iterator whose clone yields one extra pair, breaking the repeatability
/// the counting sort relies on.
struct GrowingPairs {
    remaining: usize,
}

impl Iterator for GrowingPairs {
    type Item = (NodeRowId, u32);

    fn next(&mut self) -> Option<Self::Item> {
        self.remaining = self.remaining.checked_sub(1)?;
        Some((node(0), 0))
    }
}

impl Clone for GrowingPairs {
    fn clone(&self) -> Self {
        Self {
            remaining: self.remaining + 1,
        }
    }
}

#[test]
#[should_panic(expected = "the placement pass replays the counting pass's pairs")]
fn from_pairs_rejects_a_clone_that_repeats_a_different_sequence() {
    let _runs = Runs::from_pairs(1, GrowingPairs { remaining: 1 });
}

#[test]
fn builder_appends_runs_in_key_order_and_reports_each_key() {
    let mut builder = RunsBuilder::<NodeRowId, u32>::with_capacity(3, 3);
    assert_eq!(builder.push_run([7, 8]), node(0));
    assert_eq!(builder.push_run([]), node(1));
    assert_eq!(builder.push_run([9]), node(2));

    let built = builder.finish();
    let validated = Runs::from_parts(vec![0, 2, 2, 3], vec![7, 8, 9])
        .expect("the builder's columns satisfy the fencepost rules");
    assert_eq!(built, validated);
}

#[test]
fn span_slices_a_parallel_column() {
    let pairs = [(node(1), 10_u32), (node(0), 20), (node(1), 30)];
    let runs = Runs::from_pairs(2, pairs.into_iter());
    // One weight per item, aligned with the items column `[20, 10, 30]`.
    let weights = [2.0_f32, 1.0, 3.0];

    assert_eq!(weights[runs.span(node(0))], [2.0]);
    assert_eq!(weights[runs.span(node(1))], [1.0, 3.0]);
}

#[test]
fn structure_view_borrows_ascending_runs() {
    let pairs = [(node(0), 2_u32), (node(0), 5), (node(2), 1)];
    let runs = Runs::from_pairs(3, pairs.into_iter());

    let view = runs
        .structure_view(6)
        .expect("strictly ascending runs below the column bound obey the matrix law");
    assert_eq!(view.rows(), 3);
    assert_eq!(view.cols(), 6);
    assert_eq!(view.nnz(), 3);

    let rows: Vec<Vec<u32>> = view
        .outer_iterator()
        .map(|row| row.indices().to_vec())
        .collect();
    assert_eq!(rows, [vec![2, 5], vec![], vec![1]]);
}

#[test]
fn structure_view_rejects_runs_outside_the_matrix_law() {
    let unsorted = Runs::from_pairs(1, [(node(0), 5_u32), (node(0), 2)].into_iter());
    assert_eq!(
        unsorted
            .structure_view(6)
            .expect_err("a descending run breaks the matrix law")
            .kind(),
        StructureErrorKind::Unsorted
    );

    let repeated = Runs::from_pairs(1, [(node(0), 2_u32), (node(0), 2)].into_iter());
    assert_eq!(
        repeated
            .structure_view(6)
            .expect_err("a repeated item breaks strict ascent")
            .kind(),
        StructureErrorKind::Unsorted
    );

    let out_of_bound = Runs::from_pairs(1, [(node(0), 6_u32)].into_iter());
    assert_eq!(
        out_of_bound
            .structure_view(6)
            .expect_err("an item at the column bound lies outside the matrix")
            .kind(),
        StructureErrorKind::OutOfRange
    );
}
