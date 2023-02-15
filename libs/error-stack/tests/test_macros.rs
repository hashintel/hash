#![cfg_attr(nightly, feature(provide_any))]
#![cfg_attr(all(nightly, feature = "std"), feature(error_generic_member_access))]

mod common;

#[allow(clippy::wildcard_imports)]
use common::*;
use error_stack::{bail, ensure, report};

#[test]
fn report() {
    let report = capture_error(|| Err(report!(RootError))).attach_printable(PrintableA(0));
    assert!(report.contains::<RootError>());
    assert!(report.contains::<PrintableA>());
    assert!(!report.contains::<PrintableB>());
    assert_eq!(report.current_context(), &RootError);
    assert_eq!(report.frames().count(), expect_count(2));
    assert_eq!(
        remove_builtin_messages(messages(&report)),
        remove_builtin_messages(["printable A", "root error"])
    );

    let report = capture_error(|| Err(report!(report))).attach_printable(PrintableB(0));
    assert!(report.contains::<RootError>());
    assert!(report.contains::<PrintableA>());
    assert!(report.contains::<PrintableB>());
    assert_eq!(report.current_context(), &RootError);
    assert_eq!(report.frames().count(), expect_count(3));
    assert_eq!(
        remove_builtin_messages(messages(&report)),
        remove_builtin_messages(["printable B", "printable A", "root error"])
    );
}

#[test]
fn bail() {
    let report = capture_error(|| bail!(RootError)).attach_printable(PrintableA(0));
    assert!(report.contains::<RootError>());
    assert!(report.contains::<PrintableA>());
    assert!(!report.contains::<PrintableB>());
    assert_eq!(report.current_context(), &RootError);
    assert_eq!(report.frames().count(), expect_count(2));
    assert_eq!(
        remove_builtin_messages(messages(&report)),
        remove_builtin_messages(["printable A", "root error"])
    );

    let report = capture_error(|| bail!(report)).attach_printable(PrintableB(0));
    assert!(report.contains::<RootError>());
    assert!(report.contains::<PrintableA>());
    assert!(report.contains::<PrintableB>());
    assert_eq!(report.current_context(), &RootError);
    assert_eq!(report.frames().count(), expect_count(3));
    assert_eq!(
        remove_builtin_messages(messages(&report)),
        remove_builtin_messages(["printable B", "printable A", "root error"])
    );
}

#[test]
fn ensure() {
    capture_ok(|| {
        ensure!(true, RootError);
        Ok(())
    });
    let report = capture_error(|| {
        ensure!(false, RootError);
        Ok(())
    })
    .attach_printable(PrintableA(0));
    assert!(report.contains::<RootError>());
    assert!(report.contains::<PrintableA>());
    assert!(!report.contains::<PrintableB>());
    assert_eq!(report.current_context(), &RootError);
    assert_eq!(report.frames().count(), expect_count(2));
    assert_eq!(
        remove_builtin_messages(messages(&report)),
        remove_builtin_messages(["printable A", "root error"])
    );

    let report = capture_error(|| {
        ensure!(false, report);
        Ok(())
    })
    .attach_printable(PrintableB(0));
    assert!(report.contains::<RootError>());
    assert!(report.contains::<PrintableA>());
    assert!(report.contains::<PrintableB>());
    assert_eq!(report.current_context(), &RootError);
    assert_eq!(report.frames().count(), expect_count(3));
    assert_eq!(
        remove_builtin_messages(messages(&report)),
        remove_builtin_messages(["printable B", "printable A", "root error"])
    );
}
