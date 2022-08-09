#![cfg_attr(nightly, feature(provide_any))]
#![cfg_attr(
    all(nightly, feature = "std"),
    feature(backtrace, error_generic_member_access)
)]

mod common;

use common::*;

#[test]
fn normal() {
    let report = create_report()
        .attach_printable(PrintableA(0))
        .attach(AttachmentA)
        .change_context(ContextA(0))
        .attach_printable(PrintableB(0))
        .attach(AttachmentB)
        .change_context(ContextB(0));

    assert_eq!(report.to_string(), "Context B");
}

#[test]
fn extended() {
    let report = create_report()
        .attach_printable(PrintableA(0))
        .attach(AttachmentA)
        .change_context(ContextA(0))
        .attach_printable(PrintableB(0))
        .attach(AttachmentB)
        .change_context(ContextB(0));

    assert_eq!(format!("{report:#}"), "Context B: Context A: Root error");
}
