#![cfg_attr(nightly, feature(error_generic_member_access))]

mod common;

use common::*;

#[test]
fn downcast_ref() {
    let mut report = create_report();
    assert!(report.contains::<RootError>());

    assert!(!report.contains::<AttachmentA>());
    report = report.attach_opaque(AttachmentA(10));
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
    report = report.attach_opaque(AttachmentA(10));
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
fn downcast_mut_deep() {
    let mut report = create_report()
        .attach_opaque(AttachmentA(10))
        .change_context(ContextA(0))
        .attach_opaque(AttachmentB(0));

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
fn downcast_mut_second_root() {
    let mut report = create_report().expand();
    report.push(create_report().attach_opaque(AttachmentA(10)));

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
fn downcast_mut_returns_outermost() {
    let mut report = create_report()
        .attach_opaque(AttachmentA(1))
        .attach_opaque(AttachmentB(2))
        .attach_opaque(AttachmentA(3));

    let attachment = report
        .downcast_mut::<AttachmentA>()
        .expect("Attachment not found");
    assert_eq!(attachment.0, 3);
    attachment.0 = 30;

    let values: Vec<_> = report
        .frames()
        .filter_map(|frame| frame.downcast_ref::<AttachmentA>())
        .map(|attachment| attachment.0)
        .collect();
    assert_eq!(values, [30, 1]);
}

#[test]
fn downcast_mut_miss() {
    let mut report = create_report().attach_opaque(AttachmentA(10));
    assert!(report.downcast_mut::<AttachmentB>().is_none());
}
