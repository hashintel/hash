#![cfg_attr(nightly, feature(provide_any))]
// can be considered safe, because we only check the output, which in itself does not use **any**
// unsafe code.
#![cfg(not(miri))]
#![cfg_attr(
    all(nightly, feature = "std"),
    feature(backtrace, error_generic_member_access)
)]

mod common;
use common::*;
#[cfg(feature = "hooks")]
use error_stack::fmt::{Emit, HookContext, Hooks};
#[allow(unused_imports)]
use error_stack::Report;
use insta::assert_snapshot;
use once_cell::sync::Lazy;
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
fn setup_tracing() {
    static ONCE: std::sync::Once = std::sync::Once::new();
    ONCE.call_once(|| {
        tracing::subscriber::set_global_default(
            tracing_subscriber::Registry::default().with(ErrorLayer::default()),
        )
        .expect("Could not set tracing subscriber");
    })
}

#[cfg(not(feature = "spantrace"))]
fn setup_tracing() {}

#[cfg(not(all(nightly, feature = "std")))]
fn setup_backtrace() {
    std::env::set_var("RUST_LIB_BACKTRACE", "0");
}

#[cfg(all(nightly, feature = "std"))]
fn setup_backtrace() {
    std::env::set_var("RUST_LIB_BACKTRACE", "1");
}

#[cfg(feature = "glyph")]
fn setup_color() {
    owo_colors::set_override(false);
}

#[cfg(not(feature = "glyph"))]
fn setup_color() {}

fn setup() {
    setup_tracing();
    setup_backtrace();
    setup_color();
}

fn snap_suffix() -> String {
    setup();

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
fn set_snapshot_suffix() -> impl Drop {
    let mut settings = insta::Settings::clone_current();
    settings.set_snapshot_suffix(snap_suffix());
    settings.bind_to_scope()
}

/// Generate the `Report` for:
///
/// ```text
///                    P 1
///                     │
///                     ▼
///                    P 2
///                     │
///                     ▼
///                    C 1
///                     │
///                     ▼
///                ┌───P 3───┐
///                │         │
///                ▼         ▼
///               P 4       P 5
///                │         │
///                ▼         ▼
///               C 2      C 10
///                │         │
///                ▼         ▼
///               P 6       P 7
///                │         │
///                ▼         ▼
///          Root Error 1   C 3
///                          │
///                          ▼
///                         P 8
///                          │
///                          ▼
///       ┌─────────────────P 9─────────────────┬─────────────┐
///       │                  │                  │             │
///       │                  │                  │             │
///       ▼                  ▼                  ▼             ▼
///      C 4               P 16               P 11          P 12
///       │                  │                  │             │
///       ▼                  ▼                  ▼             ▼
/// Root Error 2       ┌───P 10───┐            C 9           C 6
///                    │          │             │             │
///                    ▼          ▼             ▼             ▼
///                  P 13       P 14      Root Error 5       C 7
///                    │          │                           │
///                    ▼          ▼                           ▼
///                   C 8       P 15                    Root Error 6
///                    │          │
///                    ▼          ▼
///              Root Error 3    C 5
///                               │
///                               ▼
///                         Root Error 4
/// ```
///
/// `P = Printable`, `C = Context`
fn create_sources_nested() -> Report<ContextA> {
    let r4 = create_report()
        .change_context(ContextA(5))
        .attach_printable("15")
        .attach_printable("14");

    let r6 = create_report()
        .change_context(ContextA(7))
        .change_context(ContextA(6))
        .attach_printable("12");

    let r5 = create_report()
        .change_context(ContextA(9))
        .attach_printable("11");

    let mut r3 = create_report()
        .change_context(ContextA(8))
        .attach_printable("13");

    r3.extend_one(r4);
    let r3 = r3.attach_printable("10").attach_printable("16");

    let mut r2 = create_report().change_context(ContextA(4));

    r2.extend_one(r3);
    r2.extend_one(r5);
    r2.extend_one(r6);

    let r2 = r2
        .attach_printable("9")
        .attach_printable("8")
        .change_context(ContextA(3))
        .attach_printable("7")
        .change_context(ContextA(10))
        .attach_printable("5");

    let mut r1 = create_report()
        .attach_printable("6")
        .change_context(ContextA(2))
        .attach_printable("4");

    r1.extend_one(r2);

    r1.attach_printable("3")
        .change_context(ContextA(1))
        .attach_printable("2")
        .attach_printable("1")
}

/// This is the main test, to test all different parts at once,
/// and demonstrates that the rendering algorithm works at arbitrary depth.
#[test]
fn sources_nested() {
    let _guard = set_snapshot_suffix();

    let report = create_sources_nested();

    assert_snapshot!(redact(&format!("{report:?}")));
}

#[test]
fn sources_nested_alternate() {
    let _guard = set_snapshot_suffix();

    let report = create_sources_nested();

    assert_snapshot!(redact(&format!("{report:#?}")));
}

#[cfg(all(
    nightly,
    feature = "hooks",
    feature = "spantrace",
    feature = "glyph",
    feature = "experimental"
))]
mod full {
    //! To be able to set `OnceCell` multiple times we need to run each of them in a separate fork,
    //! this works without fault in `nextest` you cannot guarantee that this is always the case.
    //! This is mostly undocumented behavior.
    //!
    //! Why so many cfg guards?
    //! What was found during initial development of the feature was,
    //! that a complete test of all tests with snapshots on every possible feature combination
    //! was infeasible, as this would lead to *a lot* of different snapshots.
    //!
    //! Changes in snapshots (this includes adding or removing lines in the test code) results in 9
    //! different snapshots, which *all* basically test the same permutation:
    //! * Does glyph/non-glyph output look nice?
    //! * Does rendering work?
    //! * Do the builtin hooks (`Backtrace` and `SpanTrace`) work?
    //!
    //! Does any combination of those work together?
    //! Therefore most of them are redundant, this means that we can cut down on the amount of
    //! snapshots that are generated.
    //! This does *not* impact speed, but makes it easier to look through all snapshots, which means
    //! that instead of 118 new snapshots once a code line changes, one just needs to look over
    //! < 30, which is a lot more manageable.
    //!
    //! There are still some big snapshot tests, which are used evaluate all of the above.

    #[cfg(all(nightly, feature = "experimental"))]
    use error_stack::fmt::DebugDiagnostic;

    use super::*;

    /// The provider API extension via `DebugDiagnostic` is only available under experimental and
    /// nightly
    #[test]
    fn provider() {
        setup();

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
    fn provider_ext() {
        setup();

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
        setup();

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
        setup();

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

    /// Generate the `Debug` for
    ///
    /// ```text
    ///         [A] B
    ///            |
    ///         [C] A
    ///            |
    ///         [A] A
    ///      /     |    \
    ///  [P] A  [P] B  [P] B
    ///    |       |      |
    ///   Root   Root    Root
    /// ```
    ///
    /// This should demonstrate that we're able to generate with multiple groups at the same time.
    #[test]
    fn sources() {
        setup();

        let mut root1 = create_report().attach_printable(PrintableA(1));
        let root2 = create_report().attach_printable(PrintableB(2));
        let root3 = create_report().attach_printable(PrintableB(3));

        root1.extend_one(root2);
        root1.extend_one(root3);

        let report = root1
            .attach(AttachmentA(1))
            .change_context(ContextA(2))
            .attach(AttachmentB(2));

        assert_snapshot!(redact(&format!("{report:?}")));
    }

    /// Generate the `Debug` for:
    ///
    /// ```text
    ///         [A] B
    ///            |
    ///         [C] A
    ///            |
    ///         [A] A
    ///           /  \
    ///       [P] A  [A] A
    ///         |       |   \
    ///        Root  [P] B  [P] B
    ///                 |      |
    ///               Root    Root
    /// ```
    ///
    /// and should demonstrate that "transparent" groups, groups which do not have a change in
    /// context, are still handled gracefully.
    #[test]
    fn sources_transparent() {
        setup();

        let report = {
            let mut report = create_report().attach_printable(PrintableA(1));

            report.extend_one({
                let mut report = create_report().attach_printable(PrintableB(2));

                report.extend_one(create_report().attach_printable(PrintableB(3)));

                report.attach_printable(PrintableA(4))
            });

            report
                .attach(AttachmentA(1))
                .change_context(ContextA(2))
                .attach(AttachmentB(2))
        };

        assert_snapshot!(redact(&format!("{report:?}")));
    }

    #[test]
    fn complex() {
        setup();

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

        // force the generation of a tree node
        let report = report
            .change_context(ContextA(2))
            .attach_printable(PrintableA(2));

        assert_snapshot!(redact(&format!("{report:?}")));
    }

    #[test]
    fn hook() {
        setup();

        let report = create_report().attach(2u32);

        Report::install_hook(Hooks::new().push(|_: &u32| Emit::next("unsigned 32bit integer")))
            .unwrap();

        assert_snapshot!(redact(&format!("{report:?}")));
    }

    #[test]
    fn hook_context() {
        setup();

        let report = create_report().attach(2u32);

        Report::install_hook(Hooks::new().push(|_: &u32, ctx: &mut HookContext<u32>| {
            Emit::next(format!("unsigned 32bit integer (No. {})", ctx.increment()))
        }))
        .unwrap();

        assert_snapshot!(redact(&format!("{report:?}")));
    }

    #[test]
    fn hook_stack() {
        setup();

        let report = create_report().attach(1u32).attach(2u64);

        Report::install_hook(
            Hooks::new()
                .push(|_: &u32| Emit::next("unsigned 32bit integer"))
                .push(|_: &u64| Emit::next("unsigned 64-bit integer")),
        )
        .unwrap();

        assert_snapshot!(redact(&format!("{report:?}")));
    }

    #[test]
    fn hook_combine() {
        setup();

        let report = create_report() //
            .attach(1u32)
            .attach(2u64)
            .attach(3u16);

        let other = Hooks::new()
            .push(|_: &u32| Emit::next("u32 (other)"))
            .push(|_: &u16| Emit::next("u16 (other)"));

        Report::install_hook(
            Hooks::new()
                .push(|_: &u32| Emit::next("u32"))
                .push(|_: &u64| Emit::next("u64"))
                .combine(other),
        )
        .unwrap();

        assert_snapshot!(redact(&format!("{report:?}")));
    }

    #[test]
    fn hook_defer() {
        setup();

        let report = create_report() //
            .attach(1u32)
            .attach(2u64)
            .attach(3u16);

        Report::install_hook(
            Hooks::new()
                .push(|_: &u32| Emit::defer("u32"))
                .push(|_: &u64| Emit::next("u64"))
                .push(|_: &u16| Emit::defer("u16")),
        )
        .unwrap();

        assert_snapshot!(redact(&format!("{report:?}")));
    }

    #[test]
    fn hook_decr() {
        setup();

        let report = create_report() //
            .attach(1u32)
            .attach(2u32)
            .attach(3u32);

        Report::install_hook(Hooks::new().push(|_: &u32, ctx: &mut HookContext<u32>| {
            Emit::next(format!("{}", ctx.decrement()))
        }))
        .unwrap();

        assert_snapshot!(redact(&format!("{report:?}")));
    }

    #[test]
    fn hook_incr() {
        setup();

        let report = create_report() //
            .attach(1u32)
            .attach(2u32)
            .attach(3u32);

        Report::install_hook(Hooks::new().push(|_: &u32, ctx: &mut HookContext<u32>| {
            Emit::next(format!("{}", ctx.increment()))
        }))
        .unwrap();

        assert_snapshot!(redact(&format!("{report:?}")));
    }
}
