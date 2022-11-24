#![cfg_attr(nightly, feature(provide_any))]
#![cfg_attr(all(nightly, feature = "std"), feature(error_generic_member_access))]

mod common;

use core::{any::TypeId, iter::zip};
use std::panic::Location;

use common::*;

#[test]
fn opaque_attachment() {
    let mut report = create_report()
        .attach(AttachmentA(10))
        .attach(AttachmentB(20));

    assert_eq!(report.current_frames().len(), 1);
    let frame = report.frames_mut().next().expect("No frame found");
    let source = frame
        .sources_mut()
        .first_mut()
        .expect("No source frame found");
    let attachment = source
        .downcast_mut::<AttachmentA>()
        .expect("Wrong source frame");
    attachment.0 += 10;

    assert_eq!(frame.sources().len(), 1);
    let source = frame.sources().first().expect("No source frame found");
    let attachment = source
        .downcast_ref::<AttachmentA>()
        .expect("Wrong source frame");
    assert_eq!(attachment.0, 20);
}

#[test]
fn sources() {
    let mut a = create_report().attach(AttachmentA(10));
    let b = create_report().attach(AttachmentA(20));
    a.extend_one(b);
    let mut report = a.attach(AttachmentB(30));

    assert_eq!(report.current_frames().len(), 1);
    let frame = report.frames_mut().next().expect("No frames");
    assert_eq!(frame.sources().len(), 2);

    for source in frame.sources_mut() {
        let attachment = source
            .downcast_mut::<AttachmentA>()
            .expect("Wrong source frame");
        attachment.0 += 5;
    }

    for (source, expect) in zip(frame.sources(), [15, 25]) {
        let attachment = source
            .downcast_ref::<AttachmentA>()
            .expect("Wrong source frame");
        assert_eq!(attachment.0, expect);
    }
}

#[test]
fn printable_attachment() {
    let mut report = create_report()
        .attach_printable(PrintableA(10))
        .attach_printable(PrintableB(20));

    assert_eq!(report.current_frames().len(), 1);
    let frame = report.frames_mut().next().expect("No frame found");
    let source = frame
        .sources_mut()
        .first_mut()
        .expect("No source frame found");
    let attachment = source
        .downcast_mut::<PrintableA>()
        .expect("Wrong source frame");
    attachment.0 += 10;

    assert_eq!(frame.sources().len(), 1);
    let source = frame.sources().first().expect("No source frame found");
    let attachment = source
        .downcast_ref::<PrintableA>()
        .expect("Wrong source frame");
    assert_eq!(attachment.0, 20);
}

#[test]
fn context() {
    let mut report = create_report().change_context(ContextA(10));

    let mut frames = report.frames_mut();

    let frame = frames.next().expect("No location frame found");
    assert_eq!(frame.sources().len(), 1);
    assert!(frame.is::<Location>(), "not a location frame");

    let source = frame
        .sources_mut()
        .first_mut()
        .expect("no source frame found");

    let context = source
        .downcast_mut::<ContextA>()
        .expect("not a context frame");
    context.0 += 10;

    assert_eq!(frame.sources().len(), 1);
    let source = frame.sources().first().expect("no source frame found");
    let context = source
        .downcast_ref::<ContextA>()
        .expect("not a context frame");
    assert_eq!(context.0, 20);
}

#[test]
fn type_id() {
    let report = create_report().attach(2u32);
    let current = &report.current_frames()[0];

    assert_eq!(current.type_id(), TypeId::of::<u32>());

    let context = report.frames().last().unwrap();
    assert_eq!(context.type_id(), TypeId::of::<RootError>())
}
