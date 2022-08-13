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
//!     fmt::Emit,
//!     Report,
//! };
//! use error_stack::fmt::HookContext;
//!
//! // this will never be called, because the a hook after this one has already "taken ownership" of `u64`
//! Report::install_debug_hook(|_: &u64| Emit::next("will never be called"));
//!
//!  // `HookContext` always has a type parameter, which needs to be the same as the type of the
//!  // value, we use `HookContext` here as storage, to store values specific to this hook.
//!  // Here we make use of the auto-incrementing feature.
//! Report::install_debug_hook(|_: &u32, ctx: &mut HookContext<u32>| Emit::next(format!("u32 value {}", ctx.increment())));
//!
//!  // we do not need to make use of the context, to either store a value for the duration of the
//!  // rendering, or to render additional text, which is why we omit the parameter.
//! Report::install_debug_hook(|val: &u64| Emit::next(format!("u64 value ({val})")));
//!
//! Report::install_debug_hook(|_: &u16, ctx: &mut HookContext<u16>| {
//!     // we set a value, which will be removed on non-alternate views
//!     // and is going to be appended to the actual return value.
//!     ctx.set_text("Look! I was rendered from a `u16`");
//!     Emit::next("For more information, look down below")
//!  });
//!
//!  // you can use arbitrary values as arguments, just make sure that you won't repeat them.
//!  // here we use [`Emit::defer`], this means that this value will be put at the end of the group.
//! Report::install_debug_hook(|val: &String| Emit::defer(val));
//!
//!
//! let report = Report::new(Error::from(ErrorKind::InvalidInput)).attach(2u64).attach("This is
//! going to be at the end".to_owned()).attach(3u32).attach(3u32).attach(4u16);
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
    mem,
};

#[cfg(feature = "hooks")]
pub use hook::HookContext;
use hook::HookContextImpl;
#[cfg(feature = "hooks")]
pub(crate) use hook::Hooks;
#[cfg(feature = "hooks")]
pub use hook::{Builtin, Hook};
#[cfg(not(feature = "hooks"))]
pub(crate) use hook::{Builtin, Hook};
#[cfg(all(nightly, feature = "experimental"))]
pub use nightly::DebugDiagnostic;
#[cfg(feature = "glyph")]
use owo_colors::{OwoColorize, Stream::Stdout, Style as OwOStyle};

use crate::{AttachmentKind, Context, Frame, FrameKind, Report};

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
///     fmt::{Emit},
///     Report,
/// };
///
/// Report::install_debug_hook(|val: &u64| Emit::next(format!("u64: {val}")));
/// Report::install_debug_hook(|val: &u32| Emit::defer(format!("u32: {val}")));
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

#[cfg(feature = "glyph")]
impl Display for Symbol {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        match self {
            Self::Location => f.write_str(""),
            Self::Vertical => f.write_str("│"),
            Self::VerticalRight => f.write_str("├"),
            Self::Horizontal => f.write_str("─"),
            Self::HorizontalLeft => f.write_str("╴"),
            Self::HorizontalDown => f.write_str("┬"),
            Self::ArrowRight => f.write_str("▶"),
            Self::CurveRight => f.write_str("╰"),
            Self::Space => f.write_str(" "),
        }
    }
}

#[cfg(not(feature = "glyph"))]
impl Display for Symbol {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        match self {
            Self::Location => f.write_str("@ "),
            Self::Vertical | Self::VerticalRight => f.write_str("|"),
            Self::Horizontal | Self::HorizontalDown => f.write_str("-"),
            Self::ArrowRight => f.write_str(">"),
            Self::CurveRight => f.write_str(r"\"),
            // `Self::HorizontalLeft` is erased for readability
            Self::Space | Self::HorizontalLeft => f.write_str(" "),
        }
    }
}

/// Small compatability layer between owocolors regardless if we use glyph or not
#[derive(Debug, Copy, Clone)]
struct Style {
    bold: bool,
    fg_gray: bool,
}

impl Style {
    const fn new() -> Self {
        Self {
            bold: false,
            fg_gray: false,
        }
    }

    const fn bold(mut self) -> Self {
        self.bold = true;
        self
    }

    const fn gray(mut self) -> Self {
        self.fg_gray = true;
        self
    }
}

#[cfg(feature = "glyph")]
impl From<Style> for OwOStyle {
    fn from(val: Style) -> Self {
        let mut this = Self::new();

        if val.bold {
            this = this.bold();
        }

        if val.fg_gray {
            this = this.bright_black();
        }

        this
    }
}

#[derive(Debug, Copy, Clone)]
enum Position {
    First,
    Middle,
    Last,
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
    Symbol(Symbol),

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
        minimal: bool,
    },
}

/// Minimized instruction, which looses information about what it represents and converts it to only
/// symbols, this then is output instead.
enum PreparedInstruction<'a> {
    Symbol(&'a Symbol),
    Symbols(&'a [Symbol]),
    Content(&'a str, &'a Style),
}

impl Instruction {
    /// Reason for allow:
    /// > This is just a big statement to convert to a prepared instruction, there
    /// isn't really any logic here
    #[allow(clippy::too_many_lines)]
    fn prepare(&self) -> PreparedInstruction {
        match self {
            Self::Value { value, style } => PreparedInstruction::Content(value, style),
            Self::Symbol(symbol) => PreparedInstruction::Symbol(symbol),

            Self::Group { position } => match position {
                Position::First => PreparedInstruction::Symbols(&[
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
                Position::Last => PreparedInstruction::Symbols(&[
                    Symbol::Space,
                    Symbol::CurveRight,
                    Symbol::ArrowRight,
                    Symbol::Space,
                ]),
            },

            Self::Context { position } => match position {
                Position::First | Position::Middle => PreparedInstruction::Symbols(&[
                    Symbol::VerticalRight,
                    Symbol::Horizontal,
                    Symbol::ArrowRight,
                    Symbol::Space,
                ]),
                Position::Last => PreparedInstruction::Symbols(&[
                    Symbol::CurveRight,
                    Symbol::Horizontal,
                    Symbol::ArrowRight,
                    Symbol::Space,
                ]),
            },

            Self::Attachment { position } => match position {
                Position::First | Position::Middle => {
                    PreparedInstruction::Symbols(&[Symbol::VerticalRight, Symbol::HorizontalLeft])
                }
                Position::Last => {
                    PreparedInstruction::Symbols(&[Symbol::CurveRight, Symbol::HorizontalLeft])
                }
            },

            // Indentation (like `|   ` or ` |  `)
            Self::Indent {
                group: true,
                visible: true,
                spacing: true,
                ..
            } => PreparedInstruction::Symbols(&[
                Symbol::Space,
                Symbol::Vertical,
                Symbol::Space,
                Symbol::Space,
            ]),
            Self::Indent {
                group: true,
                visible: true,
                spacing: false,
                ..
            } => PreparedInstruction::Symbols(&[Symbol::Space, Symbol::Vertical]),
            Self::Indent {
                group: false,
                visible: true,
                spacing: true,
                minimal: false,
            } => PreparedInstruction::Symbols(&[
                Symbol::Vertical,
                Symbol::Space,
                Symbol::Space,
                Symbol::Space,
            ]),
            Self::Indent {
                group: false,
                visible: true,
                spacing: true,
                minimal: true,
            } => PreparedInstruction::Symbols(&[Symbol::Vertical, Symbol::Space]),
            Self::Indent {
                group: false,
                visible: true,
                spacing: false,
                ..
            } => PreparedInstruction::Symbols(&[Symbol::Vertical]),
            Self::Indent {
                visible: false,
                spacing: true,
                minimal: false,
                ..
            } => PreparedInstruction::Symbols(&[
                Symbol::Space,
                Symbol::Space,
                Symbol::Space,
                Symbol::Space,
            ]),
            Self::Indent {
                visible: false,
                spacing: true,
                minimal: true,
                ..
            } => PreparedInstruction::Symbols(&[Symbol::Space, Symbol::Space]),
            Self::Indent {
                visible: false,
                spacing: false,
                ..
            } => PreparedInstruction::Symbols(&[]),
        }
    }
}

#[cfg(feature = "glyph")]
impl Display for Instruction {
    fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
        match self.prepare() {
            PreparedInstruction::Symbol(symbol) => {
                Display::fmt(symbol, fmt)?;
            }
            PreparedInstruction::Symbols(symbols) => {
                for symbol in symbols {
                    Display::fmt(&symbol.if_supports_color(Stdout, OwoColorize::red), fmt)?;
                }
            }
            PreparedInstruction::Content(value, &style) => Display::fmt(
                &value.if_supports_color(Stdout, |value| value.style(style.into())),
                fmt,
            )?,
        }

        Ok(())
    }
}

#[cfg(not(feature = "glyph"))]
impl Display for Instruction {
    fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
        match self.prepare() {
            PreparedInstruction::Symbol(symbol) => {
                Display::fmt(symbol, fmt)?;
            }
            PreparedInstruction::Symbols(symbols) => {
                for symbol in symbols {
                    Display::fmt(symbol, fmt)?;
                }
            }
            PreparedInstruction::Content(value, _) => fmt.write_str(value)?,
        }

        Ok(())
    }
}

struct Line(Vec<Instruction>);

impl Line {
    const fn new() -> Self {
        Self(Vec::new())
    }

    fn push(mut self, instruction: Instruction) -> Self {
        self.0.push(instruction);
        self
    }

    fn into_lines(self) -> Lines {
        let lines = Lines::new();
        lines.after(self)
    }
}

impl Display for Line {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        for instruction in self.0.iter().rev() {
            Display::fmt(instruction, f)?;
        }

        Ok(())
    }
}

struct Lines(VecDeque<Line>);

impl Lines {
    fn new() -> Self {
        Self(VecDeque::new())
    }

    fn into_iter(self) -> alloc::collections::vec_deque::IntoIter<Line> {
        self.0.into_iter()
    }

    fn then(mut self, other: Self) -> Self {
        self.0.extend(other.0);
        self
    }

    fn before(mut self, line: Line) -> Self {
        self.0.push_front(line);
        self
    }

    fn after(mut self, line: Line) -> Self {
        self.0.push_back(line);
        self
    }

    fn into_vec(self) -> Vec<Line> {
        self.0.into_iter().collect()
    }
}

impl FromIterator<Line> for Lines {
    fn from_iter<T: IntoIterator<Item = Line>>(iter: T) -> Self {
        Self(iter.into_iter().collect())
    }
}

/// Collect the current "stack", a stack are the current frames which only have a single
/// source/parent.
/// This searches until it finds a stack "split", where a frame has more than a single source.
fn collect<'a>(root: &'a Frame, prefix: &'a [&Frame]) -> (Vec<&'a Frame>, &'a [Frame]) {
    let mut stack = vec![];
    stack.extend(prefix);
    stack.push(root);

    let mut ptr = Some(root);
    let mut next: &'a [_] = &[];

    while let Some(current) = ptr.take() {
        let sources = current.sources();

        match sources {
            [parent] => {
                stack.push(parent);
                ptr = Some(parent);
            }
            sources => {
                next = sources;
            }
        }
    }

    (stack, next)
}

/// Partition the tree, this looks for the first `Context`,
/// then moves it up the chain and adds it to our results.
/// Once we reach the end all remaining items on the stack are added to the prefix pile,
/// which will be used in next iteration.
fn partition<'a>(stack: &'a [&'a Frame]) -> (Vec<(&'a Frame, Vec<&'a Frame>)>, Vec<&'a Frame>) {
    let mut result = vec![];
    let mut queue = vec![];

    for frame in stack {
        if matches!(frame.kind(), FrameKind::Context(_)) {
            let frames = mem::take(&mut queue);

            result.push((*frame, frames));
        } else {
            queue.push(*frame);
        }
    }

    (result, queue)
}

fn debug_context(frame: &Frame, context: &dyn Context, alternate: bool) -> (Lines, Line) {
    let loc = frame.location();
    let context = context
        .to_string()
        .lines()
        .map(ToOwned::to_owned)
        .enumerate()
        .map(|(idx, value)| {
            if idx == 0 {
                Line::new().push(Instruction::Value {
                    value,
                    style: Style::new().bold(),
                })
            } else {
                Line::new().push(Instruction::Value {
                    value,
                    style: Style::new(),
                })
            }
        })
        .enumerate()
        .map(|(idx, line)| {
            if idx == 0 {
                line
            } else {
                line.push(Instruction::Indent {
                    group: false,
                    visible: true,
                    spacing: true,
                    minimal: true,
                })
            }
        })
        .collect();

    let loc = Line::new()
        .push(Instruction::Value {
            value: if alternate {
                format!("{loc:?}")
            } else {
                loc.to_string()
            },
            style: Style::new().gray(),
        })
        .push(Instruction::Symbol(Symbol::Location));

    (context, loc)
}

struct Opaque(usize);

impl Opaque {
    const fn new() -> Self {
        Self(0)
    }

    fn increase(&mut self) {
        self.0 += 1;
    }

    fn render(self) -> Option<Line> {
        match self.0 {
            0 => None,
            1 => Some(Line::new().push(Instruction::Value {
                value: "1 additional attachment".to_owned(),
                style: Style::new(),
            })),
            n => Some(Line::new().push(Instruction::Value {
                value: format!("{n} additional attachments"),
                style: Style::new(),
            })),
        }
    }
}

fn debug_attachments(
    loc: Option<Line>,
    ctx: &mut HookContextImpl,
    last: bool,
    frames: Vec<&Frame>,
) -> Lines {
    let mut opaque = Opaque::new();

    // evaluate all frames to their respective values, will call all hooks with the current context
    let (next, defer): (Vec<_>, _) = frames
        .into_iter()
        .map(|frame| match frame.kind() {
            FrameKind::Context(_) => unreachable!(),
            FrameKind::Attachment(AttachmentKind::Opaque(_)) => {
                #[cfg(all(nightly, feature = "experimental"))]
                if let Some(debug) = frame.request_ref::<DebugDiagnostic>() {
                    for text in debug.text() {
                        ctx.cast::<()>().set_text(text);
                    }

                    return Some(debug.output().clone());
                }

                #[cfg(feature = "hooks")]
                {
                    let lock = Report::format_hook();
                    return lock.call(frame, ctx.cast());
                };

                #[cfg(not(feature = "hooks"))]
                {
                    Builtin.call(frame, ctx.cast())
                }
            }
            FrameKind::Attachment(AttachmentKind::Printable(attachment)) => {
                Some(attachment.to_string()).map(Emit::Next)
            }
        })
        // increase the opaque counter if we're unable to determine the actual value of the frame
        .inspect(|value| {
            if value.is_none() {
                opaque.increase();
            }
        })
        .flatten()
        .partition(|f| matches!(f, Emit::Next(_)));

    let opaque = opaque.render();

    // calculate the len, combine next and defer emitted values into a single stream
    let len =
        next.len() + defer.len() + loc.as_ref().map_or(0, |_| 1) + opaque.as_ref().map_or(0, |_| 1);
    let lines = next
        .into_iter()
        .chain(defer.into_iter())
        .map(|emit| match emit {
            Emit::Defer(value) | Emit::Next(value) => value,
        })
        .map(|value| {
            value
                .lines()
                .map(ToOwned::to_owned)
                .map(|line| {
                    Line::new().push(Instruction::Value {
                        value: line,
                        style: Style::new(),
                    })
                })
                .collect::<Vec<_>>()
        });

    // indentation for every first line, use `Instruction::Attachment`, otherwise use minimal indent
    // omit that indent when we're the last value
    loc.into_iter()
        .map(|line| line.into_lines().into_vec())
        .chain(lines)
        .chain(opaque.into_iter().map(|line| line.into_lines().into_vec()))
        .enumerate()
        .flat_map(|(idx, lines)| {
            let position = match idx {
                pos if pos + 1 == len && last => Position::Last,
                0 => Position::First,
                _ => Position::Middle,
            };

            lines.into_iter().enumerate().map(move |(idx, line)| {
                if idx == 0 {
                    line.push(Instruction::Attachment { position })
                } else {
                    line.push(Instruction::Indent {
                        group: false,
                        visible: !matches!(position, Position::Last),
                        spacing: true,
                        minimal: true,
                    })
                }
            })
        })
        .collect()
}

fn debug_render(head: Lines, contexts: VecDeque<Lines>, sources: Vec<Lines>) -> Lines {
    let len = sources.len();
    let sources = sources
        .into_iter()
        .enumerate()
        .map(|(idx, lines)| {
            let position = match idx {
                // this is first to make sure that 0 is caught as `Last` instead of `First`
                pos if pos + 1 == len => Position::Last,
                0 => Position::First,
                _ => Position::Middle,
            };

            lines
            .into_iter()
            .enumerate()
            .map(|(idx, line)| {
                if idx == 0 {
                    line.push(Instruction::Group { position })
                } else {
                    line.push(Instruction::Indent {
                        group: true,
                        visible: !matches!(position, Position::Last),
                        spacing: true,
                        minimal: false,
                    })
                }
            })
            .collect::<Lines>()
            // add a buffer line for readability
            .before(
                Line::new().push(Instruction::Indent {
                    group: idx != 0,
                    visible: true,
                    spacing: false,
                    minimal: false,
                })
            )
        })
        .collect::<Vec<_>>();

    let tail = !sources.is_empty();
    let len = contexts.len();

    // insert the arrows and buffer indentation
    let contexts = contexts.into_iter().enumerate().flat_map(|(idx, lines)| {
        let position = match idx {
            pos if pos + 1 == len && !tail => Position::Last,
            0 => Position::First,
            _ => Position::Middle,
        };

        let mut lines = lines
            .into_iter()
            .enumerate()
            .map(|(idx, line)| {
                if idx == 0 {
                    line.push(Instruction::Context { position })
                } else {
                    line.push(Instruction::Indent {
                        group: false,
                        visible: !matches!(position, Position::Last),
                        spacing: true,
                        minimal: false,
                    })
                }
            })
            .collect::<Vec<_>>();

        // this is not using `.collect<>().before()`, because somehow that kills rustfmt?!
        lines.insert(
            0,
            Line::new().push(Instruction::Indent {
                group: false,
                visible: true,
                spacing: false,
                minimal: false,
            }),
        );

        lines
    });

    head.into_iter()
        .chain(contexts)
        .chain(sources.into_iter().flat_map(Lines::into_vec))
        .collect()
}

fn debug_frame(root: &Frame, ctx: &mut HookContextImpl, prefix: &[&Frame]) -> Vec<Lines> {
    let (stack, sources) = collect(root, prefix);
    let (stack, prefix) = partition(&stack);

    let len = stack.len();
    // collect all the contexts that we have partitioned previously and render them
    let mut contexts: VecDeque<_> = stack
        .into_iter()
        .enumerate()
        .map(|(idx, (head, body))| {
            // each "paket" on the stack is made up of a head (guaranteed to be a `Context`) and
            // `n` attachments.
            // The attachments are rendered as direct descendants of the parent context
            let (head, loc) = debug_context(
                head,
                match head.kind() {
                    FrameKind::Context(c) => c,
                    FrameKind::Attachment(_) => unreachable!(),
                },
                ctx.alternate(),
            );

            let body = debug_attachments(
                Some(loc),
                ctx,
                (len == 1 && sources.is_empty()) || idx > 0,
                body,
            );

            head.then(body)
        })
        .collect();

    let sources = sources
        .iter()
        // if the group is "transparent" (has no context), it will return all it's parents rendered
        // this is why we must first flat_map.
        .flat_map(|source| debug_frame(source, ctx, &prefix))
        .collect::<Vec<_>>();

    // if there is no context, this is considered a "transparent" group,
    // and just directly returns all sources without modifying them
    if contexts.is_empty() {
        return sources;
    }

    // take the first Context, this is our "root", all others are indented
    // this unwrap always succeeds due to the call before <3
    let head = contexts.pop_front().unwrap();

    // combine everything into a single group
    vec![debug_render(head, contexts, sources)]
}

impl<C> Debug for Report<C> {
    fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
        #[cfg(feature = "hooks")]
        if let Some(hook) = Report::debug_hook() {
            return hook(self.generalized(), fmt);
        }

        let mut ctx = HookContextImpl::default();

        let mut lines = self
            .current_frames()
            .iter()
            .flat_map(|frame| debug_frame(frame, &mut ctx, &[]))
            .enumerate()
            .flat_map(|(idx, lines)| {
                if idx == 0 {
                    lines.into_vec()
                } else {
                    lines
                        .before(Line::new().push(Instruction::Indent {
                            group: false,
                            visible: false,
                            spacing: false,
                            minimal: false,
                        }))
                        .into_vec()
                }
            })
            .map(|line| line.to_string())
            .collect::<Vec<_>>()
            .join("\n");

        // TODO: force
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
