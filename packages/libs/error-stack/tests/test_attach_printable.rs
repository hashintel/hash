#![cfg_attr(nightly, feature(provide_any))]
#![cfg_attr(all(nightly, feature = "std"), feature(backtrace))]

mod common;

use common::*;
use error_stack::{AttachmentKind, FrameKind, IteratorExt, Report, ResultExt};
#[cfg(feature = "futures")]
use error_stack::{FutureExt, StreamExt};

fn test_messages<E>(report: &Report<E>) {
    assert_eq!(messages(report), [
        "Context B",
        "Context A",
        "Printable B",
        "Printable A",
        "Root error"
    ]);
}

fn test_kinds<E>(report: &Report<E>) {
    assert!(matches!(frame_kinds(report).as_slice(), [
        FrameKind::Attachment(AttachmentKind::Printable(_)),
        FrameKind::Attachment(AttachmentKind::Printable(_)),
        FrameKind::Attachment(AttachmentKind::Printable(_)),
        FrameKind::Attachment(AttachmentKind::Printable(_)),
        FrameKind::Context(_),
    ]));
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
fn attach_iterator() {
    let iter = create_iterator(5)
        .attach_printable(PrintableA(0))
        .attach_printable_lazy(|| PrintableB(0))
        .attach_printable(ContextA(0))
        .attach_printable_lazy(|| ContextB(0));

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
        .attach_printable(PrintableA(0))
        .attach_printable_lazy(|| PrintableB(0))
        .attach_printable(ContextA(0))
        .attach_printable_lazy(|| ContextB(0));

    let error = futures::executor::block_on(future);

    let report = error.expect_err("Not an error");
    test_messages(&report);
    test_kinds(&report);
}

#[test]
#[cfg(feature = "futures")]
fn attach_stream() {
    let stream = create_stream(5)
        .attach_printable(PrintableA(0))
        .attach_printable_lazy(|| PrintableB(0))
        .attach_printable(ContextA(0))
        .attach_printable_lazy(|| ContextB(0));

    let iter = futures::executor::block_on_stream(stream);

    for error in iter {
        let report = error.expect_err("Not an error");
        test_messages(&report);
        test_kinds(&report);
    }
}
