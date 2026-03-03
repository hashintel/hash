#![cfg_attr(nightly, feature(error_generic_member_access))]

mod common;

use common::*;

#[test]
fn normal() {
    let report = create_report()
        .attach(PrintableA(0))
        .attach_opaque(AttachmentA)
        .change_context(ContextA(0))
        .attach(PrintableB(0))
        .attach_opaque(AttachmentB)
        .change_context(ContextB(0));

    assert_eq!(report.to_string(), "context B");
}

#[test]
fn extended() {
    let report = create_report()
        .attach(PrintableA(0))
        .attach_opaque(AttachmentA)
        .change_context(ContextA(0))
        .attach(PrintableB(0))
        .attach_opaque(AttachmentB)
        .change_context(ContextB(0));

    assert_eq!(format!("{report:#}"), "context B: context A: root error");
}
