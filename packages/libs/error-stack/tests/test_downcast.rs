#![cfg_attr(nightly, feature(provide_any))]
#![cfg_attr(all(nightly, feature = "std"), feature(error_generic_member_access))]

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
