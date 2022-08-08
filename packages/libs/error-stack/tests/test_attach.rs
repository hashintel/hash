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
        expect_messages(&["Opaque", "Opaque", "Opaque", "Opaque", "Root error"])
    );
}

fn test_kinds<E>(report: &Report<E>) {
    assert_kinds!(report, [
        FrameKind::Attachment(AttachmentKind::Opaque(_)),
        FrameKind::Attachment(AttachmentKind::Opaque(_)),
        FrameKind::Attachment(AttachmentKind::Opaque(_)),
        FrameKind::Attachment(AttachmentKind::Opaque(_))
        => (trace)
        FrameKind::Context(_)
    ]);
}

#[test]
fn attach() {
    let report = create_report()
        .attach(PrintableA)
        .attach(PrintableB(0))
        .attach(AttachmentA)
        .attach(AttachmentB);

    test_messages(&report);
    test_kinds(&report);
}

#[test]
fn attach_result() {
    let error = create_error()
        .attach(PrintableA)
        .attach_lazy(|| PrintableB(0))
        .attach(AttachmentA)
        .attach_lazy(|| AttachmentB);

    let report = error.expect_err("Not an error");
    test_messages(&report);
    test_kinds(&report);
}

#[test]
fn attach_iterator() {
    let iter = create_iterator(5)
        .attach(PrintableA)
        .attach_lazy(|| PrintableB(0))
        .attach(AttachmentA)
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
        .attach(PrintableA)
        .attach_lazy(|| PrintableB(0))
        .attach(AttachmentA)
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
        .attach(PrintableA)
        .attach_lazy(|| PrintableB(0))
        .attach(AttachmentA)
        .attach_lazy(|| AttachmentB);

    let iter = futures::executor::block_on_stream(stream);

    for error in iter {
        let report = error.expect_err("Not an error");
        test_messages(&report);
        test_kinds(&report);
    }
}
