#![cfg_attr(nightly, feature(provide_any))]
#![cfg_attr(all(nightly, feature = "std"), feature(backtrace))]

mod common;

use core::any::{Provider, TypeId};
use std::any::Demand;

use common::*;
use error_stack::{
    fmt::{Builtin, Context, DebugDiagnostic, Hooks, Line, HOOK},
    Frame, FrameKind,
};

#[test]
fn report_nest() {
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

    let hooks = Hooks::new().push(
        |val: &AttachmentA, ctx: &mut Context<AttachmentA>| -> Line {
            let idx = ctx.get::<u8>().copied();
            let idx = idx.unwrap_or(0) + 1;

            ctx.insert(idx);

            Line::Next(format!("Error {idx}"))
        },
    );
    HOOK.set(hooks.erase());

    println!("{report:?}");
}

#[test]
fn report_provider() {
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

    println!("{report:?}");
}

#[test]
fn report_normal() {
    let report = create_report()
        .attach_printable(PrintableA(0))
        .attach(AttachmentA)
        .attach(AttachmentB)
        .change_context(ContextA(0))
        .attach_printable(PrintableB(0))
        .attach(AttachmentB)
        .change_context(ContextB(0))
        .attach_printable("Printable C");

    //
    //     let locations = report
    //         .frames()
    //         .filter_map(|frame| match frame.kind() {
    //             FrameKind::Context(_) => Some(frame.location()),
    //             FrameKind::Attachment(_) => None,
    //         })
    //         .collect::<Vec<_>>();
    //
    //     let expected_output = format!(
    //         r#"Context B
    //              at {}
    //       - Printable C
    //
    // Caused by:
    //    0: Context A
    //              at {}
    //       - Printable B
    //       - 1 additional opaque attachment
    //    1: Root error
    //              at {}
    //       - Printable A
    //       - 2 additional opaque attachments"#, locations[0], locations[1], locations[2]
    //     );
    //
    //     assert!(format!("{report:?}").starts_with(&expected_output));

    println!("{report:?}");
}

#[test]
#[ignore]
fn extended() {
    let report = create_report()
        .attach_printable(PrintableA(10))
        .attach(AttachmentA)
        .change_context(ContextA(20))
        .attach_printable(PrintableB(30));

    let locations = report.frames().map(Frame::location).collect::<Vec<_>>();

    let expected_output = format!(
        r#"Report {{
    frames: [
        Frame {{
            location: Location {{
                file: "tests/test_debug.rs",
                line: {},
                col: 10,
            }},
            attachment: PrintableB(
                30,
            ),
        }},
        Frame {{
            location: Location {{
                file: "tests/test_debug.rs",
                line: {},
                col: 10,
            }},
            context: ContextA(
                20,
            ),
        }},
        Frame {{
            location: Location {{
                file: "tests/test_debug.rs",
                line: {},
                col: 10,
            }},
            attachment: "Opaque",
        }},
        Frame {{
            location: Location {{
                file: "tests/test_debug.rs",
                line: {},
                col: 10,
            }},
            attachment: PrintableA(
                10,
            ),
        }},
        Frame {{
            location: Location {{
                file: "tests/common.rs",
                line: {},
                col: 5,
            }},
            context: RootError,
        }},
    ],"#,
        locations[0].line(),
        locations[1].line(),
        locations[2].line(),
        locations[3].line(),
        locations[4].line(),
    );

    assert!(dbg!(format!("{report:#?}")).starts_with(&dbg!(expected_output)));
}
