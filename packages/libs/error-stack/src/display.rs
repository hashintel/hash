//! Implementation of display, which can be either fancy or "normal", depending
//! on the type color and non ascii character can be used.
//!
//! This is inspired by [miette](https://docs.rs/miette/latest/miette/index.html)

use std::iter::once;

use crate::{AttachmentKind, Frame, FrameKind, Report};

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

#[cfg(all(nightly, feature = "std"))]
fn render_backtrace<'a>(
    frame: &'a Frame,
    bt: &mut Vec<&'a std::backtrace::Backtrace>,
) -> Option<String> {
    if let Some(backtrace) = frame.request_ref::<std::backtrace::Backtrace>() {
        if matches!(
            backtrace.status(),
            std::backtrace::BacktraceStatus::Unsupported
                | std::backtrace::BacktraceStatus::Disabled
        ) {
            return None;
        }

        bt.push(backtrace);

        Some(format!(
            "backtrace with {} frames ({})",
            backtrace.frames().len(),
            bt.len()
        ))
    } else {
        None
    }
}

#[cfg(feature = "spantrace")]
fn render_spantrace<'a>(
    frame: &'a Frame,
    st: &mut Vec<&'a tracing_error::SpanTrace>,
) -> Option<String> {
    if let Some(span_trace) = frame.request_ref::<tracing_error::SpanTrace>() {
        if span_trace.status() == tracing_error::SpanTraceStatus::EMPTY
            || span_trace.status() == tracing_error::SpanTraceStatus::UNSUPPORTED
        {
            return None;
        }

        let mut span = 0;
        span_trace.with_spans(|metadata, fields| {
            span += 1;
            true
        });

        st.push(span_trace);

        Some(format!("spantrace with {span} frames ({})", st.len()))
    } else {
        None
    }
}

fn render_frame<'a>(
    frame: &'a Frame,
    #[cfg(all(nightly, feature = "std"))] bt: &mut Vec<&'a std::backtrace::Backtrace>,
    #[cfg(feature = "spantrace")] st: &mut Vec<&'a tracing_error::SpanTrace>,
) -> Vec<String> {
    let mut lines = match frame.kind() {
        FrameKind::Context(context) => context
            .to_string()
            .split('\n')
            .map(ToOwned::to_owned)
            .collect(),
        FrameKind::Attachment(AttachmentKind::Opaque(_)) => vec![],
        FrameKind::Attachment(AttachmentKind::Printable(attachment)) => attachment
            .to_string()
            .split('\n')
            .map(ToOwned::to_owned)
            .collect(),
    };

    #[cfg(all(nightly, feature = "std"))]
    if let Some(backtrace) = render_backtrace(frame, bt) {
        lines.push(backtrace);
    }

    #[cfg(feature = "spantrace")]
    if let Some(spantrace) = render_spantrace(frame, st) {
        lines.push(spantrace);
    }

    lines
}

fn display_frame<'a>(
    frame: &'a Frame,
    #[cfg(all(nightly, feature = "std"))] bt: &mut Vec<&'a std::backtrace::Backtrace>,
    #[cfg(feature = "spantrace")] st: &mut Vec<&'a tracing_error::SpanTrace>,
) -> Vec<String> {
    let mut plain = vec![];

    let next;
    let mut ptr = frame;

    loop {
        let sources = ptr.sources();

        // optimize this loop
        next = match sources {
            [] => None,
            [child] => {
                plain.push(child);
                ptr = child;
                continue;
            }
            group => Some(group),
        };

        break;
    }

    // the first frame, the "title" has no indentation.
    let mut lines = render_frame(
        frame,
        #[cfg(all(nightly, feature = "std"))]
        bt,
        #[cfg(feature = "spantrace")]
        st,
    );

    if lines.is_empty() {
        lines.push("Opaque Error".to_owned());
    }

    let mut children = vec![];

    for child in plain {
        // normal children are just plainly indented and then added
        children.push(render_frame(
            child,
            #[cfg(all(nightly, feature = "std"))]
            bt,
            #[cfg(feature = "spantrace")]
            st,
        ));
    }

    // we have a group, indentation for those are a bit different,
    // for every item in the group the line either receives a: `|->` or `\->`
    // the last group item is only indented with a space, rather than a `|`.
    if let Some(group) = next {
        for child in group {
            children.push(display_frame(
                child,
                #[cfg(all(nightly, feature = "std"))]
                bt,
                #[cfg(feature = "spantrace")]
                st,
            ));
        }
    }

    let total = children.len();
    let children = children.into_iter().enumerate().flat_map(|(pos, content)| {
        let last = pos == total - 1;

        content.into_iter().enumerate().map(move |(idx, line)| {
            if last {
                if idx == 0 {
                    format!("{ENTRY_END}{line}")
                } else {
                    format!("{SPACE}{line}")
                }
            } else {
                if idx == 0 {
                    format!("{ENTRY}{line}")
                } else {
                    format!("{VERTICAL}{line}")
                }
            }
        })
    });

    lines.into_iter().chain(children).collect()
}

pub(crate) fn display_report<C>(report: &Report<C>) -> String {
    #[cfg(all(nightly, feature = "std"))]
    let mut bt = Vec::new();
    #[cfg(feature = "spantrace")]
    let mut st = Vec::new();

    let mut lines = vec![];
    for frame in &report.frames {
        let display = display_frame(
            frame,
            #[cfg(all(nightly, feature = "std"))]
            &mut bt,
            #[cfg(feature = "spantrace")]
            &mut st,
        );

        lines.extend(display);
        lines.push("".to_owned());
    }

    #[cfg(all(nightly, feature = "std"))]
    {
        lines.extend(vec!["".to_owned(); 2]);

        for (pos, backtrace) in bt.into_iter().enumerate() {
            lines.push(format!("Backtrace No. {pos}"));
            lines.extend(backtrace.to_string().split('\n').map(ToOwned::to_owned))
        }
    }

    #[cfg(feature = "spantrace")]
    {
        lines.extend(vec!["".to_owned(); 2]);

        for (pos, span_trace) in st.into_iter().enumerate() {
            lines.push(format!("Spantrace No. {pos}"));
            lines.extend(span_trace.to_string().split('\n').map(ToOwned::to_owned))
        }
    }

    lines.into_iter().fold(String::new(), |mut acc, line| {
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
            .change_context(std::fs::read_to_string("config.txt").unwrap_err())
            .attach_printable("Level 3")
            .unwrap_err();

        println!("{}", report);
    }

    #[test]
    fn multiple_source() {
        let mut report = std::fs::read_to_string("config.txt")
            .into_report()
            .unwrap_err();

        report.add_source(
            std::fs::read_to_string("config2.txt")
                .into_report()
                .unwrap_err(),
        );

        report.add_source(
            std::fs::read_to_string("config3.txt")
                .into_report()
                .unwrap_err(),
        );

        report.add_source(
            std::fs::read_to_string("config4.txt")
                .into_report()
                .unwrap_err(),
        );

        println!("{}", report);
    }
}
