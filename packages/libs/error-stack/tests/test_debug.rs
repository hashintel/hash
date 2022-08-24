#![cfg_attr(nightly, feature(provide_any))]
// can be considered safe, because we only check the output, which in itself does not use **any**
// unsafe code.
#![cfg(not(miri))]
#![cfg_attr(all(nightly, feature = "std"), feature(error_generic_member_access))]

mod common;
use common::*;
#[allow(unused_imports)]
use error_stack::Report;
use insta::assert_snapshot;
#[cfg(feature = "spantrace")]
use tracing_error::ErrorLayer;
#[cfg(feature = "spantrace")]
use tracing_subscriber::layer::SubscriberExt;

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

#[cfg(feature = "pretty-print")]
fn setup_color() {
    owo_colors::set_override(false);
}

#[cfg(not(feature = "pretty-print"))]
fn setup_color() {}

fn setup() {
    setup_tracing();
    setup_backtrace();
    setup_color();
}

fn snap_suffix() -> String {
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

    #[cfg(feature = "pretty-print")]
    {
        suffix.push("pretty-print");
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

fn prepare(suffix: bool) -> impl Drop {
    setup();

    let mut settings = insta::Settings::clone_current();
    if suffix {
        settings.set_snapshot_suffix(snap_suffix());
    }

    settings.add_filter(
        r"Backtrace No\. (\d+)\n(?:  .*\n)*  .*",
        "Backtrace No. $1\n  [redacted]",
    );
    settings.add_filter(
        r"Span Trace No\. (\d+)\n(?:  .*\n)*  .*",
        "Span Trace No. $1\n  [redacted]",
    );
    settings.add_filter(
        r"backtrace with (\d+) frames \((\d+)\)",
        "backtrace with [n] frames ($2)",
    );

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
    let _guard = prepare(true);

    let report = create_sources_nested();

    assert_snapshot!(format!("{report:?}"));
}

#[test]
fn sources_nested_alternate() {
    let _guard = prepare(true);

    let report = create_sources_nested();

    assert_snapshot!(format!("{report:#?}"));
}

#[cfg(all(
    nightly,
    feature = "std",
    feature = "spantrace",
    feature = "pretty-print"
))]
mod full {
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

    use std::{
        any::Demand,
        error::Error,
        fmt::{Display, Formatter},
    };

    #[cfg(all(nightly, feature = "unstable"))]
    use error_stack::fmt::DebugDiagnostic;
    use error_stack::fmt::Emit;

    use super::*;

    #[test]
    fn linear() {
        let _guard = prepare(false);

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
        let _guard = prepare(false);

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

    #[derive(Debug)]
    struct ContextC;

    impl Display for ContextC {
        fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
            f.write_str("A multiline\ncontext that might have\na bit more info")
        }
    }

    impl Error for ContextC {}

    #[test]
    fn multiline_ctx() {
        let _guard = prepare(false);

        let report = create_report()
            .change_context(ContextC)
            .attach_printable(PrintableB(0))
            .attach(AttachmentB)
            .change_context(ContextB(0))
            .attach_printable("Printable C");

        assert_snapshot!(format!("{report:#?}"));
    }

    #[test]
    fn multiline() {
        let _guard = prepare(false);

        let report = create_report()
            .attach_printable("A multiline\nattachment\nthat might have some\nadditional info");

        assert_snapshot!(format!("{report:#?}"));
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
        let _guard = prepare(false);

        let mut root1 = create_report().attach_printable(PrintableA(1));
        let root2 = create_report().attach_printable(PrintableB(2));
        let root3 = create_report().attach_printable(PrintableB(3));

        root1.extend_one(root2);
        root1.extend_one(root3);

        let report = root1
            .attach(AttachmentA(1))
            .change_context(ContextA(2))
            .attach(AttachmentB(2));

        assert_snapshot!(format!("{report:?}"));
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
        let _guard = prepare(false);

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

        assert_snapshot!(format!("{report:?}"));
    }

    #[test]
    fn complex() {
        let _guard = prepare(false);

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

        assert_snapshot!(format!("{report:?}"));
    }

    #[test]
    fn hook() {
        let _guard = prepare(false);

        let report = create_report().attach(2u32);

        Report::install_debug_hook::<u32>(|_, _| vec![Emit::next("unsigned 32bit integer")]);

        assert_snapshot!(format!("{report:?}"));
    }

    #[test]
    fn hook_context() {
        let _guard = prepare(false);

        let report = create_report().attach(2u32);

        Report::install_debug_hook::<u32>(|_, ctx| {
            vec![Emit::next(format!(
                "unsigned 32bit integer (No. {})",
                ctx.increment()
            ))]
        });

        assert_snapshot!(format!("{report:?}"));
    }

    #[test]
    fn hook_multiple() {
        let _guard = prepare(false);

        let report = create_report().attach(1u32).attach(2u64);

        Report::install_debug_hook::<u32>(|_, _| vec![Emit::next("unsigned 32bit integer")]);
        Report::install_debug_hook::<u64>(|_, _| vec![Emit::next("unsigned 64bit integer")]);

        assert_snapshot!(format!("{report:?}"));
    }

    #[test]
    fn hook_fallback() {
        let _guard = prepare(false);

        let report = create_report().attach(1u32);

        Report::install_debug_hook_fallback(|_, _| vec![Emit::next("unknown")]);

        assert_snapshot!(format!("{report:?}"));
    }

    #[test]
    fn hook_defer() {
        let _guard = prepare(false);

        let report = create_report() //
            .attach(1u32)
            .attach(2u64)
            .attach(3u16);

        Report::install_debug_hook::<u16>(|_, _| vec![Emit::defer("u16")]);
        Report::install_debug_hook::<u32>(|_, _| vec![Emit::defer("u32")]);
        Report::install_debug_hook::<u64>(|_, _| vec![Emit::next("u64")]);

        assert_snapshot!(format!("{report:?}"));
    }

    #[test]
    fn hook_decr() {
        let _guard = prepare(false);

        let report = create_report() //
            .attach(1u32)
            .attach(2u32)
            .attach(3u32);

        Report::install_debug_hook::<u32>(|_, ctx| {
            vec![Emit::next(format!("{}", ctx.decrement()))]
        });

        assert_snapshot!(format!("{report:?}"));
    }

    #[test]
    fn hook_incr() {
        let _guard = prepare(false);

        let report = create_report() //
            .attach(1u32)
            .attach(2u32)
            .attach(3u32);

        Report::install_debug_hook::<u32>(|_, ctx| {
            vec![Emit::next(format!("{}", ctx.increment()))]
        });

        assert_snapshot!(format!("{report:?}"));
    }

    #[test]
    fn hook_alternate() {
        let _guard = prepare(false);

        let report = create_report().attach(2u64);

        Report::install_debug_hook::<u64>(|_, ctx| {
            if ctx.alternate() {
                ctx.attach_snippet("Snippet");
            }

            vec![Emit::next("Empty")]
        });

        assert_snapshot!("norm", format!("{report:?}"));

        assert_snapshot!("alt", format!("{report:#?}"));
    }

    #[derive(Debug)]
    struct ContextD {
        code: usize,
        reason: &'static str,
    }

    impl Display for ContextD {
        fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
            f.write_str("Context D")
        }
    }

    impl Error for ContextD {
        fn provide<'a>(&'a self, req: &mut Demand<'a>) {
            req.provide_ref(&self.code);
            req.provide_ref(&self.reason);
        }
    }

    #[test]
    fn hook_provider() {
        let _guard = prepare(false);

        let report = create_report().change_context(ContextD {
            code: 420,
            reason: "Invalid User Input",
        });

        Report::install_debug_hook::<usize>(|val, _| vec![Emit::next(format!("usize: {val}"))]);
        Report::install_debug_hook::<&'static str>(|val, _| {
            vec![Emit::next(format!("&'static str: {val}"))]
        });

        assert_snapshot!(format!("{report:?}"));
    }
}
