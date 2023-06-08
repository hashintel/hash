#![cfg(any(feature = "eyre", feature = "anyhow"))]
#![cfg_attr(nightly, feature(provide_any))]
#![cfg_attr(
    all(nightly, feature = "std"),
    feature(backtrace_frames, error_generic_member_access)
)]

mod common;

#[allow(clippy::wildcard_imports)]
use common::*;
use error_stack::IntoReportCompat;
#[cfg(feature = "std")]
use error_stack::Report;

#[test]
#[cfg(any(nightly, feature = "std"))]
fn error() {
    let report = create_report().change_context(ContextA(10));
    let error_ref = report.as_error();
    assert_eq!(error_ref.to_string(), "context A");
    #[cfg(nightly)]
    assert_eq!(
        *core::any::request_ref::<u32>(error_ref).expect("requested value not found"),
        10
    );

    let error = report.into_error();
    assert_eq!(error.to_string(), "context A");
    #[cfg(nightly)]
    assert_eq!(
        *core::any::request_ref::<u32>(&error).expect("requested value not found"),
        10
    );
}

#[test]
#[cfg(all(feature = "std", feature = "anyhow"))]
fn anyhow() {
    let anyhow: Result<(), _> = Err(anyhow::anyhow!(RootError)
        .context(PrintableA(0))
        .context(PrintableB(0)));

    let report = create_report()
        .attach_printable(PrintableA(0))
        .attach_printable(PrintableB(0));

    #[allow(unused_mut)]
    let mut report_messages = messages(&report);

    let anyhow_report = anyhow
        .into_report()
        .expect_err("should have returned error");
    #[allow(unused_mut)]
    let mut anyhow_messages = messages(&anyhow_report);

    assert_eq!(
        remove_builtin_messages(anyhow_messages.into_iter().rev()),
        remove_builtin_messages(report_messages),
    );
}

#[test]
#[cfg(all(not(feature = "std"), feature = "anyhow"))]
fn anyhow_nostd() {
    let anyhow: Result<(), _> = Err(anyhow::anyhow!(RootError)
        .context(PrintableA(0))
        .context(PrintableB(0)));

    let report = anyhow
        .into_report()
        .expect_err("should have returned error");
    let expected_output = ["Location", "printable B"];
    for (anyhow, expected) in messages(&report).into_iter().zip(expected_output) {
        assert_eq!(anyhow, expected);
    }
}

#[test]
#[cfg(all(nightly, feature = "std", feature = "anyhow"))]
fn anyhow_backtrace() {
    let error = anyhow::anyhow!("test error");
    let error_backtrace = error.backtrace();
    let error_backtrace_len = error_backtrace.frames().len();
    #[cfg(not(miri))]
    let error_backtrace_string = error_backtrace.to_string();

    let report: Report<anyhow::Error> = Err::<(), _>(error)
        .into_report()
        .expect_err("should have returned error");
    let report_backtrace = report
        .request_ref::<std::backtrace::Backtrace>()
        .next()
        .expect("No backtrace captured");
    let report_backtrace_len = report_backtrace.frames().len();
    #[cfg(not(miri))]
    let report_backtrace_string = report_backtrace.to_string();

    assert_eq!(error_backtrace_len, report_backtrace_len);
    #[cfg(not(miri))]
    assert_eq!(error_backtrace_string, report_backtrace_string);
}

#[test]
#[cfg(feature = "anyhow")]
fn anyhow_output() {
    let anyhow = anyhow::anyhow!(RootError)
        .context(PrintableA(0))
        .context(PrintableB(0));

    let anyhow_debug_normal = format!("{anyhow:?}");
    let anyhow_debug_extended = format!("{anyhow:#?}");
    let anyhow_display_normal = format!("{anyhow:}");
    let anyhow_display_extended = format!("{anyhow:#}");

    let anyhow_report = Err::<(), _>(anyhow)
        .into_report()
        .expect_err("should have returned error");
    let context = anyhow_report.current_context();

    let context_debug_normal = format!("{context:?}");
    let context_debug_extended = format!("{context:#?}");
    let context_display_normal = format!("{context:}");
    let context_display_extended = format!("{context:#}");

    assert_eq!(anyhow_debug_normal, context_debug_normal);
    assert_eq!(anyhow_debug_extended, context_debug_extended);
    assert_eq!(anyhow_display_normal, context_display_normal);
    assert_eq!(anyhow_display_extended, context_display_extended);
}

#[cfg(feature = "eyre")]
fn install_eyre_hook() {
    use std::sync::Once;

    static ONCE: Once = Once::new();

    ONCE.call_once(|| {
        eyre::set_hook(Box::new(eyre::DefaultHandler::default_with)).expect("Could not set hook");
    });
}

#[test]
#[cfg(feature = "eyre")]
#[cfg_attr(
    miri,
    ignore = "bug: miri is failing for `eyre`, this is unrelated to our implementation"
)]
fn eyre() {
    install_eyre_hook();

    let eyre: Result<(), _> = Err(eyre::eyre!(RootError)
        .wrap_err(PrintableA(0))
        .wrap_err(PrintableB(0)));

    let report = create_report()
        .attach_printable(PrintableA(0))
        .attach_printable(PrintableB(0));

    #[allow(unused_mut)]
    let mut report_messages = messages(&report);

    let eyre_report = eyre.into_report().expect_err("should have returned error");
    #[allow(unused_mut)]
    let mut eyre_messages = messages(&eyre_report);

    assert_eq!(
        remove_builtin_messages(eyre_messages.into_iter().rev()),
        remove_builtin_messages(report_messages),
    );
}

#[test]
#[cfg(all(nightly, feature = "eyre"))]
#[ignore = "bug: `eyre` currently does not provide a backtrace`"]
fn eyre_backtrace() {
    let error = eyre::eyre!("test error");
    let error_backtrace = error
        .request_ref::<std::backtrace::Backtrace>()
        .expect("no backtrace captured");
    let error_backtrace_len = error_backtrace.frames().len();
    let error_backtrace_string = error_backtrace.to_string();

    let report: Report<eyre::Error> = Err::<(), _>(error)
        .into_report()
        .expect_err("should have returned error");
    let report_backtrace = report
        .request_ref::<std::backtrace::Backtrace>()
        .next()
        .expect("No backtrace captured");
    let report_backtrace_len = report_backtrace.frames().len();
    let report_backtrace_string = report_backtrace.to_string();

    assert_eq!(error_backtrace_len, report_backtrace_len);
    assert_eq!(error_backtrace_string, report_backtrace_string);
}

#[test]
#[cfg(feature = "eyre")]
#[cfg_attr(
    miri,
    ignore = "bug: miri is failing for `eyre`, this is unrelated to our implementation"
)]
fn eyre_output() {
    install_eyre_hook();

    let eyre = eyre::eyre!(RootError)
        .wrap_err(PrintableA(0))
        .wrap_err(PrintableB(0));

    let eyre_debug_normal = format!("{eyre:?}");
    let eyre_debug_extended = format!("{eyre:#?}");
    let eyre_display_normal = format!("{eyre:}");
    let eyre_display_extended = format!("{eyre:#}");

    let eyre_report = Err::<(), _>(eyre)
        .into_report()
        .expect_err("should have returned error");
    let context = eyre_report.current_context();

    let context_debug_normal = format!("{context:?}");
    let context_debug_extended = format!("{context:#?}");
    let context_display_normal = format!("{context:}");
    let context_display_extended = format!("{context:#}");

    assert_eq!(eyre_debug_normal, context_debug_normal);
    assert_eq!(eyre_debug_extended, context_debug_extended);
    assert_eq!(eyre_display_normal, context_display_normal);
    assert_eq!(eyre_display_extended, context_display_extended);
}
