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

const VERTICAL: &str = concat!(COLOR_RED_START, VERTICAL_LINE, COLOR_RED_END, "   ");
const ENTRY: &str = concat!(
    COLOR_RED_START,
    RIGHT_CURVE_JUNCTION,
    HORIZONTAL_LINE,
    RIGHT_ARROW,
    COLOR_RED_END,
    " "
);
const ENTRY_END: &str = concat!(
    COLOR_RED_START,
    RIGHT_CURVE_END,
    HORIZONTAL_LINE,
    RIGHT_ARROW,
    COLOR_RED_END,
    " "
);

fn display_frame(kind: Option<FrameKind>, sources: &[Frame]) -> Vec<String> {
    let content = match kind {
        Some(FrameKind::Context(context)) => Some(context.to_string()),
        Some(FrameKind::Attachment(AttachmentKind::Opaque(_))) => None,
        Some(FrameKind::Attachment(AttachmentKind::Printable(attachment))) => {
            Some(attachment.to_string())
        }
        None => None,
    };
}

pub(crate) fn display_report<C>(report: &Report<C>) -> String {
    display_frame(None, &report.frames)
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

    #[test]
    fn nested() {
        let err1 = std::fs::read_to_string("config.txt").unwrap_err();
        let err2 = std::fs::read_to_string("config2.txt").unwrap_err();
        let err3 = std::fs::read_to_string("config3.txt").unwrap_err();
        let err4 = std::fs::read_to_string("config4.txt").unwrap_err();

        let err5 = std::fs::read_to_string("config4.txt").unwrap_err();
        let err6 = std::fs::read_to_string("config4.txt").unwrap_err();

        let mut report = Report::new(err1);
        let err2 = Report::new(err2).change_context(err3);
        let mut err3 = Report::new(err4);

        err3.add_source(Report::new(err5));
        err3.add_source(Report::new(err6));

        let err3 = err3
            .attach_printable("Example")
            .attach_printable("Example 2");

        report.add_source(err2);
        report.add_source(err3);

        println!("{}", report);
    }

    #[test]
    fn single() {
        let report = std::fs::read_to_string("config.txt")
            .into_report()
            .attach_printable("Level 1")
            .attach_printable("Level 2")
            .attach_printable("Level 3")
            .unwrap_err();

        println!("{}", report);
    }
}
