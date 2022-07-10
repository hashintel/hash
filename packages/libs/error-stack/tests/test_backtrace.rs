#![cfg(all(feature = "std", nightly))]
#![feature(provide_any, backtrace, backtrace_frames)]

mod common;

#[cfg(all(nightly, feature = "std"))]
use std::error::Error;

use common::*;
use error_stack::Report;

#[test]
fn captured() {
    std::env::set_var("RUST_LIB_BACKTRACE", "1");

    let report = create_report();
    let backtrace = report.backtrace().expect("No backtrace captured");
    assert!(!backtrace.frames().is_empty());
}

#[test]
fn provided() {
    let error = ErrorB::new(10);
    let error_backtrace = error
        .backtrace()
        .expect("No backtrace captured")
        .to_string();

    let report = Report::new(error);
    assert_eq!(
        report
            .backtrace()
            .expect("No backtrace captured")
            .to_string(),
        error_backtrace
    );
}
