#![cfg_attr(nightly, feature(provide_any))]
// can be considered safe, because we only check the output, which in itself does not use **any**
// unsafe code.
#![cfg(not(miri))]
#![cfg_attr(all(nightly, feature = "std"), feature(error_generic_member_access))]

mod common;

use common::snapshots::*;
#[allow(unused_imports)]
use error_stack::Report;
use insta::assert_snapshot;

fn prepare(suffix: bool) -> impl Drop {
    snapshots::prepare(suffix, true, false, true)
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
    rust_1_65,
    any(feature = "std", feature = "hooks"),
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

    #[cfg(nightly)]
    use std::any::Demand;
    use std::{
        error::Error,
        fmt::{Display, Formatter},
        panic::Location,
    };

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
            .attach_printable("printable C");

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
            .attach_printable("printable C");

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
    fn multiline_context() {
        let _guard = prepare(false);

        let report = Report::new(ContextC)
            .change_context(ContextC)
            .attach_printable(PrintableB(0))
            .attach(AttachmentB)
            .change_context(ContextB(0))
            .attach_printable("printable C");

        assert_snapshot!(format!("{report:#?}"));
    }

    #[test]
    fn multiline() {
        let _guard = prepare(false);

        let report = create_report()
            .attach_printable("A multiline\nattachment\nthat might have some\nadditional info")
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

        Report::install_debug_hook::<u32>(|_, context| {
            context.push_body("unsigned 32bit integer");
        });

        assert_snapshot!(format!("{report:?}"));
    }

    #[test]
    fn hook_context() {
        let _guard = prepare(false);

        let report = create_report().attach(2u32);

        Report::install_debug_hook::<u32>(|_, context| {
            let idx = context.increment_counter();
            context.push_body(format!("unsigned 32bit integer (No. {idx})"));
        });

        assert_snapshot!(format!("{report:?}"));
    }

    #[test]
    fn hook_for_context() {
        let _guard = prepare(false);

        let report = create_report().attach(2u32);

        Report::install_debug_hook::<RootError>(|_, _| {
            // This should not be displayed as `RootError` is only used as `Context`, never as
            // attachment.
            unreachable!("A context should never be used as hook");
        });

        assert_snapshot!(format!("{report:?}"));
    }

    #[test]
    fn hook_multiple() {
        let _guard = prepare(false);

        let report = create_report().attach(1u32).attach(2u64);

        Report::install_debug_hook::<u32>(|_, context| {
            context.push_body("unsigned 32bit integer");
        });
        Report::install_debug_hook::<u64>(|_, context| {
            context.push_body("unsigned 64bit integer");
        });

        assert_snapshot!(format!("{report:?}"));
    }

    #[test]
    fn hook_decr() {
        let _guard = prepare(false);

        let report = create_report() //
            .attach(1u32)
            .attach(2u32)
            .attach(3u32);

        Report::install_debug_hook::<u32>(|_, context| {
            let idx = context.decrement_counter();
            context.push_body(idx.to_string());
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

        Report::install_debug_hook::<u32>(|_, context| {
            let idx = context.increment_counter();
            context.push_body(idx.to_string());
        });

        assert_snapshot!(format!("{report:?}"));
    }

    #[test]
    fn hook_alternate() {
        let _guard = prepare(false);

        let report = create_report().attach(2u64);

        Report::install_debug_hook::<u64>(|_, context| {
            if context.alternate() {
                context.push_appendix("Snippet");
            }

            context.push_body("Empty");
        });

        assert_snapshot!("norm", format!("{report:?}"));

        assert_snapshot!("alt", format!("{report:#?}"));
    }

    #[test]
    fn hook_location() {
        let _guard = prepare(false);

        let report = create_report();

        Report::install_debug_hook::<Location<'static>>(|_, _| {});

        assert_snapshot!(format!("{report:?}"))
    }

    #[cfg(nightly)]
    #[derive(Debug)]
    struct ContextD {
        code: usize,
        reason: &'static str,
    }

    #[cfg(nightly)]
    impl Display for ContextD {
        fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
            f.write_str("context D")
        }
    }

    #[cfg(nightly)]
    impl Error for ContextD {
        fn provide<'a>(&'a self, req: &mut Demand<'a>) {
            req.provide_ref(&self.code);
            req.provide_ref(&self.reason);
        }
    }

    #[test]
    #[cfg(nightly)]
    fn hook_provider() {
        let _guard = prepare(false);

        let report = create_report().change_context(ContextD {
            code: 420,
            reason: "Invalid User Input",
        });

        Report::install_debug_hook::<usize>(|value, context| {
            context.push_body(format!("usize: {value}"));
        });
        Report::install_debug_hook::<&'static str>(|value, context| {
            context.push_body(format!("&'static str: {value}"));
        });

        assert_snapshot!(format!("{report:?}"));
    }
}
