#![cfg_attr(nightly, feature(error_generic_member_access))]

extern crate alloc;

use core::fmt::{Display, Formatter, Write};

mod common;
use error_stack::{report, Context, Report};

#[derive(Debug)]
struct Char(char);

impl Display for Char {
    fn fmt(&self, fmt: &mut Formatter<'_>) -> core::fmt::Result {
        fmt.write_char(self.0)
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
fn build() -> Report<[Char]> {
    let mut report_c = report!(Char('C')).into_multiple();
    let report_d = report!(Char('D'));

    report_c.push(report_d);
    let mut report_b = report_c.change_context(Char('B')).into_multiple();

    let report_f = report!(Char('F'));
    let report_e = report_f.change_context(Char('E'));

    report_b.push(report_e);

    let mut report_a = report_b.change_context(Char('A')).into_multiple();

    let report_h = report!(Char('H'));
    let report_g = report_h.change_context(Char('G'));

    report_a.push(report_g);
    report_a
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
            .filter_map(|frame| frame.downcast_ref::<Char>().map(|ch| ch.0))
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
            .filter_map(|frame| frame.downcast_ref::<Char>().map(|ch| ch.0))
            .collect::<Vec<_>>(),
        ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
    );
}
