#![cfg_attr(nightly, feature(error_generic_member_access))]

mod common;
use core::{
    error::Error,
    fmt::{Display, Formatter},
};

use common::*;
use error_stack::{Report, report};

#[derive(Debug)]
struct MyError;

impl Display for MyError {
    fn fmt(&self, fmt: &mut Formatter<'_>) -> core::fmt::Result {
        fmt.write_str("Error")
    }
}

impl Error for MyError {}

#[test]
fn push_append() {
    let mut err1 = report!(MyError).attach_printable("Not Supported").expand();
    let err2 = report!(MyError).attach_printable("Not Supported");
    let mut err3 = report!(MyError).attach_printable("Not Supported").expand();

    let count = expect_count(2) * 3;

    err1.push(err2);
    err3.append(err1);

    assert_eq!(err3.current_frames().len(), 3);
    assert_eq!(err3.frames().count(), count);
}

#[test]
fn push() {
    let mut err1 = report!(MyError).attach_printable("Not Supported").expand();
    let err2 = report!(MyError).attach_printable("Not Supported");
    let err3 = report!(MyError).attach_printable("Not Supported");

    let count = expect_count(2) * 3;

    err1.push(err2);
    err1.push(err3);

    assert_eq!(err1.current_frames().len(), 3);
    assert_eq!(err1.frames().count(), count);
}

#[test]
fn extend() {
    let mut err1 = report!(MyError).attach_printable("Not Supported").expand();
    let err2 = report!(MyError).attach_printable("Not Supported");
    let err3 = report!(MyError).attach_printable("Not Supported");

    err1.extend([err2, err3]);
    assert_eq!(err1.current_frames().len(), 3);
    assert_eq!(err1.frames().count(), expect_count(2) * 3);
}

#[test]
fn collect_single() {
    let report: Option<Report<[MyError]>> =
        vec![report!(MyError), report!(MyError), report!(MyError)]
            .into_iter()
            .collect();

    let report = report.expect("should be some");
    assert_eq!(report.current_frames().len(), 3);
    assert_eq!(report.frames().count(), expect_count(1) * 3);
}

#[test]
fn collect_multiple() {
    let report: Option<Report<[MyError]>> = vec![
        report!(MyError).expand(),
        report!(MyError).expand(),
        report!(MyError).expand(),
    ]
    .into_iter()
    .collect();

    let report = report.expect("should be some");
    assert_eq!(report.current_frames().len(), 3);
    assert_eq!(report.frames().count(), expect_count(1) * 3);
}

#[test]
fn collect_none() {
    let report: Option<Report<[MyError]>> = ([] as [Report<MyError>; 0]).into_iter().collect();

    assert!(report.is_none());
}
