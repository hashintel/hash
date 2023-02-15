//! Note: `span_trace`, `backtrace` and such are not special cased, therefore all tests run with all
//! tests enabled.
#![cfg(all(feature = "std", feature = "spantrace", feature = "serde"))]
// can be considered safe, because we only check the output, which in itself does not use **any**
// unsafe code.
#![cfg(not(miri))]
#![cfg_attr(all(nightly, feature = "std"), feature(error_generic_member_access))]
#![cfg_attr(nightly, feature(provide_any))]
#![allow(clippy::std_instead_of_core)]

use insta::assert_ron_snapshot;

use crate::common::{create_report, ContextA, PrintableA, PrintableC};

mod common;

fn prepare() -> impl Drop {
    std::env::set_var("RUST_LIB_BACKTRACE", "0");

    let settings = insta::Settings::clone_current();

    settings.bind_to_scope()
}

#[test]
fn attachment() {
    let _guard = prepare();

    let report = create_report().attach_printable(PrintableA(2));

    assert_ron_snapshot!(report);
}

#[test]
fn context() {
    let _guard = prepare();

    let report = create_report()
        .attach_printable(PrintableA(2))
        .change_context(ContextA(2));

    assert_ron_snapshot!(report);
}

#[test]
fn multiple_sources() {
    let _guard = prepare();

    let mut a = create_report().attach_printable(PrintableC(1));
    let b = create_report().attach_printable(PrintableC(2));

    a.extend_one(b);

    let a = a
        .attach_printable(PrintableC(3))
        .change_context(ContextA(2))
        .attach_printable(PrintableC(4));

    assert_ron_snapshot!(a);
}

#[test]
fn multiple_sources_at_root() {
    let _guard = prepare();

    let mut a = create_report().attach_printable(PrintableC(1));
    let b = create_report().attach_printable(PrintableC(2));

    a.extend_one(b);

    assert_ron_snapshot!(a);
}
