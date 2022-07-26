#![cfg_attr(nightly, feature(provide_any))]
#![cfg_attr(all(nightly, feature = "std"), feature(backtrace))]

mod common;
use common::*;
#[cfg(all(nightly, feature = "experimental"))]
use error_stack::fmt::DebugDiagnostic;
#[cfg(feature = "hooks")]
use error_stack::fmt::{HookContext, Hooks, Line};
#[cfg(feature = "hooks")]
use error_stack::Report;
use insta::assert_snapshot;
#[cfg(feature = "glyph")]
use owo_colors::set_override;
use rusty_fork::rusty_fork_test;
use serial_test::serial;

#[cfg(feature = "glyph")]
fn force_color() {
    set_override(false);
}

#[cfg(not(feature = "glyph"))]
fn force_color() {}

#[allow(unused_mut)]
fn snap_suffix() -> String {
    let mut suffix: Vec<&'static str> = vec![];

    #[cfg(feature = "spantrace")]
    if supports_spantrace() {
        suffix.push("spantrace");
    }

    #[cfg(all(nightly, feature = "std"))]
    if supports_backtrace() {
        suffix.push("backtrace");
    }

    #[cfg(feature = "glyph")]
    {
        suffix.push("glyph");
    }

    force_color();

    suffix.join(".")
}

/// This is taken from the rstest pattern https://insta.rs/docs/patterns/
macro_rules! set_snapshot_suffix {
    () => {{
        let mut settings = insta::Settings::clone_current();
        settings.set_snapshot_suffix(snap_suffix());
        settings.bind_to_thread();
    }};
}

/// The provider API extension via `DebugDiagnostic` is only available under experimental and
/// nightly
#[test]
#[cfg(all(nightly, feature = "experimental"))]
fn provider() {
    set_snapshot_suffix!();

    let mut report = create_report().attach_printable(PrintableA(0));
    report.extend_one({
        let mut report = create_report().attach_printable(PrintableB(1));

        report.extend_one(
            create_report()
                .attach(DebugDiagnostic::next("ABC".to_owned()))
                .attach(AttachmentA(1))
                .attach_printable(PrintableB(1)),
        );

        report.attach(AttachmentA(2)).attach_printable("Test")
    });

    assert_snapshot!(format!("{report:?}"));
}

/// The provider API extension via `DebugDiagnostic` is only available under experimental and
/// nightly
#[test]
#[cfg(all(nightly, feature = "experimental"))]
fn provider_ext() {
    set_snapshot_suffix!();

    let mut report = create_report().attach_printable(PrintableA(0));
    report.extend_one({
        let mut report = create_report().attach_printable(PrintableB(1));

        report.extend_one(
            create_report()
                .attach(DebugDiagnostic::next("ABC".to_owned()))
                .attach(AttachmentA(1))
                .attach_printable(PrintableB(1)),
        );

        report.attach(AttachmentA(2)).attach_printable("Test")
    });

    assert_snapshot!(format!("{report:#?}"));
}

#[test]
fn linear() {
    set_snapshot_suffix!();

    let report = create_report()
        .attach_printable(PrintableA(0))
        .attach(AttachmentA)
        .attach(AttachmentB)
        .change_context(ContextA(0))
        .attach_printable(PrintableB(0))
        .attach(AttachmentB)
        .change_context(ContextB(0))
        .attach_printable("Printable C");

    assert_snapshot!(format!("{report:?}"));
}

#[test]
fn linear_ext() {
    set_snapshot_suffix!();

    let report = create_report()
        .attach_printable(PrintableA(0))
        .attach(AttachmentA)
        .attach(AttachmentB)
        .change_context(ContextA(0))
        .attach_printable(PrintableB(0))
        .attach(AttachmentB)
        .change_context(ContextB(0))
        .attach_printable("Printable C");

    assert_snapshot!(format!("{report:#?}"));
}

#[test]
fn complex() {
    set_snapshot_suffix!();

    let mut report = create_report().attach_printable(PrintableA(0));
    report.extend_one({
        let mut report = create_report().attach_printable(PrintableB(1));

        report.extend_one(
            create_report()
                .attach(AttachmentB(0))
                .attach(AttachmentA(1))
                .attach_printable(PrintableB(1)),
        );

        report.attach(AttachmentA(2)).attach_printable("Test")
    });

    assert_snapshot!(format!("{report:?}"));
}

#[test]
fn location_edge_case() {
    set_snapshot_suffix!();

    let report = create_report();

    assert_snapshot!(format!("{report:?}"));
}

#[cfg(feature = "hooks")]
rusty_fork_test! {
#[test]
#[serial]
fn hook() {
    set_snapshot_suffix!();

    let report = create_report().attach(2u32);

    Report::install_hook(Hooks::new().push(|_: &u32| Line::next("unsigned 32bit integer")))
        .unwrap();

    assert_snapshot!(format!("{report:?}"));
}

#[test]
#[serial]
fn hook_context() {
    set_snapshot_suffix!();

    let report = create_report().attach(2u32);

    Report::install_hook(Hooks::new().push(|_: &u32, ctx: &mut HookContext<u32>| {
        Line::next(format!("unsigned 32bit integer (No. {})", ctx.incr()))
    }))
    .unwrap();

    assert_snapshot!(format!("{report:?}"));
}

#[test]
#[serial]
fn hook_stack() {
    set_snapshot_suffix!();

    let report = create_report().attach(1u32).attach(2u64);

    Report::install_hook(
        Hooks::new()
            .push(|_: &u32| Line::next("unsigned 32bit integer"))
            .push(|_: &u64| Line::next("unsigned 64-bit integer")),
    )
    .unwrap();

    assert_snapshot!(format!("{report:?}"));
}

#[test]
#[serial]
fn hook_combine() {
    set_snapshot_suffix!();

    let report = create_report() //
        .attach(1u32)
        .attach(2u64)
        .attach(3u16);

    let other = Hooks::new()
        .push(|_: &u32| Line::next("u32 (other)"))
        .push(|_: &u16| Line::next("u16 (other)"));

    Report::install_hook(
        Hooks::new()
            .push(|_: &u32| Line::next("u32"))
            .push(|_: &u64| Line::next("u64"))
            .combine(other),
    )
    .unwrap();

    assert_snapshot!(format!("{report:?}"));
}

#[test]
#[serial]
fn hook_defer() {
    set_snapshot_suffix!();

    let report = create_report() //
        .attach(1u32)
        .attach(2u64)
        .attach(3u16);

    Report::install_hook(
        Hooks::new()
            .push(|_: &u32| Line::defer("u32"))
            .push(|_: &u64| Line::next("u64"))
            .push(|_: &u16| Line::defer("u16")),
    )
    .unwrap();

    assert_snapshot!(format!("{report:?}"));
}

#[test]
#[serial]
fn hook_decr() {
    set_snapshot_suffix!();

    let report = create_report() //
        .attach(1u32)
        .attach(2u32)
        .attach(3u32);

    Report::install_hook(
        Hooks::new()
            .push(|_: &u32, ctx: &mut HookContext<u32>| Line::next(format!("{}", ctx.decr()))),
    )
    .unwrap();

    assert_snapshot!(format!("{report:?}"));
}

#[test]
#[serial]
fn hook_incr() {
    set_snapshot_suffix!();

    let report = create_report() //
        .attach(1u32)
        .attach(2u32)
        .attach(3u32);

    Report::install_hook(
        Hooks::new()
            .push(|_: &u32, ctx: &mut HookContext<u32>| Line::next(format!("{}", ctx.incr()))),
    )
    .unwrap();

    assert_snapshot!(format!("{report:?}"));
}
}
