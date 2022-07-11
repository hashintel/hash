#![cfg(nightly)]
#![feature(provide_any)]
#![cfg_attr(feature = "std", feature(backtrace))]

mod common;

use common::*;

#[test]
fn opaque_attachment() {
    let mut report = create_report()
        .attach(AttachmentA(10))
        .attach(AttachmentB(20));

    let frame = report.frames_mut().next().expect("No frame found");
    let source = frame.source_mut().expect("No source frame found");
    let attachment = source
        .downcast_mut::<AttachmentA>()
        .expect("Wrong source frame");
    attachment.0 += 10;

    let source = frame.source().expect("No source frame found");
    let attachment = source
        .downcast_ref::<AttachmentA>()
        .expect("Wrong source frame");
    assert_eq!(attachment.0, 20);
}

#[test]
fn printable_attachment() {
    let mut report = create_report()
        .attach_printable(PrintableA(10))
        .attach_printable(PrintableB(20));

    let frame = report.frames_mut().next().expect("No frame found");
    let source = frame.source_mut().expect("No source frame found");
    let attachment = source
        .downcast_mut::<PrintableA>()
        .expect("Wrong source frame");
    attachment.0 += 10;

    let source = frame.source().expect("No source frame found");
    let attachment = source
        .downcast_ref::<PrintableA>()
        .expect("Wrong source frame");
    assert_eq!(attachment.0, 20);
}

#[test]
fn context() {
    let mut report = create_report()
        .change_context(ContextA(10))
        .change_context(ContextB(20));

    let frame = report.frames_mut().next().expect("No frame found");
    let source = frame.source_mut().expect("No source frame found");
    let context = source
        .downcast_mut::<ContextA>()
        .expect("Wrong source frame");
    context.0 += 10;

    let source = frame.source().expect("No source frame found");
    let context = source
        .downcast_ref::<ContextA>()
        .expect("Wrong source frame");
    assert_eq!(context.0, 20);
}
