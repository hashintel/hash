#![cfg_attr(nightly, feature(provide_any))]
#![cfg_attr(all(nightly, feature = "std"), feature(error_generic_member_access))]

#[macro_use]
mod common;

use common::*;
use error_stack::{AttachmentKind, FrameKind, FutureExt, Report, ResultExt};

fn test_messages<E>(report: &Report<E>) {
    assert_eq!(
        remove_builtin_messages(messages(report)),
        remove_builtin_messages(["opaque", "opaque", "opaque", "opaque", "root error"])
    );
}

fn test_kinds<E>(report: &Report<E>) {
    assert_kinds!(report, [
        FrameKind::Attachment(AttachmentKind::Opaque(_)),
        FrameKind::Attachment(AttachmentKind::Opaque(_)),
        FrameKind::Attachment(AttachmentKind::Opaque(_)),
        FrameKind::Attachment(AttachmentKind::Opaque(_)),
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
