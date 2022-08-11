#![cfg_attr(nightly, feature(provide_any))]
#![cfg_attr(
    all(nightly, feature = "std"),
    feature(backtrace, error_generic_member_access)
)]

#[macro_use]
mod common;

use common::*;
use error_stack::{AttachmentKind, FrameKind, IteratorExt, Report, ResultExt};
#[cfg(feature = "futures")]
use error_stack::{FutureExt, StreamExt};

fn test_messages<E>(report: &Report<E>) {
    assert_eq!(
        messages(report),
        expect_messages(&["Opaque", "Context B", "Opaque", "Context A", "Root error"])
    );
}

fn test_kinds<E>(report: &Report<E>) {
    assert_kinds!(report, [
        FrameKind::Attachment(AttachmentKind::Opaque(_)),
        FrameKind::Context(_),
        FrameKind::Attachment(AttachmentKind::Opaque(_)),
        FrameKind::Context(_)
        => (trace)
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
fn attach_iterator() {
    let iter = create_iterator(5)
        .change_context(ContextA(0))
        .attach(AttachmentA)
        .change_context_lazy(|| ContextB(0))
        .attach_lazy(|| AttachmentB);

    for error in iter {
        let report = error.expect_err("Not an error");
        test_messages(&report);
        test_kinds(&report);
    }
}

#[test]
#[cfg(feature = "futures")]
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

#[test]
#[cfg(feature = "futures")]
fn attach_stream() {
    let stream = create_stream(5)
        .change_context(ContextA(0))
        .attach(AttachmentA)
        .change_context_lazy(|| ContextB(0))
        .attach_lazy(|| AttachmentB);

    let iter = futures::executor::block_on_stream(stream);

    for error in iter {
        let report = error.expect_err("Not an error");
        test_messages(&report);
        test_kinds(&report);
    }
}
