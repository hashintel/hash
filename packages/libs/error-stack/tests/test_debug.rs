#![cfg_attr(nightly, feature(provide_any))]
#![cfg_attr(all(nightly, feature = "std"), feature(backtrace))]

mod common;

use common::*;
use error_stack::{Frame, FrameKind};

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

    let locations = report
        .frames()
        .filter_map(|frame| match frame.kind() {
            FrameKind::Context(_) => Some(frame.location()),
            FrameKind::Attachment(_) => None,
        })
        .collect::<Vec<_>>();

    let expected_output = format!(
        r#"Context B
             at {}
      - Printable C

Caused by:
   0: Context A
             at {}
      - Printable B
      - 1 additional opaque attachment
   1: Root error
             at {}
      - Printable A
      - 2 additional opaque attachments"#,
        locations[0], locations[1], locations[2]
    );

    assert!(format!("{report:?}").starts_with(&expected_output));
}

#[test]
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
