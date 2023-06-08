#![cfg_attr(nightly, feature(provide_any))]
#![cfg_attr(all(nightly, feature = "std"), feature(error_generic_member_access))]

#[macro_use]
mod common;

#[allow(clippy::wildcard_imports)]
use common::*;
use error_stack::{AttachmentKind, FrameKind, FutureExt, Report, ResultExt};

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
    assert_kinds!(report, [
        FrameKind::Attachment(AttachmentKind::Printable(_)),
        FrameKind::Attachment(AttachmentKind::Printable(_)),
        FrameKind::Attachment(AttachmentKind::Printable(_)),
        FrameKind::Attachment(AttachmentKind::Printable(_)),
        FrameKind::Context(_)
    ]);
}

#[test]
fn attach() {
    let report = create_report()
        .attach_printable(PrintableA(0))
        .attach_printable(PrintableB(0))
        .attach_printable(ContextA(0))
        .attach_printable(ContextB(0));

    test_messages(&report);
    test_kinds(&report);
}

#[test]
fn attach_result() {
    let error = create_error()
        .attach_printable(PrintableA(0))
        .attach_printable_lazy(|| PrintableB(0))
        .attach_printable(ContextA(0))
        .attach_printable_lazy(|| ContextB(0));

    let report = error.expect_err("Not an error");
    test_messages(&report);
    test_kinds(&report);
}

#[test]
fn attach_future() {
    let future = create_future()
        .attach_printable(PrintableA(0))
        .attach_printable_lazy(|| PrintableB(0))
        .attach_printable(ContextA(0))
        .attach_printable_lazy(|| ContextB(0));

    let error = futures::executor::block_on(future);

    let report = error.expect_err("Not an error");
    test_messages(&report);
    test_kinds(&report);
}
