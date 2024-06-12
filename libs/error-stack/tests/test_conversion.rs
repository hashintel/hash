#![cfg(feature = "std")]
#![cfg_attr(nightly, feature(error_generic_member_access))]

use std::io;

use error_stack::{Report, ResultExt};

fn io_error() -> Result<(), io::Error> {
    Err(io::Error::from(io::ErrorKind::Other))
}

#[test]
fn report() {
    let report = io_error().map_err(Report::new).expect_err("not an error");
    assert!(report.contains::<io::Error>());
    assert_eq!(report.current_context().kind(), io::ErrorKind::Other);
}

#[test]
fn into_report() {
    let report = io_error().map_err(Report::from).expect_err("not an error");
    assert!(report.contains::<io::Error>());
    assert_eq!(report.current_context().kind(), io::ErrorKind::Other);
}

fn returning_boxed_error() -> Result<(), Box<dyn core::error::Error + Send + Sync>> {
    io_error().attach(10_u32)?;
    Ok(())
}

#[test]
fn boxed_error() {
    let report = returning_boxed_error().expect_err("not an error");
    assert_eq!(
        report.to_string(),
        io_error().expect_err("not an error").to_string()
    );

    #[cfg(nightly)]
    assert_eq!(
        *core::error::request_ref::<u32>(report.as_ref()).expect("requested value not found"),
        10
    );
}
