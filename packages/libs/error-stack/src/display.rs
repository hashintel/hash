//! Implementation of display, which can be either fancy or "normal", depending
//! on the type color and non ascii character can be used.
//!
//! This is inspired by [miette](https://docs.rs/miette/latest/miette/index.html)

use std::iter::once;

use crate::{AttachmentKind, Frame, FrameKind, Report};

#[cfg(feature = "fancy")]
const RIGHT_ARROW: char = '▶';
#[cfg(not(feature = "fancy"))]
const RIGHT_ARROW: char = '>';

#[cfg(feature = "fancy")]
const RIGHT_CURVE_END: char = '╰';
#[cfg(not(feature = "fancy"))]
const RIGHT_CURVE_END: char = '\\';

#[cfg(feature = "fancy")]
const RIGHT_CURVE_JUNCTION: char = '├';
#[cfg(not(feature = "fancy"))]
const RIGHT_CURVE_JUNCTION: char = '|';

#[cfg(feature = "fancy")]
const VERTICAL_LINE: char = '│';
#[cfg(not(feature = "fancy"))]
const VERTICAL_LINE: char = '|';

#[cfg(feature = "fancy")]
const HORIZONTAL_LINE: char = '─';
#[cfg(not(feature = "fancy"))]
const HORIZONTAL_LINE: char = '-';

#[cfg(feature = "fancy")]
const COLOR_RED_START: &str = "\x1b[31m";
#[cfg(not(feature = "fancy"))]
const COLOR_RED_START: &str = "";

#[cfg(feature = "fancy")]
const COLOR_RED_END: &str = "\x1b[0m";
#[cfg(not(feature = "fancy"))]
const COLOR_RED_END: &str = "";

#[cfg(feature = "fancy")]
const VERTICAL: &str = "\x1b[31m│\x1b[0m   ";
#[cfg(not(feature = "fancy"))]
const VERTICAL: &str = "|   ";

#[cfg(feature = "fancy")]
const ENTRY: &str = "\x1b[31m├─▶\x1b[0m ";
#[cfg(not(feature = "fancy"))]
const ENTRY: &str = "|-> ";

#[cfg(feature = "fancy")]
const ENTRY_END: &str = "\x1b[31m╰─▶\x1b[0m ";
#[cfg(not(feature = "fancy"))]
const ENTRY_END: &str = "\\-> ";

const SPACE: &str = "    ";

fn display_frame(frame: &Frame) -> Vec<String> {
    let mut value: Option<Vec<String>> = match frame.kind() {
        FrameKind::Context(context) => Some(
            context
                .to_string()
                .split('\n')
                .map(ToOwned::to_owned)
                .collect(),
        ),
        FrameKind::Attachment(AttachmentKind::Opaque(_)) => None,
        FrameKind::Attachment(AttachmentKind::Printable(attachment)) => Some(
            attachment
                .to_string()
                .split('\n')
                .map(ToOwned::to_owned)
                .collect(),
        ),
    };

    #[cfg(all(nightly, feature = "std"))]
    {
        // this does not override the initial value, due to the fact that the value
        // is opaque and therefore `None`
        if let Some(backtrace) = frame.request_ref::<std::backtrace::Backtrace>() {
            value = Some(
                backtrace
                    .to_string()
                    .split('\n')
                    .map(ToOwned::to_owned)
                    .collect(),
            );
        }
    }

    #[cfg(feature = "spantrace")]
    {
        if let Some(span_trace) = frame.request_ref::<tracing_error::SpanTrace>() {
            value = Some(
                span_trace
                    .to_string()
                    .split('\n')
                    .map(ToOwned::to_owned)
                    .collect(),
            );
        }
    }

    let lines = match frame.sources() {
        [] => vec![],
        [next] => {
            let mut lines = match value {
                None => vec![],
                Some(lines) => {
                    let mut out = vec![];

                    let mut lines = lines.into_iter();
                    if let Some(title) = lines.next() {
                        out.push(format!("{ENTRY_END}{title}"));
                    }

                    out.extend(lines.map(|line| format!("{SPACE}{line}")));

                    out
                }
            };

            lines.extend(
                display_frame(next)
                    .into_iter()
                    .map(|line| format!("{SPACE}{line}")),
            );

            lines
        }
        _ => unimplemented!(),
    };

    lines
}

pub(crate) fn display_report<C>(report: &Report<C>) -> String {
    display_frame(&report.frames[0])
        .into_iter()
        .fold(String::new(), |mut acc, line| {
            acc.push('\n');
            acc.push_str(&line);
            acc
        })
}

#[cfg(test)]
mod tests {
    use crate::{IntoReport, Report, ResultExt};

    // #[test]
    // fn nested() {
    //     let err1 = std::fs::read_to_string("config.txt").unwrap_err();
    //     let err2 = std::fs::read_to_string("config2.txt").unwrap_err();
    //     let err3 = std::fs::read_to_string("config3.txt").unwrap_err();
    //     let err4 = std::fs::read_to_string("config4.txt").unwrap_err();
    //
    //     let err5 = std::fs::read_to_string("config4.txt").unwrap_err();
    //     let err6 = std::fs::read_to_string("config4.txt").unwrap_err();
    //
    //     let mut report = Report::new(err1);
    //     let err2 = Report::new(err2).change_context(err3);
    //     let mut err3 = Report::new(err4);
    //
    //     err3.add_source(Report::new(err5));
    //     err3.add_source(Report::new(err6));
    //
    //     let err3 = err3
    //         .attach_printable("Example")
    //         .attach_printable("Example 2");
    //
    //     report.add_source(err2);
    //     report.add_source(err3);
    //
    //     println!("{}", report);
    // }

    // TODO:
    //  we might want to restructure
    //  and print the backtrace after we printed the tree and set a reference to it.

    #[test]
    fn single() {
        let report = std::fs::read_to_string("config.txt")
            .into_report()
            .attach_printable("Level 1")
            .attach_printable("Level 2")
            .change_context(std::fs::read_to_string("config.txt").unwrap_err())
            .attach_printable("Level 3")
            .unwrap_err();

        println!("{}", report);
    }
}
