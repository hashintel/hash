//! Implementation of formatting, to enable colors and the use of box-drawing characters use the
//! `glyph` feature.
//!
//! This is inspired by the [miette](https://docs.rs/miette/latest/miette/index.html)-crate.
//!
//! # Hooks
//!
//! The format implementation (especially the [`Debug`] implementation),
//! can be easily extended using [`Hooks`], they provide an easy and ergonomic way to partially
//! modify the format and enable the output of types that are not necessarily added via
//! `.attach_printable()` or are unable to implement [`Display`].
//!
//! [`Hooks`] can be attached through the central hooking mechanism which `error-stack`
//! provides via [`Report::install_hook`].
//!
//! A format [`Hook`] is a function [`Fn`], which is [`Send`], [`Sync`] and has a `'static`
//! timeline, this means that in contrast to [`FnMut`] they **may not** directly mutate state.
//! You can still achieve mutable global state (or use mutable resources in the current scope)
//! through interior mutability, which is implemented for example implemented for [`Mutex`].
//!
//! This function takes one required and one optional argument: `val` as reference of type `&T`,
//! as well as a current `ctx` ([`&mut HookContext`]), which is created for every [`Debug`]
//! invocation separately.
//! The function must return of value [`Line`], indicating if the value is going to be emitted
//! during regular flow (which should be most of the cases), or is going to be deferred until the
//! end of the current group of frames.
//! This function will then automatically be called for every [`Frame`], which saved an attachment
//! of the type `T` (which was specified as the type of `val` in the hook).
//! These function hooks currently do **not** support functions with traits attached to them.
//!
//! ## Example
//!
//! ```rust
//! use std::io::{Error, ErrorKind};
//! use insta::assert_snapshot;
//! use error_stack::{
//!     fmt::{Hooks, Emit},
//!     Report,
//! };
//! use error_stack::fmt::HookContext;
//!
//! # stringify!(
//! Report::install_hook(Hooks::new()
//! # // to make the output easier, we actually use `::bare`, but that shouldn't be really used in this example
//! # )); Report::install_hook(Hooks::bare()
//!  // this will never be called, because the a hook after this one has already "taken ownership" of `u64`
//!  .push(|_: &u64| Emit::next("will never be called"))
//!  // `HookContext` always has a type parameter, which needs to be the same as the type of the
//!  // value, we use `HookContext` here as storage, to store values specific to this hook.
//!  // Here we make use of the auto-incrementing feature.
//!  .push(|_: &u32, ctx: &mut HookContext<u32>| Emit::next(format!("u32 value {}", ctx.increment())))
//!  // we do not need to make use of the context, to either store a value for the duration of the
//!  // rendering, or to render additional text, which is why we omit the parameter.
//!  .push(|val: &u64| Emit::next(format!("u64 value ({val})")))
//!  .push(|_: &u16, ctx: &mut HookContext<u16>| {
//!     // we set a value, which will be removed on non-alternate views
//!     // and is going to be appended to the actual return value.
//!     ctx.set_text("Look! I was rendered from a `u16`");
//!     Emit::next("For more information, look down below")
//!  })
//!  // you can use arbitrary values as arguments, just make sure that you won't repeat them.
//!  // here we use [`Line::defer`], this means that this value will be put at the end of the group.
//!  .push(|val: &String| Emit::defer(val))
//! ).unwrap();
//!
//! let report = Report::new(Error::from(ErrorKind::InvalidInput)).attach(2u64).attach("This is going to be at the end".to_owned()).attach(3u32).attach(3u32).attach(4u16);
//!
//! assert_snapshot!(format!("{report:?}"), @r###"For more information, look down below
//! │ src/fmt/mod.rs:38:155
//! ├─▶ u32 value 0
//! │   ╰ src/fmt/mod.rs:38:142
//! ├─▶ u32 value 1
//! │   ╰ src/fmt/mod.rs:38:129
//! ├─▶ u64 value (2)
//! │   ╰ src/fmt/mod.rs:38:64
//! ├─▶ invalid input parameter
//! │   ╰ src/fmt/mod.rs:38:14
//! ├─▶ This is going to be at the end
//! │   ╰ src/fmt/mod.rs:38:77
//! ╰─▶ 1 additional attachment"###);
//!
//! assert_snapshot!(format!("{report:#?}"), @r###"For more information, look down below
//! │ src/fmt/mod.rs:38:155
//! ├─▶ u32 value 0
//! │   ╰ src/fmt/mod.rs:38:142
//! ├─▶ u32 value 1
//! │   ╰ src/fmt/mod.rs:38:129
//! ├─▶ u64 value (2)
//! │   ╰ src/fmt/mod.rs:38:64
//! ├─▶ invalid input parameter
//! │   ╰ src/fmt/mod.rs:38:14
//! ├─▶ This is going to be at the end
//! │   ╰ src/fmt/mod.rs:38:77
//! ╰─▶ 1 additional attachment
//!
//!
//! ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//!
//! Look! I was rendered from a `u16`"###);
//! ```
//!
//!
//! [`Display`]: std::fmt::Display
//! [`Debug`]: std::fmt::Debug
//! [`Mutex`]: std::sync::Mutex

mod hook;
#[cfg(all(nightly, feature = "experimental"))]
mod nightly;

use alloc::{
    borrow::ToOwned,
    collections::VecDeque,
    format,
    string::{String, ToString},
    vec,
    vec::Vec,
};
use core::{
    fmt,
    fmt::{Debug, Display, Formatter},
    iter::once,
    panic::Location,
};

#[cfg(feature = "hooks")]
pub(crate) use hook::ErasedHooks;
use hook::HookContextImpl;
#[cfg(feature = "hooks")]
pub use hook::{Builtin, Hook};
#[cfg(not(feature = "hooks"))]
pub(crate) use hook::{Builtin, Hook};
#[cfg(feature = "hooks")]
pub use hook::{HookContext, Hooks};
#[cfg(all(nightly, feature = "experimental"))]
pub use nightly::DebugDiagnostic;
#[cfg(feature = "glyph")]
use owo_colors::{OwoColorize, Stream::Stdout};
use owo_colors::{Stream, Style};

use crate::{AttachmentKind, Frame, FrameKind, Report};

/// Modify the behaviour, with which `Line`s returned from hook invocations are rendered.
///
/// A `Line` can either be emitted immediately as the [`Line::Next`] line, or defer the via
/// [`Line::Defer`] until the end of the current "group".
/// [`Line::Defer`] does not modify the order of frames, only emits them after all [`Line::Next`]
/// frames in the order they were added in.
///
/// # Example
///
/// ```rust
/// use std::io::{Error, ErrorKind};
/// use insta::assert_debug_snapshot;
///
/// use error_stack::{
///     fmt::{Hooks, Emit},
///     Report,
/// };
///
/// Report::install_hook(
///     Hooks::bare()
///         .push(|val: &u64| Emit::next(format!("u64: {val}")))
///         .push(|val: &u32| Emit::defer(format!("u32: {val}"))),
/// )
/// .unwrap();
///
/// let report = Report::new(Error::from(ErrorKind::InvalidInput))
///     .attach(1u64)
///     .attach(2u32)
///     .attach(3u64)
///     .attach(4u32)
///     .attach(5u32)
///     .attach(6u64)
///     .attach(7u64);
///
/// assert_debug_snapshot!(report, @r###"u64: 7
/// │ src/fmt/mod.rs:26:6
/// ├─▶ u64: 6
/// │   ╰ src/fmt/mod.rs:25:6
/// ├─▶ u64: 3
/// │   ╰ src/fmt/mod.rs:22:6
/// ├─▶ u64: 1
/// │   ╰ src/fmt/mod.rs:20:6
/// ├─▶ invalid input parameter
/// │   ╰ src/fmt/mod.rs:19:14
/// ├─▶ u32: 5
/// │   ╰ src/fmt/mod.rs:24:6
/// ├─▶ u32: 4
/// │   ╰ src/fmt/mod.rs:23:6
/// ├─▶ u32: 2
/// │   ╰ src/fmt/mod.rs:21:6
/// ╰─▶ 1 additional attachment"###)
/// ```
#[derive(Debug, Clone)]
pub enum Emit {
    /// Line is going to be emitted after all immediate lines have been emitted from the current
    /// stack.
    /// This means that deferred lines will always be last in a group.
    Defer(String),
    /// Going to be emitted immediately as the next line in the chain of
    /// attachments and contexts.
    Next(String),
}

impl Emit {
    /// Create a new [`Next`] line, which is emitted immediately in the tree.
    ///
    /// [`Next`]: Self::Next
    pub fn next<T: Into<String>>(line: T) -> Self {
        Self::Next(line.into())
    }

    /// Create a new [`Defer`] line, which is deferred until the end of the current chain of
    /// attachments and contexts.
    ///
    /// [`Defer`]: Self::Defer
    pub fn defer<T: Into<String>>(line: T) -> Self {
        Self::Defer(line.into())
    }
}

#[derive(Debug)]
enum Glyph {
    Location,
}

#[derive(Debug, Copy, Clone)]
enum Symbol {
    // special, used to indicate location
    Location,

    Vertical,
    VerticalRight,
    Horizontal,
    HorizontalLeft,
    HorizontalDown,
    ArrowRight,
    CurveRight,

    Space,
}

#[cfg(feature = "hooks")]
impl Display for Symbol {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        match self {
            Symbol::Location => f.write_str(""),
            Symbol::Vertical => f.write_str("│"),
            Symbol::VerticalRight => f.write_str("├"),
            Symbol::Horizontal => f.write_str("─"),
            Symbol::HorizontalLeft => f.write_str("╴"),
            Symbol::HorizontalDown => f.write_str("┬"),
            Symbol::ArrowRight => f.write_str("▶"),
            Symbol::CurveRight => f.write_str("╰"),
            Symbol::Space => f.write_str(" "),
        }
    }
}

#[cfg(not(feature = "hooks"))]
impl Display for Symbol {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        match self {
            Symbol::Location => f.write_str("@ "),
            Symbol::Vertical => f.write_str("|"),
            Symbol::VerticalRight => f.write_str("|"),
            Symbol::Horizontal => f.write_str("-"),
            Symbol::HorizontalLeft => f.write_str("-"),
            Symbol::HorizontalDown => f.write_str("-"),
            Symbol::ArrowRight => f.write_str(">"),
            Symbol::CurveRight => f.write_str(r"\"),
            Symbol::Space => f.write_str(" "),
        }
    }
}

#[derive(Debug, Copy, Clone)]
enum Position {
    Start,
    Middle,
    End,
}

/// The display of content is using an instruction style architecture,
/// where we first render every indentation and action as an [`Instruction`], these instructions are
/// a lot easier to reason about and enable better manipulation of the stream of data.
///
/// Once generation of all data is done, it is interpreted as a String, with glyphs or color added
/// (if supported and enabled).
#[derive(Debug)]
enum Instruction {
    Value {
        value: String,
        style: Style,
    },

    Group {
        position: Position,
    },
    /// This does not distinguish between first and middle, the true first is handled a bit
    /// differently.
    Context {
        position: Position,
    },
    /// `Position::Last` means *that nothing follows*
    Attachment {
        position: Position,
    },

    Indent {
        /// Is this used in a group context, if that is the case, then add a single leading space
        group: bool,
        /// Should the indent be visible, if that isn't the case it will render a space instead of
        /// `|`
        visible: bool,
        /// Should spacing included, this is the difference between `|   ` and `|`
        spacing: bool,
    },
}

/// Minimized instruction, which looses information about what it represents and converts it to only
/// symbols, this then is output instead.
enum PreparedInstruction<'a> {
    Symbols(&'a [Symbol]),
    Content(&'a str, &'a Style),
}

impl Instruction {
    fn prepare(&self) -> PreparedInstruction {
        match self {
            Instruction::Value { value, style } => PreparedInstruction::Content(&value, style),
            Instruction::Group { position } => match position {
                Position::Start => PreparedInstruction::Symbols(&[
                    Symbol::CurveRight,
                    Symbol::HorizontalDown,
                    Symbol::ArrowRight,
                    Symbol::Space,
                ]),
                Position::Middle => PreparedInstruction::Symbols(&[
                    Symbol::Space,
                    Symbol::VerticalRight,
                    Symbol::ArrowRight,
                    Symbol::Space,
                ]),
                Position::End => PreparedInstruction::Symbols(&[
                    Symbol::Space,
                    Symbol::CurveRight,
                    Symbol::ArrowRight,
                    Symbol::Space,
                ]),
            },
            Instruction::Context { position } => match position {
                Position::Start | Position::Middle => PreparedInstruction::Symbols(&[
                    Symbol::VerticalRight,
                    Symbol::Horizontal,
                    Symbol::ArrowRight,
                    Symbol::Space,
                ]),
                Position::End => PreparedInstruction::Symbols(&[
                    Symbol::CurveRight,
                    Symbol::Horizontal,
                    Symbol::ArrowRight,
                    Symbol::Space,
                ]),
            },
            Instruction::Attachment { position } => match position {
                Position::Start | Position::Middle => {
                    PreparedInstruction::Symbols(&[Symbol::VerticalRight, Symbol::HorizontalLeft])
                }
                Position::End => {
                    PreparedInstruction::Symbols(&[Symbol::CurveRight, Symbol::HorizontalLeft])
                }
            },
            Instruction::Indent {
                group: true,
                visible: true,
                spacing: true,
            } => PreparedInstruction::Symbols(&[
                Symbol::Space,
                Symbol::Vertical,
                Symbol::Space,
                Symbol::Space,
            ]),
            Instruction::Indent {
                group: true,
                visible: true,
                spacing: false,
            } => PreparedInstruction::Symbols(&[Symbol::Space, Symbol::Vertical]),
            Instruction::Indent {
                group: false,
                visible: true,
                spacing: true,
            } => PreparedInstruction::Symbols(&[
                Symbol::Vertical,
                Symbol::Space,
                Symbol::Space,
                Symbol::Space,
            ]),
            Instruction::Indent {
                group: false,
                visible: true,
                spacing: false,
            } => PreparedInstruction::Symbols(&[Symbol::Vertical]),
            Instruction::Indent {
                visible: false,
                spacing: true,
                ..
            } => PreparedInstruction::Symbols(&[
                Symbol::Space,
                Symbol::Space,
                Symbol::Space,
                Symbol::Space,
            ]),
        }
    }
}

impl Display for Instruction {
    fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
        match self.prepare() {
            PreparedInstruction::Symbols(symbols) => {
                for symbol in symbols {
                    Display::fmt(symbol, fmt)?;
                }
            }
            PreparedInstruction::Content(value, style) => {
                value.if_supports_color(Stdout, |value| value.style(*style))
            }
        }

        Ok(())
    }
}

pub struct Line(VecDeque<Instruction>);

impl Line {
    pub fn new(text: String) -> Self {
        let mut deque = VecDeque::new();
        deque.push_back(Instruction::Content(text));

        Self(deque)
    }
}

pub struct Lines(Vec<Line>);

impl Lines {
    pub fn new() -> Self {
        Self(Vec::new())
    }

    pub fn push(&mut self, line: Line) {
        self.0.push(line);
    }

    pub fn iter_mut(&mut self) -> core::slice::IterMut<Line> {
        self.0.iter_mut()
    }
}

fn debug_frame(
    frame: &Frame,
    ctx: &mut HookContextImpl,
) -> Option<(Emit, &'static Location<'static>)> {
    let line = match frame.kind() {
        FrameKind::Context(context) => Some(context.to_string()).map(Emit::Next),
        FrameKind::Attachment(AttachmentKind::Opaque(_)) => {
            #[cfg(all(nightly, feature = "experimental"))]
            if let Some(debug) = frame.request_ref::<DebugDiagnostic>() {
                for text in debug.text() {
                    ctx.cast::<()>().set_text(text);
                }

                return Some(debug.output().clone()).map(|line| (line, frame.location()));
            }

            #[cfg(feature = "hooks")]
            if let Some(hooks) = Report::format_hook() {
                return hooks.call(frame, ctx).map(|line| (line, frame.location()));
            }

            Builtin.call(frame, ctx.cast())
        }
        FrameKind::Attachment(AttachmentKind::Printable(attachment)) => {
            Some(attachment.to_string()).map(Emit::Next)
        }
    }?;

    Some((line, frame.location()))
}

fn push(groups: &mut Vec<Lines>, line: &str, loc: &'static Location<'static>) {
    groups.push(
        line.lines()
            .map(ToOwned::to_owned)
            .map(Instruction::plain)
            .chain(once(Instruction::location(loc)))
            .enumerate()
            .map(|(idx, mut line)| {
                if idx != 0 {
                    line.push_front(Instruction::Title { end: false });
                }

                line
            })
            .collect(),
    );
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
        if let Some((line, loc)) = debug_frame(child, ctx) {
            match line {
                Emit::Defer(line) => {
                    defer.push((line, loc));
                }
                Emit::Next(line) => push(&mut groups, &line, loc),
            }
        } else {
            opaque += 1;
        }
    }

    for (line, loc) in defer {
        push(&mut groups, &line, loc);
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
            let len = content.len();

            content.into_iter().enumerate().map(move |(idx, mut line)| {
                // in the title we need to change from |- to \- if there are no other values.
                // there are places where first is last, but not the other way around,
                // this is why we need to test both.
                // They are not mutually exclusive.
                if (!first || last) && idx == len - 1 {
                    if let Some(Instruction::Title { end }) = line.front_mut() {
                        *end = true;
                    }
                }

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

        let mut lines = lines
            .into_iter()
            .map(|line| {
                line.iter()
                    .map(ToString::to_string)
                    .collect::<Vec<_>>()
                    .concat()
            })
            .collect::<Vec<String>>()
            .join("\n");

        // only output detailed information (like backtraces), if alternative mode has been enabled.
        if fmt.alternate() {
            let suffix = ctx
                .text
                .into_iter()
                .map(|lines| lines.join("\n"))
                .collect::<Vec<_>>()
                .join("\n\n");

            if !suffix.is_empty() {
                lines.push_str("\n\n");
                lines.push_str(&"━".repeat(40));
                lines.push_str("\n\n");
                lines.push_str(&suffix);
            }
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
