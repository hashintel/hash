//! Implementation of display, which can be either fancy or "normal", depending
//! on the type color and non ascii character can be used.
//!
//! This is inspired by [miette](https://docs.rs/miette/latest/miette/index.html)

use alloc::{
    borrow::ToOwned,
    format,
    string::{String, ToString},
    vec,
    vec::Vec,
};

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
fn backtrace<'a>(frame: &'a Frame, bt: &mut Vec<&'a std::backtrace::Backtrace>) -> Option<String> {
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
fn spantrace<'a>(frame: &'a Frame, st: &mut Vec<&'a tracing_error::SpanTrace>) -> Option<String> {
    if let Some(span_trace) = frame.request_ref::<tracing_error::SpanTrace>() {
        if span_trace.status() == tracing_error::SpanTraceStatus::EMPTY
            || span_trace.status() == tracing_error::SpanTraceStatus::UNSUPPORTED
        {
            return None;
        }

        let mut span = 0;
        span_trace.with_spans(|_, _| {
            span += 1;
            true
        });

        st.push(span_trace);

        Some(format!("spantrace with {span} frames ({})", st.len()))
    } else {
        None
    }
}

fn frame<'a>(
    frame: &'a Frame,
    #[cfg(all(nightly, feature = "std"))] bt: &mut Vec<&'a std::backtrace::Backtrace>,
    #[cfg(feature = "spantrace")] st: &mut Vec<&'a tracing_error::SpanTrace>,
) -> Vec<String> {
    // We allow `unused_mut` due to the fact that certain feature configurations will require
    // this to be mutable (backtrace and spantrace overwrite extend the lines)
    #[allow(unused_mut)]
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
    if let Some(backtrace) = backtrace(frame, bt) {
        lines.push(backtrace);
    }

    #[cfg(feature = "spantrace")]
    if let Some(spantrace) = spantrace(frame, st) {
        lines.push(spantrace);
    }

    lines
}

fn frame_root<'a>(
    root: &'a Frame,
    #[cfg(all(nightly, feature = "std"))] bt: &mut Vec<&'a std::backtrace::Backtrace>,
    #[cfg(feature = "spantrace")] st: &mut Vec<&'a tracing_error::SpanTrace>,
) -> Vec<String> {
    let mut plain = vec![root];

    let next;
    let mut ptr = root;

    // find all the frames that are part of this stack,
    // meaning collect them until we hit the end or a group of multiple frames.
    loop {
        let sources = ptr.sources();

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

    let mut groups = vec![];

    let mut opaque = 0;
    for child in plain {
        let content = frame(
            child,
            #[cfg(all(nightly, feature = "std"))]
            bt,
            #[cfg(feature = "spantrace")]
            st,
        );

        if content.is_empty() {
            opaque += 1;
        } else {
            groups.push(content);
        }
    }

    if opaque == 1 {
        groups.push(vec!["1 additional attachment".to_owned()]);
    } else if opaque > 1 {
        groups.push(vec![format!("{opaque} additional attachments")]);
    }

    if let Some(group) = next {
        for child in group {
            let content = frame_root(
                child,
                #[cfg(all(nightly, feature = "std"))]
                bt,
                #[cfg(feature = "spantrace")]
                st,
            );

            if !content.is_empty() {
                groups.push(content);
            }
        }
    }

    // The first item is always the title,
    // after that every group gets one of the following indents: `|->`, or `\->`
    // if it is the last one.
    let total = groups.len();
    groups
        .into_iter()
        .enumerate()
        .flat_map(|(pos, content)| {
            let last = pos == total - 1;
            let first = pos == 0;

            content.into_iter().enumerate().map(move |(idx, line)| {
                if first {
                    // the first line is the title, therefore not indented.
                    line
                } else if last {
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
        })
        .collect()
}

pub(crate) fn report<C>(report: &Report<C>) -> String {
    #[cfg(all(nightly, feature = "std"))]
    let mut bt = Vec::new();
    #[cfg(feature = "spantrace")]
    let mut st = Vec::new();

    let mut lines = vec![];
    for frame in report.sources() {
        let display = frame_root(
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
    use alloc::string::ToString;
    use core::fmt::{Display, Formatter};

    use crate::{Context, Report};

    #[derive(Debug)]
    struct ConfigError;

    impl Display for ConfigError {
        fn fmt(&self, f: &mut Formatter<'_>) -> core::fmt::Result {
            f.write_str("Configuration Error")
        }
    }

    impl Context for ConfigError {}

    #[test]
    fn nested() {
        let err1 = ConfigError;
        let err2 = ConfigError;
        let err3 = ConfigError;
        let err4 = ConfigError;

        let err5 = ConfigError;
        let err6 = ConfigError;

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

        // due to the fact that we have 48 different configuration options,
        // and in total ~8 different configurations and outputs
        // we cannot easily integration test the output here.
        // Especially with the backtraces and spantraces which can get very large.
        assert!(report.to_string().len() > 0);
    }

    #[test]
    fn single() {
        let report = Report::new(ConfigError)
            .attach_printable("Level 1")
            .attach_printable("Level 2")
            .change_context(ConfigError)
            .attach_printable("Level 3");

        assert!(report.to_string().len() > 0)
    }

    #[test]
    fn multiple_source() {
        let mut report = Report::new(ConfigError);

        report.add_source(Report::new(ConfigError));
        report.add_source(Report::new(ConfigError));
        report.add_source(Report::new(ConfigError));

        assert!(report.to_string().len() > 0)
    }
}
