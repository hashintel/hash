#![cfg(nightly)]
#![feature(provide_any)]
#![cfg_attr(feature = "std", feature(error_generic_member_access))]

mod common;

use common::*;
use error_stack::Report;

#[test]
fn request_attachment() {
    let report = create_report();
    assert_eq!(report.request_ref::<u32>().count(), 0);

    let report = report.attach(AttachmentA(10)).attach(AttachmentB(20));

    let request_a = report.request_ref::<AttachmentA>().collect::<Vec<_>>();
    assert_eq!(request_a.len(), 1);
    assert_eq!(request_a[0].0, 10);

    let request_b = report.request_ref::<AttachmentB>().collect::<Vec<_>>();
    assert_eq!(request_b.len(), 1);
    assert_eq!(request_b[0].0, 20);
}

#[test]
fn request_context() {
    let report = create_report();
    assert_eq!(report.request_ref::<u32>().count(), 0);
    assert_eq!(report.request_value::<u64>().count(), 0);

    let report = report.change_context(ContextA(10));
    assert_eq!(report.request_ref::<ContextA>().count(), 0);
    assert_eq!(report.request_value::<ContextA>().count(), 0);
    assert_eq!(report.request_ref::<u64>().count(), 0);
    assert_eq!(report.request_value::<u32>().count(), 0);

    let request_a = report.request_ref::<u32>().collect::<Vec<_>>();
    assert_eq!(request_a.len(), 1);
    assert_eq!(*request_a[0], 10);

    let request_b = report.request_value::<u64>().collect::<Vec<_>>();
    assert_eq!(request_b.len(), 1);
    assert_eq!(request_b[0], 10);
}

#[test]
fn context_provision() {
    let report = Report::from(ContextA(10));
    assert_eq!(report.request_ref::<u32>().count(), 1);
}
