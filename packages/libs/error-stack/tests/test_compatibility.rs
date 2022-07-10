#![cfg_attr(nightly, feature(provide_any))]
#![cfg_attr(all(nightly, feature = "std"), feature(backtrace, backtrace_frames))]
#![cfg(any(feature = "eyre", feature = "anyhow"))]

mod common;

#[cfg(all(nightly, feature = "std"))]
use std::{backtrace::Backtrace, error::Error};

use common::*;
use error_stack::compat::IntoReportCompat;

#[test]
#[cfg(all(feature = "std", feature = "anyhow"))]
fn anyhow() {
    let anyhow: Result<(), _> = Err(anyhow::anyhow!(RootError)
        .context(PrintableA(0))
        .context(PrintableB(0)));
    let anyhow_report = anyhow.into_report().unwrap_err();

    let report = create_report()
        .attach_printable(PrintableA(0))
        .attach_printable(PrintableB(0));

    for (anyhow, error_stack) in messages(&anyhow_report)
        .into_iter()
        .rev()
        .zip(messages(&report))
    {
        assert_eq!(anyhow, error_stack);
    }
}

#[test]
#[cfg(all(not(feature = "std"), feature = "anyhow"))]
fn anyhow_nostd() {
    let anyhow: Result<(), _> = Err(anyhow::anyhow!(RootError)
        .context(PrintableA(0))
        .context(PrintableB(0)));

    let report = anyhow.into_report().unwrap_err();
    let expected_output = ["Printable B"];
    for (anyhow, expected) in messages(&report).into_iter().zip(expected_output) {
        assert_eq!(anyhow, expected);
    }
}

#[test]
#[cfg(all(nightly, feature = "anyhow"))]
fn anyhow_provider() {
    let anyhow = anyhow::anyhow!(RootError)
        .context(PrintableA(0))
        .context(PrintableB(0));
    let debug_output = format!("{anyhow:?}");
    let report = Err::<(), _>(anyhow).into_report().unwrap_err();

    let requested_anyhow = report.request_ref::<anyhow::Error>().next().unwrap();
    assert_eq!(debug_output, format!("{:?}", requested_anyhow));
}

#[test]
#[cfg(all(nightly, feature = "std", feature = "anyhow"))]
fn anyhow_backtrace() {
    let error = ErrorB::new(0);
    let error_backtrace = error.backtrace().expect("No backtrace captured");
    let error_backtrace_len = error_backtrace.frames().len();
    #[cfg(not(miri))]
    let error_backtrace_string = error_backtrace.to_string();

    let report = Err::<(), _>(anyhow::anyhow!(error))
        .into_report()
        .unwrap_err();
    let frame = report.frames().next().unwrap();

    let report_backtrace = frame
        .request_ref::<Backtrace>()
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

    let anyhow_report = Err::<(), _>(anyhow).into_report().unwrap_err();
    let context = anyhow_report.current_context();

    let context_debug_normal = format!("{context:?}");
    let context_debug_extended = format!("{context:#?}");
    let context_display_normal = format!("{context:}");
    let context_display_extended = format!("{context:#}");

    assert_eq!(anyhow_debug_normal, context_debug_normal);
    assert_eq!(anyhow_debug_extended, context_debug_extended);
    assert_eq!(anyhow_display_normal, context_display_normal);
    assert_eq!(anyhow_display_extended, context_display_extended);

    let anyhow = context.as_anyhow();
    let anyhow_debug_normal = format!("{anyhow:?}");
    let anyhow_debug_extended = format!("{anyhow:#?}");
    let anyhow_display_normal = format!("{anyhow:}");
    let anyhow_display_extended = format!("{anyhow:#}");

    assert_eq!(anyhow_debug_normal, context_debug_normal);
    assert_eq!(anyhow_debug_extended, context_debug_extended);
    assert_eq!(anyhow_display_normal, context_display_normal);
    assert_eq!(anyhow_display_extended, context_display_extended);
}

#[cfg(feature = "eyre")]
fn install_eyre_hook() {
    static ONCE: std::sync::Once = std::sync::Once::new();
    ONCE.call_once(|| {
        eyre::set_hook(Box::new(eyre::DefaultHandler::default_with)).expect("Could not set hook");
    })
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
    let eyre_report = eyre.into_report().unwrap_err();

    let report = create_report()
        .attach_printable(PrintableA(0))
        .attach_printable(PrintableB(0));

    for (eyre, error_stack) in messages(&eyre_report)
        .into_iter()
        .rev()
        .zip(messages(&report))
    {
        assert_eq!(eyre, error_stack);
    }
}

#[test]
#[cfg(all(nightly, feature = "eyre"))]
#[cfg_attr(
    miri,
    ignore = "bug: miri is failing for `eyre`, this is unrelated to our implementation"
)]
fn eyre_provider() {
    install_eyre_hook();

    let eyre = eyre::anyhow!(RootError)
        .wrap_err(PrintableA(0))
        .wrap_err(PrintableB(0));
    let debug_output = format!("{eyre:?}");
    let report = Err::<(), _>(eyre).into_report().unwrap_err();

    let requested_eyre = report.request_ref::<eyre::Report>().next().unwrap();
    assert_eq!(debug_output, format!("{:?}", requested_eyre));
}

#[test]
#[cfg(all(nightly, feature = "std", feature = "eyre"))]
#[cfg_attr(
    miri,
    ignore = "bug: miri is failing for `eyre`, this is unrelated to our implementation"
)]
fn eyre_backtrace() {
    install_eyre_hook();

    let error = ErrorB::new(0);
    let error_backtrace = error
        .backtrace()
        .expect("No backtrace captured")
        .to_string();

    let report = Err::<(), _>(eyre::eyre!(error)).into_report().unwrap_err();
    let frame = report.frames().next().unwrap();

    let backtrace = frame
        .request_ref::<Backtrace>()
        .expect("No backtrace captured");

    assert_eq!(error_backtrace, backtrace.to_string());
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

    let eyre_report = Err::<(), _>(eyre).into_report().unwrap_err();
    let context = eyre_report.current_context();

    let context_debug_normal = format!("{context:?}");
    let context_debug_extended = format!("{context:#?}");
    let context_display_normal = format!("{context:}");
    let context_display_extended = format!("{context:#}");

    assert_eq!(eyre_debug_normal, context_debug_normal);
    assert_eq!(eyre_debug_extended, context_debug_extended);
    assert_eq!(eyre_display_normal, context_display_normal);
    assert_eq!(eyre_display_extended, context_display_extended);

    let eyre = context.as_eyre();
    let eyre_debug_normal = format!("{eyre:?}");
    let eyre_debug_extended = format!("{eyre:#?}");
    let eyre_display_normal = format!("{eyre:}");
    let eyre_display_extended = format!("{eyre:#}");

    assert_eq!(eyre_debug_normal, context_debug_normal);
    assert_eq!(eyre_debug_extended, context_debug_extended);
    assert_eq!(eyre_display_normal, context_display_normal);
    assert_eq!(eyre_display_extended, context_display_extended);
}
