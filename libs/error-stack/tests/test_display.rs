#![cfg_attr(nightly, feature(provide_any))]
#![cfg_attr(all(nightly, feature = "std"), feature(error_generic_member_access))]

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

    assert_eq!(report.to_string(), "context B");
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

    assert_eq!(format!("{report:#}"), "context B: context A: root error");
}
