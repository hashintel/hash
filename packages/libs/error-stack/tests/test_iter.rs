#![cfg_attr(nightly, feature(provide_any))]
#![cfg_attr(all(nightly, feature = "std"), feature(backtrace))]

extern crate alloc;

use core::iter::zip;
use std::fmt::{Display, Formatter};

mod common;
use error_stack::{report, Context, Report};

#[derive(Debug)]
struct Root;

impl Display for Root {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        f.write_str("root")
    }
}

impl Context for Root {}

#[allow(clippy::many_single_char_names)]
fn build() -> Report<Root> {
    let mut d = report!(Root).attach('D');
    let e = report!(Root).attach('E');

    d.extend_one(e);
    let mut b = d.attach('B');

    let f = report!(Root).attach('F');
    let c = f.attach('C');

    b.extend_one(c);

    let mut a = b.attach('A');

    let h = report!(Root).attach('H');
    let g = h.attach('G');

    a.extend_one(g);
    a
}

/// Try to verify if the topological sorting is working, by trying to verify that
/// ```text
///     A     G
///    / \    |
///   B   C   H
///  / \  |
/// D   E F
/// ```
///
/// results in `ABDECFGH`
#[test]
fn iter() {
    let report = build();

    for (lhs, &rhs) in zip(
        report
            .frames()
            .filter_map(|frame| frame.downcast_ref::<char>())
            .copied(),
        ['A', 'B', 'D', 'E', 'C', 'F', 'G', 'H'].iter(),
    ) {
        assert_eq!(lhs, rhs);
    }
}

#[test]
fn iter_mut() {
    let mut report = build();

    for (lhs, &rhs) in zip(
        report
            .frames_mut()
            .filter_map(|frame| frame.downcast_ref::<char>())
            .copied(),
        ['A', 'B', 'D', 'E', 'C', 'F', 'G', 'H'].iter(),
    ) {
        assert_eq!(lhs, rhs);
    }
}
