#![cfg_attr(nightly, feature(provide_any))]
#![cfg_attr(all(nightly, feature = "std"), feature(backtrace))]

mod common;
use core::fmt::{Display, Formatter};

use common::*;
use error_stack::{report, Context};

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

    assert_eq!(err3.current().len(), 3);
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

    assert_eq!(err1.current().len(), 3);
    assert_eq!(err1.frames().count(), count);
}
