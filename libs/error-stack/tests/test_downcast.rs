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
fn downcast_take() {
    fn setup_report() -> error_stack::Report<ContextA> {
        let mut report = create_report();
        report = report.attach(AttachmentA(10));
        report.change_context(ContextA(20)).attach(PrintableA(30))
    }

    let report = setup_report();
    assert!(report.contains::<RootError>());
    let Err(report) = report.downcast_take::<ContextB>() else {
        panic!("ContextB should not be found")
    };
    let (report, root_e) = report
        .downcast_take::<RootError>()
        .expect("RootError should be found");
    assert_eq!(root_e, RootError);
    let Err(report) = report.downcast_take::<RootError>() else {
        panic!("RootError has already been taken")
    };
    let (report, attachment) = report
        .downcast_take::<AttachmentA>()
        .expect("AttachmentA should be found");
    assert_eq!(attachment.0, 10);
    let (report, ctx) = report
        .downcast_take::<ContextA>()
        .expect("ContextA should be found");
    assert_eq!(ctx.0, 20);
    let (report, attachment) = report
        .downcast_take::<PrintableA>()
        .expect("PrintableA should be found");
    assert_eq!(attachment.0, 30);

    // When using downcast_take, the printable representation of the report should not change.
    let original_report = setup_report();
    assert_eq!(
        format!("{report:?}"),
        format!("{original_report:?}"),
        "\n{report:?}\n{original_report:?}"
    );
}

#[test]
fn pop_context() {
    fn setup_report() -> error_stack::Report<ContextA> {
        let mut report = create_report();
        report = report.attach(AttachmentA(10));
        report.change_context(ContextA(20)).attach(PrintableA(30))
    }

    let report = setup_report();
    let (report, popped_ctx) = report.pop_current_context();
    assert_eq!(popped_ctx.0, 20);

    // Can still access other attachments and contexts:
    assert_eq!(
        *report
            .downcast_ref::<RootError>()
            .expect("RootError should be found"),
        RootError
    );
    assert_eq!(
        report
            .downcast_ref::<AttachmentA>()
            .expect("AttachmentA should be found")
            .0,
        10
    );

    // When using pop_context, the printable representation of the report should not change.
    let original_report = setup_report();
    assert_eq!(
        format!("{report:?}"),
        format!("{original_report:?}"),
        "\n{report:?}\n{original_report:?}"
    );
}

#[test]
fn into_context() {
    let mut report = create_report();
    report = report.attach(AttachmentA(10));
    let report = report.change_context(ContextA(20)).attach(PrintableA(30));

    let popped_ctx = report.into_current_context();
    assert_eq!(popped_ctx.0, 20);
}
