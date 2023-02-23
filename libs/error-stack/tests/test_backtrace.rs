#![cfg(all(rust_1_65, feature = "std"))]
#![cfg_attr(
    nightly,
    feature(provide_any, backtrace_frames, error_generic_member_access)
)]

mod common;

use std::backtrace::Backtrace;

#[allow(clippy::wildcard_imports)]
use common::*;
#[cfg(nightly)]
use error_stack::Report;

#[test]
fn captured() {
    std::env::set_var("RUST_LIB_BACKTRACE", "1");

    let report = create_report();
    #[cfg(nightly)]
    {
        assert_eq!(report.request_ref::<Backtrace>().count(), 1);
        let backtrace = report
            .request_ref::<Backtrace>()
            .next()
            .expect("No backtrace captured");
        assert!(!backtrace.frames().is_empty());
    }
    #[cfg(not(nightly))]
    {
        assert!(
            report.downcast_ref::<Backtrace>().is_some(),
            "No backtrace captured"
        );
    }
}

#[test]
#[cfg(nightly)]
fn provided() {
    let error = ErrorB::new(10);
    let error_backtrace = error.backtrace();
    let error_backtrace_len = error_backtrace.frames().len();
    #[cfg(not(miri))]
    let error_backtrace_string = error_backtrace.to_string();

    let report = Report::new(error);
    assert_eq!(report.request_ref::<Backtrace>().count(), 1);
    let report_backtrace = report
        .request_ref::<Backtrace>()
        .next()
        .expect("No backtrace captured");
    let report_backtrace_len = report_backtrace.frames().len();
    #[cfg(not(miri))]
    let report_backtrace_string = report_backtrace.to_string();

    assert_eq!(error_backtrace_len, report_backtrace_len);
    #[cfg(not(miri))]
    assert_eq!(error_backtrace_string, report_backtrace_string);
}
