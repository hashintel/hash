#![cfg_attr(nightly, feature(provide_any))]
#![cfg_attr(all(nightly, feature = "std"), feature(error_generic_member_access))]

extern crate alloc;
extern crate core;

use core::fmt::{Display, Formatter, Write};

mod common;
use error_stack::{report, Context, Report};

#[derive(Debug)]
struct Char(char);

impl Display for Char {
    fn fmt(&self, f: &mut Formatter<'_>) -> core::fmt::Result {
        f.write_char(self.0)
    }
}

impl Context for Char {}

/// Builds the following tree:
///
/// ```text
///     A     G
///    / \    |
///   B   E   H
///  / \  |
/// C   D F
/// ```
///
/// which will result in this report:
///
/// ```text
/// A
/// ╰┬▶ B
///  │  ╰┬▶ C
///  │   ╰▶ D
///  ╰▶ E
///     ╰─▶ F
/// G
/// ╰─▶ H
/// ```
#[allow(clippy::many_single_char_names)]
fn build() -> Report<Char> {
    let mut c = report!(Char('C'));
    let d = report!(Char('D'));

    c.extend_one(d);
    let mut b = c.change_context(Char('B'));

    let f = report!(Char('F'));
    let e = f.change_context(Char('E'));

    b.extend_one(e);

    let mut a = b.change_context(Char('A'));

    let h = report!(Char('H'));
    let g = h.change_context(Char('G'));

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

    assert_eq!(
        report
            .frames()
            .filter_map(|frame| frame.downcast_ref::<Char>().map(|c| c.0))
            .collect::<Vec<_>>(),
        ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
    );
}

#[test]
fn iter_mut() {
    let mut report = build();

    assert_eq!(
        report
            .frames_mut()
            .filter_map(|frame| frame.downcast_ref::<Char>().map(|c| c.0))
            .collect::<Vec<_>>(),
        ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
    );
}
