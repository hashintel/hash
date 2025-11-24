//! This file is derived from the Rust compiler source code.
//! Source: <https://github.com/rust-lang/rust/blob/42ec52babac2cbf2bb2b9d794f980cbcb3ebe413/compiler/rustc_data_structures/src/graph/tests.rs>
//!
//! Originally dual-licensed under either of:
//!   - Apache License, Version 2.0 (see LICENSE-APACHE.md or <https://www.apache.org/licenses/LICENSE-2.0>)
//!   - MIT license (see LICENSE-MIT.md or <https://opensource.org/licenses/MIT>)
//!
//! You may use, copy, modify, and distribute this file under the terms of the
//! GNU Affero General Public License, Version 3.0, as part of this project,
//! provided that all original notices are preserved.
//!
//! Local adaptations relative to the pinned upstream:
//! API:
//! - Use `Id` in place of `Idx`.
//!   - `index` -> `as_usize`
//!   - `new` -> `from_usize`
use crate::graph::{NodeId, algorithms::dominators::dominators, tests::TestGraph};

macro_rules! n {
    ($expr:expr) => {
        NodeId::new($expr)
    };
}

#[test]
fn diamond() {
    let graph = TestGraph::new(&[(0, 1), (0, 2), (1, 3), (2, 3)]);

    let d = dominators(&graph, n!(0));
    assert_eq!(d.immediate_dominator(n!(0)), None);
    assert_eq!(d.immediate_dominator(n!(1)), Some(n!(0)));
    assert_eq!(d.immediate_dominator(n!(2)), Some(n!(0)));
    assert_eq!(d.immediate_dominator(n!(3)), Some(n!(0)));
}

#[test]
fn paper() {
    // example from the paper:
    let graph = TestGraph::new(&[
        (6, 5),
        (6, 4),
        (5, 1),
        (4, 2),
        (4, 3),
        (1, 2),
        (2, 3),
        (3, 2),
        (2, 1),
    ]);

    let d = dominators(&graph, n!(6));
    assert_eq!(d.immediate_dominator(n!(0)), None); // <-- note that 0 is not in graph
    assert_eq!(d.immediate_dominator(n!(1)), Some(n!(6)));
    assert_eq!(d.immediate_dominator(n!(2)), Some(n!(6)));
    assert_eq!(d.immediate_dominator(n!(3)), Some(n!(6)));
    assert_eq!(d.immediate_dominator(n!(4)), Some(n!(6)));
    assert_eq!(d.immediate_dominator(n!(5)), Some(n!(6)));
    assert_eq!(d.immediate_dominator(n!(6)), None);
}

#[test]
fn paper_slt() {
    // example from the paper:
    let graph = TestGraph::new(&[
        (1, 2),
        (1, 3),
        (2, 3),
        (2, 7),
        (3, 4),
        (3, 6),
        (4, 5),
        (5, 4),
        (6, 7),
        (7, 8),
        (8, 5),
    ]);

    dominators(&graph, n!(1));
}

#[test]
fn immediate_dominator() {
    let graph = TestGraph::new(&[(1, 2), (2, 3)]);
    let d = dominators(&graph, n!(1));
    assert_eq!(d.immediate_dominator(n!(0)), None);
    assert_eq!(d.immediate_dominator(n!(1)), None);
    assert_eq!(d.immediate_dominator(n!(2)), Some(n!(1)));
    assert_eq!(d.immediate_dominator(n!(3)), Some(n!(2)));
}

#[test]
fn transitive_dominator() {
    let graph = TestGraph::new(&[
        // First tree branch.
        (0, 1),
        (1, 2),
        (2, 3),
        (3, 4),
        // Second tree branch.
        (1, 5),
        (5, 6),
        // Third tree branch.
        (0, 7),
        // These links make 0 the dominator for 2 and 3.
        (7, 2),
        (5, 3),
    ]);

    let d = dominators(&graph, n!(0));
    assert_eq!(d.immediate_dominator(n!(2)), Some(n!(0)));
    assert_eq!(d.immediate_dominator(n!(3)), Some(n!(0))); // This used to return Some(1).
}
