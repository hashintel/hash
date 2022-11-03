#![cfg_attr(nightly, feature(provide_any))]
#![cfg_attr(all(nightly, feature = "std"), feature(error_generic_member_access))]

#[macro_use]
mod common;

use common::*;
use error_stack::{AttachmentKind, FrameKind, FutureExt, Report, ResultExt};

fn test_messages<E>(report: &Report<E>) {
    assert_eq!(
        remove_builtin_messages(messages(report)),
        remove_builtin_messages(["opaque", "context B", "opaque", "context A", "root error"])
    );
}

fn test_kinds<E>(report: &Report<E>) {
    assert_kinds!(report, [
        FrameKind::Attachment(AttachmentKind::Opaque(_)),
        FrameKind::Context(_),
        FrameKind::Attachment(AttachmentKind::Opaque(_)),
        FrameKind::Context(_),
        FrameKind::Context(_)
    ]);
}

#[test]
fn attach() {
    let report = create_report()
        .change_context(ContextA(0))
        .attach(AttachmentA)
        .change_context(ContextB(0))
        .attach(AttachmentB);

    test_messages(&report);
    test_kinds(&report);
}

#[test]
fn attach_result() {
    let error = create_error()
        .change_context(ContextA(0))
        .attach(AttachmentA)
        .change_context_lazy(|| ContextB(0))
        .attach_lazy(|| AttachmentB);

    let report = error.expect_err("Not an error");
    test_messages(&report);
    test_kinds(&report);
}

#[test]
fn attach_future() {
    let future = create_future()
        .change_context(ContextA(0))
        .attach(AttachmentA)
        .change_context_lazy(|| ContextB(0))
        .attach_lazy(|| AttachmentB);

    let error = futures::executor::block_on(future);

    let report = error.expect_err("Not an error");
    test_messages(&report);
    test_kinds(&report);
}
