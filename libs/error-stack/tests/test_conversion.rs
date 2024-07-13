#![cfg(feature = "std")]
#![cfg_attr(nightly, feature(error_generic_member_access))]
#![allow(clippy::std_instead_of_core)]

use core::fmt;
use std::{error::Error, io};

use error_stack::{FrameKind, Report, ResultExt};

fn io_error() -> Result<(), io::Error> {
    Err(io::Error::from(io::ErrorKind::Other))
}

#[derive(Debug)]
struct OuterError {
    inner: InnerError,
}

impl fmt::Display for OuterError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(fmt, "outer error: {}", self.inner)
    }
}

impl Error for OuterError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        Some(&self.inner)
    }
}

#[derive(Debug)]
struct InnerError {
    inner: io::Error,
}

impl fmt::Display for InnerError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(fmt, "inner error: {}", self.inner)
    }
}

impl Error for InnerError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        Some(&self.inner)
    }
}

fn error_with_sources() -> Result<(), OuterError> {
    Err(OuterError {
        inner: InnerError {
            inner: io::Error::from(io::ErrorKind::Other),
        },
    })
}

#[test]
fn report() {
    let report = io_error().map_err(Report::new).expect_err("not an error");
    assert!(report.contains::<io::Error>());
    assert_eq!(report.current_context().kind(), io::ErrorKind::Other);
}

#[test]
fn error() {
    let report = error_with_sources()
        .map_err(Report::new)
        .expect_err("not an error");

    let mut frames = report
        .frames()
        .skip_while(|frame| !matches!(frame.kind(), FrameKind::Context(_)));
    assert!(frames.next().expect("no frames").is::<OuterError>());

    // "inner error: other error"
    let mut frames = frames.skip_while(|frame| !matches!(frame.kind(), FrameKind::Context(_)));
    assert!(frames.next().is_some());

    // "other error"
    let mut frames = frames.skip_while(|frame| !matches!(frame.kind(), FrameKind::Context(_)));
    assert!(frames.next().is_some());

    // no further sources
    let mut frames = frames.skip_while(|frame| !matches!(frame.kind(), FrameKind::Context(_)));
    assert!(frames.next().is_none());
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
