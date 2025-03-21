#![cfg_attr(nightly, feature(error_generic_member_access))]

mod common;
use core::{
    error::Error,
    fmt::{Display, Formatter},
};

use common::*;
use error_stack::{IntoReport as _, Report};

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
    let mut err1 = MyError
        .into_report()
        .attach_printable("Not Supported")
        .expand();
    let err2 = MyError.into_report().attach_printable("Not Supported");
    let mut err3 = MyError
        .into_report()
        .attach_printable("Not Supported")
        .expand();

    let count = expect_count(2) * 3;

    err1.push(err2);
    err3.append(err1);

    assert_eq!(err3.current_frames().len(), 3);
    assert_eq!(err3.frames().count(), count);
}

#[test]
fn push() {
    let mut err1 = MyError
        .into_report()
        .attach_printable("Not Supported")
        .expand();
    let err2 = MyError.into_report().attach_printable("Not Supported");
    let err3 = MyError.into_report().attach_printable("Not Supported");

    let count = expect_count(2) * 3;

    err1.push(err2);
    err1.push(err3);

    assert_eq!(err1.current_frames().len(), 3);
    assert_eq!(err1.frames().count(), count);
}

#[test]
fn extend() {
    let mut err1 = MyError
        .into_report()
        .attach_printable("Not Supported")
        .expand();
    let err2 = MyError.into_report().attach_printable("Not Supported");
    let err3 = MyError.into_report().attach_printable("Not Supported");

    err1.extend([err2, err3]);
    assert_eq!(err1.current_frames().len(), 3);
    assert_eq!(err1.frames().count(), expect_count(2) * 3);
}

#[test]
fn collect_single() {
    let report: Option<Report<[MyError]>> = vec![
        MyError.into_report(),
        MyError.into_report(),
        MyError.into_report(),
    ]
    .into_iter()
    .collect();

    let report = report.expect("should be some");
    assert_eq!(report.current_frames().len(), 3);
    assert_eq!(report.frames().count(), expect_count(1) * 3);
}

#[test]
fn collect_multiple() {
    let report: Option<Report<[MyError]>> = vec![
        MyError.into_report().expand(),
        MyError.into_report().expand(),
        MyError.into_report().expand(),
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
