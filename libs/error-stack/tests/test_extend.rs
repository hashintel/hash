#![cfg_attr(nightly, feature(provide_any))]
#![cfg_attr(all(nightly, feature = "std"), feature(error_generic_member_access))]

mod common;
use core::fmt::{Display, Formatter};

#[allow(clippy::wildcard_imports)]
use common::*;
use error_stack::{report, Context, Report};

#[derive(Debug)]
struct Error;

impl Display for Error {
    fn fmt(&self, f: &mut Formatter<'_>) -> core::fmt::Result {
        f.write_str("Error")
    }
}

impl Context for Error {}

#[test]
fn extend_one_nested() {
    let mut err1 = report!(Error).attach_printable("Not Supported");
    let err2 = report!(Error).attach_printable("Not Supported");
    let mut err3 = report!(Error).attach_printable("Not Supported");

    let count = expect_count(2) * 3;

    err1.extend_one(err2);
    err3.extend_one(err1);

    assert_eq!(err3.current_frames().len(), 3);
    assert_eq!(err3.frames().count(), count);
}

#[test]
fn extend_one() {
    let mut err1 = report!(Error).attach_printable("Not Supported");
    let err2 = report!(Error).attach_printable("Not Supported");
    let err3 = report!(Error).attach_printable("Not Supported");

    let count = expect_count(2) * 3;

    err1.extend_one(err2);
    err1.extend_one(err3);

    assert_eq!(err1.current_frames().len(), 3);
    assert_eq!(err1.frames().count(), count);
}

#[test]
fn extend() {
    let mut err1 = report!(Error).attach_printable("Not Supported");
    let err2 = report!(Error).attach_printable("Not Supported");
    let err3 = report!(Error).attach_printable("Not Supported");

    err1.extend([err2, err3]);
    assert_eq!(err1.current_frames().len(), 3);
    assert_eq!(err1.frames().count(), expect_count(2) * 3);
}

#[test]
fn collect() {
    let report: Option<Report<Error>> = vec![report!(Error), report!(Error), report!(Error)]
        .into_iter()
        .collect();

    let report = report.expect("should be some");
    assert_eq!(report.current_frames().len(), 3);
    assert_eq!(report.frames().count(), expect_count(1) * 3);
}

#[test]
fn collect_none() {
    let report: Option<Report<Error>> = vec![].into_iter().collect();

    assert!(report.is_none());
}
