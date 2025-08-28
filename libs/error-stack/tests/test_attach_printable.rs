#![cfg_attr(nightly, feature(error_generic_member_access))]

#[macro_use]
mod common;

use common::*;
use error_stack::{AttachmentKind, FrameKind, FutureExt as _, Report, ResultExt as _};

fn test_messages<E>(report: &Report<E>) {
    assert_eq!(
        remove_builtin_messages(messages(report)),
        remove_builtin_messages([
            "context B",
            "context A",
            "printable B",
            "printable A",
            "root error"
        ])
    );
}

fn test_kinds<E>(report: &Report<E>) {
    assert_kinds!(
        report,
        [
            FrameKind::Attachment(AttachmentKind::Printable(_)),
            FrameKind::Attachment(AttachmentKind::Printable(_)),
            FrameKind::Attachment(AttachmentKind::Printable(_)),
            FrameKind::Attachment(AttachmentKind::Printable(_)),
            FrameKind::Context(_)
        ]
    );
}

#[test]
fn attach_opaque() {
    let report = create_report()
        .attach(PrintableA(0))
        .attach(PrintableB(0))
        .attach(ContextA(0))
        .attach(ContextB(0));

    test_messages(&report);
    test_kinds(&report);
}

#[test]
fn attach_result() {
    let error = create_error()
        .attach(PrintableA(0))
        .attach_lazy(|| PrintableB(0))
        .attach(ContextA(0))
        .attach_lazy(|| ContextB(0));

    let report = error.expect_err("Not an error");
    test_messages(&report);
    test_kinds(&report);
}

#[test]
fn attach_future() {
    let future = create_future()
        .attach(PrintableA(0))
        .attach_lazy(|| PrintableB(0))
        .attach(ContextA(0))
        .attach_lazy(|| ContextB(0));

    let error = futures::executor::block_on(future);

    let report = error.expect_err("Not an error");
    test_messages(&report);
    test_kinds(&report);
}
