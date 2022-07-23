//! Implementation of display, which can be either fancy or "normal", depending
//! on the type color and non ascii character can be used.
//!
//! This is inspired by [miette](https://docs.rs/miette/latest/miette/index.html)

mod hook;
#[cfg(nightly)]
mod nightly;

use alloc::{borrow::ToOwned, collections::VecDeque, format, string::String, vec, vec::Vec};
use core::{
    fmt,
    fmt::{Debug, Display, Formatter, Write},
};

#[cfg(nightly)]
pub use nightly::DebugDiagnostic;
#[cfg(feature = "hooks")]
use once_cell::sync::OnceCell;
#[cfg(feature = "glyph")]
use owo_colors::{colored::Color, colors::Red, OwoColorize, Stream::Stdout};

#[cfg(feature = "hooks")]
use crate::fmt::hook::ErasedHooks;
use crate::{
    fmt::hook::{AnyContext, Builtin, Hook},
    AttachmentKind, Frame, FrameKind, Report,
};

#[cfg(feature = "hooks")]
static HOOK: OnceCell<ErasedHooks> = OnceCell::new();

pub enum Line {
    Defer(String),
    Next(String),
}

enum Instruction {
    Content(String),
    Entry { end: bool },
    Vertical,
    Indent,
}

impl Instruction {
    fn plain(text: String) -> Instructions {
        let mut queue = VecDeque::new();
        queue.push_back(Instruction::Content(text));

        queue
    }
}

impl Display for Instruction {
    fn fmt(&self, fmt: &mut Formatter<'_>) -> core::fmt::Result {
        match self {
            Instruction::Content(text) => fmt.write_str(&text),
            #[cfg(feature = "glyph")]
            Instruction::Entry { end: true } => {
                fmt::Display::fmt(&"╰─▶ ".if_supports_color(Stdout, |text| text.red()), fmt)
            }
            #[cfg(not(feature = "glyph"))]
            Instruction::Entry { end: true } => fmt.write_str(r#"\-> "#),
            #[cfg(feature = "glyph")]
            Instruction::Entry { end: false } => {
                fmt::Display::fmt(&"├─▶ ".if_supports_color(Stdout, |text| text.red()), fmt)
            }
            #[cfg(not(feature = "glyph"))]
            Instruction::Entry { end: false } => fmt.write_str("|-> "),
            #[cfg(feature = "glyph")]
            Instruction::Vertical => {
                fmt::Display::fmt(&"│   ".if_supports_color(Stdout, |text| text.red()), fmt)
            }
            #[cfg(not(feature = "glyph"))]
            Instruction::Vertical => fmt.write_str("|   "),
            Instruction::Indent => fmt.write_str("    "),
        }
    }
}

type Instructions = VecDeque<Instruction>;
type Lines = Vec<Instructions>;

fn frame(frame: &Frame, ctx: &mut AnyContext) -> Option<Lines> {
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

    #[cfg(nightly)]
    if let Some(debug) = frame.request_ref::<DebugDiagnostic>() {
        match debug.output() {
            Line::Defer(defer) => {
                ctx.defer(defer.clone());
            }
            Line::Next(next) => {
                lines.extend(next.split('\n').map(ToOwned::to_owned));
            }
        }

        for text in debug.text() {
            ctx.text(text.clone());
        }

        return Some(lines.into_iter().map(Instruction::plain).collect());
    }

    #[cfg(feature = "hooks")]
    if let Some(hooks) = HOOK.get() {
        if let Some(out) = hooks.call(frame, ctx) {
            lines.extend(out.split('\n').map(ToOwned::to_owned));
        }
    } else {
        if let Some(out) = Builtin.fallback(frame, ctx) {
            lines.extend(out.split('\n').map(ToOwned::to_owned));
        }
    }

    #[cfg(not(feature = "hooks"))]
    if let Some(out) = Builtin.fallback(frame, ctx) {
        lines.extend(out.split('\n').map(ToOwned::to_owned));
    }

    Some(lines.into_iter().map(Instruction::plain).collect())
}

fn frame_top(root: &Frame, text: &Vec<Vec<String>>) -> Lines {
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

    let mut ctx = AnyContext::default();

    let mut opaque = 0;
    for child in plain {
        let content = frame(child, &mut ctx);

        if let Some(lines) = content {
            if lines.is_empty() {
                opaque += 1;
            } else {
                groups.push(lines);
            }
        }
    }

    // TODO: global context?!
    // TODO: remove defer from AnyContext
    groups.extend(vec![ctx.destruct()]);

    match opaque {
        0 => {}
        1 => {
            groups.push(vec![Instruction::plain(
                "1 additional attachment".to_owned(),
            )]);
        }
        n => {
            groups.push(vec![Instruction::plain(format!(
                "{n} additional attachments"
            ))]);
        }
    }

    if let Some(group) = next {
        for child in group {
            let content = frame_top(child, text);

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

            content.into_iter().enumerate().map(move |(idx, mut line)| {
                if first {
                    // the first line is the title, therefore not indented.
                } else if last {
                    if idx == 0 {
                        line.push_front(Instruction::Entry { end: true });
                    } else {
                        line.push_front(Instruction::Indent);
                    }
                } else if idx == 0 {
                    line.push_front(Instruction::Entry { end: false });
                } else {
                    line.push_front(Instruction::Vertical);
                }

                line
            })
        })
        .collect()
}

impl<C> Debug for Report<C> {
    fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
        #[cfg(feature = "hooks")]
        if let Some(hook) = Report::debug_hook() {
            return hook(self.generalized(), fmt);
        }

        let mut lines = vec![];
        let mut buffer = vec![];

        for frame in self.current_frames() {
            let display = frame_top(frame, &mut buffer);

            lines.extend(display);
            lines.push(Instruction::plain("".to_owned()));
        }

        let mut lines = lines.into_iter().fold(String::new(), |mut acc, line| {
            acc.push('\n');
            for instruction in line {
                acc.push_str(&format!("{instruction}"))
            }
            acc
        });

        let suffix = buffer
            .into_iter()
            .map(|lines| lines.join("\n"))
            .collect::<Vec<_>>()
            .join("\n");
        lines.push_str(&suffix);

        fmt.write_str(&lines)
    }
}

impl<Context> Display for Report<Context> {
    fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
        #[cfg(feature = "hooks")]
        if let Some(display_hook) = Report::display_hook() {
            return display_hook(self.generalized(), fmt);
        }

        for (index, frame) in self
            .frames()
            .filter_map(|frame| match frame.kind() {
                FrameKind::Context(context) => Some(context.to_string()),
                FrameKind::Attachment(_) => None,
            })
            .enumerate()
        {
            if index == 0 {
                fmt::Display::fmt(&frame, fmt)?;
                if !fmt.alternate() {
                    break;
                }
            } else {
                write!(fmt, ": {frame}")?;
            }
        }

        Ok(())
    }
}
