#![cfg_attr(nightly, feature(error_generic_member_access))]

#[macro_use]
mod common;

#[allow(clippy::wildcard_imports)]
use common::*;
use error_stack::{AttachmentKind, FrameKind, FutureExt as _, Report, ResultExt as _};

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
fn buried_duplicate_context_does_not_affect_current_contexts() {
    let mut root = create_report()
        .change_context(ContextA(0))
        .change_context(RootError)
        .expand();
    let auxillary = create_report();
    root.push(auxillary);

    let mut root = root.attach(AttachmentA);

    let shallow = create_report()
        .attach(AttachmentB)
        .change_context(ContextB(0))
        .attach(AttachmentA)
        .change_context(ContextA(0))
        .change_context(RootError);

    root.push(shallow);

    assert_eq!(root.current_contexts().count(), 3);
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
