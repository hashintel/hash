use hashql_core::id::IdVec;
use zerocopy::{LE, U64};

use super::{Runs, RunsBuilder, RunsError, RunsView};
use crate::identity::NodeRowId;

fn node(row: u64) -> NodeRowId {
    NodeRowId::new(row)
}

/// Builds a fencepost column at its persisted little-endian width.
fn le_posts(raw: &[u64]) -> IdVec<NodeRowId, U64<LE>> {
    IdVec::from_raw(raw.iter().copied().map(U64::new).collect())
}

#[test]
fn from_parts_accepts_a_valid_structure() {
    let runs =
        Runs::<NodeRowId, u32>::from_parts(le_posts(&[0, 2, 2, 5]), vec![10, 11, 20, 21, 22])
            .expect("anchored, non-decreasing fenceposts closing at the item count are valid");

    assert_eq!(runs.runs(), 3);
    assert_eq!(runs.items(), [10, 11, 20, 21, 22]);
    assert_eq!(runs.run(node(0)), [10, 11]);
    assert_eq!(runs.run(node(1)), [0_u32; 0]);
    assert_eq!(runs.run(node(2)), [20, 21, 22]);
    assert_eq!(runs.span(node(2)), 2..5);
    assert_eq!(
        runs.iter().map(|(_, value)| value).collect::<Vec<_>>(),
        [&[10_u32, 11] as &[_], &[], &[20, 21, 22]]
    );
}

#[test]
fn from_parts_accepts_an_empty_domain() {
    let runs = Runs::<NodeRowId, u32>::from_parts(le_posts(&[0]), vec![])
        .expect("a lone zero anchor closes an empty structure");

    assert_eq!(runs.runs(), 0);
    assert!(runs.items().is_empty());
    assert_eq!(runs.iter().next(), None);
}

#[test]
fn from_parts_rejects_each_broken_fencepost_rule() {
    assert_eq!(
        Runs::<NodeRowId, u32>::from_parts(le_posts(&[]), vec![])
            .expect_err("an empty fencepost column is invalid"),
        RunsError::Missing
    );
    assert_eq!(
        Runs::<NodeRowId, u32>::from_parts(le_posts(&[1, 2]), vec![0, 0])
            .expect_err("a nonzero anchor is invalid"),
        RunsError::Anchor
    );
    assert_eq!(
        Runs::<NodeRowId, u32>::from_parts(le_posts(&[0, 3, 2]), vec![0, 0, 0])
            .expect_err("a decreasing fencepost is invalid"),
        RunsError::Order { index: 2 }
    );
    assert_eq!(
        Runs::<NodeRowId, u32>::from_parts(le_posts(&[0, 2]), vec![0, 0, 0])
            .expect_err("a fencepost column that closes short of the items is invalid"),
        RunsError::Close { post: 2, items: 3 }
    );
}

#[test]
fn view_wraps_mapped_columns() {
    let posts = [0_u64, 2, 2, 5].map(U64::<LE>::new);
    let items = [10_u32, 11, 20, 21, 22];
    let view = RunsView::<NodeRowId, u32>::from_parts(&posts, &items)
        .expect("anchored, non-decreasing fenceposts closing at the item count are valid");

    assert_eq!(view.runs(), 3);
    assert_eq!(view.items(), items);
    assert_eq!(view.run(node(0)), [10, 11]);
    assert_eq!(view.run(node(1)), [0_u32; 0]);
    assert_eq!(view.run(node(2)), [20, 21, 22]);
    assert_eq!(
        view.iter().map(|(_, value)| value).collect::<Vec<_>>(),
        [&[10_u32, 11] as &[_], &[], &[20, 21, 22]]
    );
}

#[test]
fn view_from_parts_rejects_each_broken_fencepost_rule() {
    let items = [0_u32, 0, 0];
    assert_eq!(
        RunsView::<NodeRowId, u32>::from_parts(&[], &items)
            .expect_err("an empty fencepost column is invalid"),
        RunsError::Missing
    );
    assert_eq!(
        RunsView::<NodeRowId, u32>::from_parts(&[1_u64, 3].map(U64::<LE>::new), &items)
            .expect_err("a nonzero anchor is invalid"),
        RunsError::Anchor
    );
    assert_eq!(
        RunsView::<NodeRowId, u32>::from_parts(&[0_u64, 3, 2].map(U64::<LE>::new), &items)
            .expect_err("a decreasing fencepost is invalid"),
        RunsError::Order { index: 2 }
    );
    assert_eq!(
        RunsView::<NodeRowId, u32>::from_parts(&[0_u64, 2].map(U64::<LE>::new), &items)
            .expect_err("a fencepost column that closes short of the items is invalid"),
        RunsError::Close { post: 2, items: 3 }
    );
}

#[test]
fn view_runs_outlive_the_view_value() {
    let posts = [0_u64, 2, 2, 5].map(U64::<LE>::new);
    let items = [10_u32, 11, 20, 21, 22];

    // `run` borrows for the mapping's lifetime, so the run survives the view that served it.
    let run = {
        let view = RunsView::<NodeRowId, u32>::from_parts_unchecked(&posts, &items);
        view.run(node(2))
    };
    assert_eq!(run, [20, 21, 22]);
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
    let validated = Runs::from_parts(le_posts(&[0, 2, 2, 3]), vec![7, 8, 9])
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
