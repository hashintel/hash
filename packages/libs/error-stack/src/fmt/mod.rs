//! Implementation of display, which can be either fancy or "normal", depending
//! on the type color and non ascii character can be used.
//!
//! This is inspired by [miette](https://docs.rs/miette/latest/miette/index.html)

mod hook;
#[cfg(all(nightly, feature = "experimental"))]
mod nightly;

use alloc::{borrow::ToOwned, collections::VecDeque, format, string::String, vec, vec::Vec};
use core::{
    fmt,
    fmt::{Debug, Display, Formatter},
};

#[cfg(feature = "hooks")]
pub(crate) use hook::ErasedHooks;
use hook::HookContextImpl;
pub use hook::{Builtin, Hook};
#[cfg(feature = "hooks")]
pub use hook::{HookContext, Hooks};
#[cfg(all(nightly, feature = "experimental"))]
pub use nightly::DebugDiagnostic;
#[cfg(feature = "glyph")]
use owo_colors::{colored::Color, colors::Red, OwoColorize, Stream::Stdout};

use crate::{AttachmentKind, Frame, FrameKind, Report, Result};

/// Different types of `Line` that exist during rendering.
///
/// # Example
///
/// Given Hooks:
///
/// * `AttachmentA -> Next`
/// * `AttachmentB -> Defer`
///
/// The following chain of attachments: `A1`, `B2`, `A3`, `A4`, `A5`, `B6`, `A7`, `B8`, `A9` is
/// going to be printed as: `A1`, `A3`, `A4`, `A5`, `A7`, `A9`, `B2`, `B6`, `B8`.
#[derive(Debug, Clone)]
pub enum Line {
    /// Line is going to be emitted after all immediate lines have been emitted from the current
    /// stack.
    /// This means that deferred lines will always be last in a group.
    Defer(String),
    /// Going to be emitted immediately as the next line in the chain of
    /// attachments and contexts.
    Next(String),
}

impl Line {
    /// Create a new [`Next`] line, which is emitted immediately in the tree.
    ///
    /// [`Next`]: Self::Next
    pub fn next<T: ToOwned<Owned = String>>(line: T) -> Self {
        Self::Next(line.to_owned())
    }

    /// Create a new [`Defer`] line, which is deferred until the end of the current chain of
    /// attachments and contexts.
    ///
    /// [`Defer`]: Self::Defer
    pub fn defer<T: ToOwned<Owned = String>>(line: T) -> Self {
        Self::Defer(line.to_owned())
    }
}

/// The display of content is using an instruction style architecture,
/// where we first render every indentation and action as an [`Instruction`], these instructions are
/// a lot easier to reason about and enable better manipulation of the stream of data.
///
/// Once generation of all data is done, it is interpreted as a String, with glyphs or color added
/// (if supported and enabled).
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

fn debug_frame(frame: &Frame, ctx: &mut HookContextImpl) -> Option<Line> {
    match frame.kind() {
        FrameKind::Context(context) => Some(context.to_string()).map(Line::Next),
        FrameKind::Attachment(AttachmentKind::Opaque(_)) => {
            #[cfg(all(nightly, feature = "experimental"))]
            if let Some(debug) = frame.request_ref::<DebugDiagnostic>() {
                for text in debug.text() {
                    ctx.text(text.clone());
                }

                return Some(debug.output().clone());
            }

            #[cfg(feature = "hooks")]
            if let Some(hooks) = Report::format_hook() {
                return hooks.call(frame, ctx);
            }

            Builtin.call(frame, ctx.cast())
        }
        FrameKind::Attachment(AttachmentKind::Printable(attachment)) => {
            Some(attachment.to_string()).map(Line::Next)
        }
    }
}

fn debug_frame_root(root: &Frame, ctx: &mut HookContextImpl) -> Lines {
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

    let mut groups: Vec<Lines> = vec![];
    let mut defer = vec![];

    let mut opaque = 0;
    for child in plain {
        if let Some(line) = debug_frame(child, ctx) {
            match line {
                Line::Defer(line) => {
                    defer.push(line);
                }
                Line::Next(line) => groups.push(
                    line.lines()
                        .map(ToOwned::to_owned)
                        .map(Instruction::plain)
                        .collect(),
                ),
            }
        } else {
            opaque += 1;
        }
    }

    for line in defer {
        groups.push(
            line.lines()
                .map(ToOwned::to_owned)
                .map(Instruction::plain)
                .collect(),
        )
    }

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
            let content = debug_frame_root(child, ctx);

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
        let mut ctx = HookContextImpl::default();

        for frame in self.current_frames() {
            let display = debug_frame_root(frame, &mut ctx);

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

        // only output detailed information (like backtraces), if alternative mode has been enabled.
        if fmt.alternate() {
            let suffix = ctx
                .text
                .into_iter()
                .map(|lines| lines.join("\n"))
                .collect::<Vec<_>>()
                .join("\n\n");
            lines.push_str("\n\n");
            lines.push_str(&suffix);
        }

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
