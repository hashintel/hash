#![cfg_attr(nightly, feature(error_generic_member_access))]

mod common;

use common::*;

#[test]
fn downcast_ref() {
    let mut report = create_report();
    assert!(report.contains::<RootError>());

    assert!(!report.contains::<AttachmentA>());
    report = report.attach(AttachmentA(10));
    assert!(report.contains::<AttachmentA>());

    let attachment = report
        .downcast_ref::<AttachmentA>()
        .expect("Attachment not found");
    assert_eq!(attachment.0, 10);
}

#[test]
fn downcast_mut() {
    let mut report = create_report();
    assert!(report.contains::<RootError>());

    assert!(!report.contains::<AttachmentA>());
    report = report.attach(AttachmentA(10));
    assert!(report.contains::<AttachmentA>());

    let attachment = report
        .downcast_mut::<AttachmentA>()
        .expect("Attachment not found");
    attachment.0 += 10;

    let attachment = report
        .downcast_ref::<AttachmentA>()
        .expect("Attachment not found");
    assert_eq!(attachment.0, 20);
}

#[test]
fn downcast() {
    // downcast to contexts:
    let report = create_report();
    assert!(report.contains::<RootError>());
    let Err(report) = report.downcast::<ContextA>() else {
        panic!("ContextA should not be found")
    };
    assert_eq!(
        report
            .downcast::<RootError>()
            .expect("RootError should be found"),
        RootError
    );

    // downcast to attachments:
    let mut report = create_report();
    report = report.attach(AttachmentA(10));
    let report = report.change_context(ContextA(20));
    let Err(report) = report.downcast::<AttachmentB>() else {
        panic!("AttachmentB should not be found")
    };
    assert!(report.contains::<AttachmentA>());
    assert_eq!(
        report
            .downcast::<AttachmentA>()
            .expect("AttachmentA should be found")
            .0,
        10
    );
}

#[test]
fn into_context() {
    let mut report = create_report();
    report = report.attach(AttachmentA(10));
    let report = report.change_context(ContextA(20)).attach(PrintableA(30));

    let consumed_ctx = report.into_current_context();
    assert_eq!(consumed_ctx.0, 20);
}

#[test]
fn into_frame_contexts() {
    use core::any::TypeId;

    let mut report = create_report();
    report = report.attach(AttachmentA(10));
    let report = report.change_context(ContextA(20)).attach(PrintableA(30));
    let contents = report.into_frame_contents();
    let mut root_error_count = 0;
    let mut attachment_a_count = 0;
    let mut context_a_count = 0;
    let mut printable_a_count = 0;
    for content in contents {
        let tid = content.type_id();
        if tid == TypeId::of::<RootError>() {
            root_error_count += 1;
        } else if tid == TypeId::of::<AttachmentA>() {
            attachment_a_count += 1;
        } else if tid == TypeId::of::<ContextA>() {
            context_a_count += 1;
        } else if tid == TypeId::of::<PrintableA>() {
            printable_a_count += 1;
        } else {
            panic!("Unexpected type in contents: {tid:?}");
        }
    }
    assert_eq!(root_error_count, 1);
    assert_eq!(attachment_a_count, 1);
    assert_eq!(context_a_count, 1);
    assert_eq!(printable_a_count, 1);
}
