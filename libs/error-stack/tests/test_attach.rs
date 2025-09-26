#![cfg_attr(nightly, feature(error_generic_member_access))]

#[macro_use]
mod common;

use common::*;
use error_stack::{AttachmentKind, FrameKind, FutureExt as _, Report, ResultExt as _};

fn test_messages<E>(report: &Report<E>) {
    assert_eq!(
        remove_builtin_messages(messages(report)),
        remove_builtin_messages(["opaque", "opaque", "opaque", "opaque", "root error"])
    );
}

fn test_kinds<E>(report: &Report<E>) {
    assert_kinds!(
        report,
        [
            FrameKind::Attachment(AttachmentKind::Opaque(_)),
            FrameKind::Attachment(AttachmentKind::Opaque(_)),
            FrameKind::Attachment(AttachmentKind::Opaque(_)),
            FrameKind::Attachment(AttachmentKind::Opaque(_)),
            FrameKind::Context(_)
        ]
    );
}

#[test]
fn attach_opaque() {
    let report = create_report()
        .attach_opaque(PrintableA)
        .attach_opaque(PrintableB(0))
        .attach_opaque(AttachmentA)
        .attach_opaque(AttachmentB);

    test_messages(&report);
    test_kinds(&report);
}

#[test]
fn attach_group() {
    let mut root = create_report()
        .attach_opaque(PrintableA)
        .attach_opaque(PrintableB(0))
        .expand();
    let nested = create_report()
        .attach_opaque(AttachmentA)
        .attach_opaque(AttachmentB);

    root.push(nested);

    // bury the first error under a couple of attachments
    let mut root = root
        .attach(PrintableB(0))
        .attach(PrintableB(1))
        .attach(PrintableB(2));

    let shallow = create_report()
        .attach_opaque(AttachmentA)
        .attach_opaque(AttachmentB);

    root.push(shallow);

    assert_eq!(root.current_contexts().count(), 3);
}

#[test]
fn attach_result() {
    let error = create_error()
        .attach_opaque(PrintableA)
        .attach_opaque_with(|| PrintableB(0))
        .attach_opaque(AttachmentA)
        .attach_opaque_with(|| AttachmentB);

    let report = error.expect_err("Not an error");
    test_messages(&report);
    test_kinds(&report);
}

#[test]
fn attach_future() {
    let future = create_future()
        .attach_opaque(PrintableA)
        .attach_opaque_with(|| PrintableB(0))
        .attach_opaque(AttachmentA)
        .attach_opaque_with(|| AttachmentB);

    let error = futures::executor::block_on(future);

    let report = error.expect_err("Not an error");
    test_messages(&report);
    test_kinds(&report);
}
