#![cfg(feature = "hooks")]
#![cfg_attr(nightly, feature(provide_any))]
#![cfg_attr(
    all(nightly, feature = "std"),
    feature(backtrace, error_generic_member_access)
)]

mod common;

use common::*;
use error_stack::Report;

#[test]
fn debug() {
    Report::set_debug_hook(|_report, fmt| fmt.write_str("debug hook")).expect("Unable to set hook");
    assert_eq!(format!("{:?}", create_report()), "debug hook");

    let err = Report::set_debug_hook(|_, _| Ok(())).expect_err("Could set the hook twice");
    assert_eq!(format!("{:?}", err.current_context()), "HookAlreadySet");
}

#[test]
fn display() {
    Report::set_display_hook(|_report, fmt| fmt.write_str("display hook"))
        .expect("Unable to set hook");
    assert_eq!(create_report().to_string(), "display hook");

    let err = Report::set_display_hook(|_, _| Ok(())).expect_err("Could set the hook twice");
    assert_eq!(
        err.current_context().to_string(),
        "Hook can only be set once"
    );
}
