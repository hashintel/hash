#![cfg(feature = "std")]
#![cfg_attr(nightly, feature(provide_any, backtrace))]

use std::io;

use error_stack::IntoReport;

fn io_error() -> Result<(), io::Error> {
    Err(io::Error::from(io::ErrorKind::Other))
}

#[test]
#[allow(deprecated)]
fn report() {
    let report = io_error().report().expect_err("Not an error");
    assert!(report.contains::<io::Error>());
    assert_eq!(report.current_context().kind(), io::ErrorKind::Other);
}

#[test]
fn into_report() {
    let report = io_error().into_report().expect_err("Not an error");
    assert!(report.contains::<io::Error>());
    assert_eq!(report.current_context().kind(), io::ErrorKind::Other);
}
