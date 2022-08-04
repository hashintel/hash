#![cfg_attr(nightly, feature(provide_any))]
#![cfg_attr(all(nightly, feature = "std"), feature(backtrace))]
// can be considered safe, because we only check the output, which in itself does not use **any**
// unsafe code.
#![cfg(not(miri))]

mod common;
use common::*;
#[cfg(all(nightly, feature = "experimental"))]
use error_stack::fmt::DebugDiagnostic;
#[cfg(feature = "hooks")]
use error_stack::fmt::{HookContext, Hooks, Line};
#[allow(unused_imports)]
use error_stack::Report;
use insta::assert_snapshot;
use once_cell::sync::Lazy;
#[cfg(feature = "glyph")]
use owo_colors::set_override;
use regex::Regex;
#[cfg(feature = "spantrace")]
use tracing_error::ErrorLayer;
#[cfg(feature = "spantrace")]
use tracing_subscriber::layer::SubscriberExt;

static RE_BACKTRACE_FRAME: Lazy<Regex> =
    Lazy::new(|| Regex::new(r#"(backtrace with )\d+( frames \(\d+\))"#).unwrap());

fn redact(value: &str) -> String {
    let mut extra = false;
    let mut redact = false;
    let mut notify = false;

    value
        .lines()
        .filter_map(|line| {
            // backtraces can be of different lengths depending on the OS and machine and co.
            // this replaces the amount with `[n]`.
            if !extra && RE_BACKTRACE_FRAME.is_match(line) {
                let line = RE_BACKTRACE_FRAME.replace_all(line, "$1[n]$2").into_owned();
                return Some(line);
            }

            if line.starts_with(&"━".repeat(40)) {
                extra = true;
            }

            if extra && (line.starts_with("Backtrace No.") | line.starts_with("Span Trace No.")) {
                redact = true;
                notify = true;

                return Some(line.to_owned());
            }

            if redact {
                // the line is redacted
                if line.starts_with("  ") {
                    if notify {
                        notify = false;
                        return Some("   [redacted]".to_owned());
                    }

                    return None;
                } else {
                    redact = false;
                    notify = false;
                }
            }

            Some(line.to_owned())
        })
        .fold(String::new(), |mut acc, line| {
            acc.push('\n');
            acc.push_str(&line);
            acc
        })
        .trim_start_matches('\n')
        .to_owned()
}

#[cfg(feature = "spantrace")]
fn install_tracing_subscriber() {
    static ONCE: std::sync::Once = std::sync::Once::new();
    ONCE.call_once(|| {
        tracing::subscriber::set_global_default(
            tracing_subscriber::Registry::default().with(ErrorLayer::default()),
        )
        .expect("Could not set tracing subscriber");
    })
}

#[cfg(not(feature = "spantrace"))]
fn install_tracing_subscriber() {}

#[cfg(not(all(nightly, feature = "std")))]
fn install_backtrace() {
    std::env::set_var("RUST_LIB_BACKTRACE", "0");
}

#[cfg(all(nightly, feature = "std"))]
fn install_backtrace() {
    std::env::set_var("RUST_LIB_BACKTRACE", "1");
}

#[cfg(feature = "glyph")]
fn force_color() {
    owo_colors::set_override(false);
}

#[cfg(not(feature = "glyph"))]
fn force_color() {}

fn snap_suffix() -> String {
    install_tracing_subscriber();
    install_backtrace();

    #[allow(unused_mut)]
    let mut suffix: Vec<&'static str> = vec![];

    #[cfg(feature = "spantrace")]
    {
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

    suffix.join("-")
}

/// Overwrite to create spantraces when necessary.
#[cfg(feature = "spantrace")]
pub fn create_report() -> Report<RootError> {
    #[tracing::instrument]
    fn func_b() -> error_stack::Result<(), RootError> {
        create_error()
    }

    #[tracing::instrument]
    fn func_a() -> error_stack::Result<(), RootError> {
        func_b()
    }

    capture_error(func_a)
}

/// This is taken from the rstest pattern https://insta.rs/docs/patterns/
macro_rules! set_snapshot_suffix {
    () => {{
        let mut settings = insta::Settings::clone_current();
        settings.set_snapshot_suffix(snap_suffix());
        #[allow(deprecated)]
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

    assert_snapshot!(redact(&format!("{report:?}")));
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

    assert_snapshot!(redact(&format!("{report:#?}")));
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

    assert_snapshot!(redact(&format!("{report:?}")));
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

    assert_snapshot!(redact(&format!("{report:#?}")));
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

    assert_snapshot!(redact(&format!("{report:?}")));
}

#[test]
fn location_edge_case() {
    set_snapshot_suffix!();

    let report = create_report();

    assert_snapshot!(redact(&format!("{report:?}")));
}

#[cfg(feature = "hooks")]
mod hooks {
    //! To be able to set `OnceCell` multiple times we need to run each of them in a separate fork,
    //! this works without fault in `nextest` you cannot guarantee that this is always the case.
    //! This is mostly undocumented behavior.

    use super::*;

    #[test]
    fn hook() {
        set_snapshot_suffix!();

        let report = create_report().attach(2u32);

        Report::install_hook(Hooks::new().push(|_: &u32| Line::next("unsigned 32bit integer")))
            .unwrap();

        assert_snapshot!(redact(&format!("{report:?}")));
    }

    #[test]
    fn hook_context() {
        set_snapshot_suffix!();

        let report = create_report().attach(2u32);

        Report::install_hook(Hooks::new().push(|_: &u32, ctx: &mut HookContext<u32>| {
            Line::next(format!("unsigned 32bit integer (No. {})", ctx.incr()))
        }))
        .unwrap();

        assert_snapshot!(redact(&format!("{report:?}")));
    }

    #[test]
    fn hook_stack() {
        set_snapshot_suffix!();

        let report = create_report().attach(1u32).attach(2u64);

        Report::install_hook(
            Hooks::new()
                .push(|_: &u32| Line::next("unsigned 32bit integer"))
                .push(|_: &u64| Line::next("unsigned 64-bit integer")),
        )
        .unwrap();

        assert_snapshot!(redact(&format!("{report:?}")));
    }

    #[test]
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

        assert_snapshot!(redact(&format!("{report:?}")));
    }

    #[test]
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

        assert_snapshot!(redact(&format!("{report:?}")));
    }

    #[test]
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

        assert_snapshot!(redact(&format!("{report:?}")));
    }

    #[test]
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

        assert_snapshot!(redact(&format!("{report:?}")));
    }
}
