//! Implementation of formatting, to enable colors and the use of box-drawing characters use the
//! `pretty-print` feature.
//!
//! # Hooks
//!
//! The [`Debug`] implementation can be easily extended using hooks. Hooks are functions of the
//! signature `Fn(&T, &mut HookContext<T>)`, they provide an ergonomic way to partially modify the
//! output format and enable custom output for types that are not necessarily added via
//! [`Report::attach_printable`] or are unable to implement [`Display`].
//!
//! Hooks can be attached through the central hooking mechanism which `error-stack`
//! provides via [`Report::install_debug_hook`].
//!
//! Hooks are called for contexts which provide additional values through [`Context::provide`] and
//! attachments which are added via [`Report::attach`] or [`Report::attach_printable`]. The order of
//! [`Report::install_debug_hook`] calls determines the order of the rendered output. Note, that
//! Hooks get called on all values provided by [`Context::provide`], but not on the [`Context`]
//! object itself. Therefore if you want to call a hook on a [`Context`] to print in addition to its
//! [`Display`] implementation, you may want to call [`demand.provide_ref(self)`] inside of
//! [`Context::provide`].
//!
//! [`demand.provide_ref(self)`]: core::any::Demand::provide_ref
//!
//! Hook functions need to be [`Fn`] and **not** [`FnMut`], which means they are unable to directly
//! mutate state outside of the closure.
//! You can still achieve mutable state outside of the scope of your closure through interior
//! mutability, e.g. by using the [`std::sync`] module like [`Mutex`], [`RwLock`], and [`atomic`]s.
//!
//! The type, a hook will be called for, is determined by the type of the first argument to the
//! closure. This type can either be specified at the closure level or when calling
//! [`Report::install_debug_hook`].
//! This type needs to be `'static`, [`Send`], and [`Sync`].
//!
//! You can then add additional entries to the body with [`HookContext::push_body`], and entries to
//! the appendix with [`HookContext::push_appendix`], refer to the documentation of [`HookContext`]
//! for further information.
//!
//! ## Example
//!
//! ```rust
//! # // we only test with Rust 1.65, which means that `render()` is unused on earlier version
//! # #![cfg_attr(not(rust_1_65), allow(dead_code, unused_variables, unused_imports))]
//! use std::fmt::{Display, Formatter};
//! use std::io::{Error, ErrorKind};
//! use error_stack::Report;
//!
//! #[derive(Debug)]
//! struct ErrorCode(u64);
//!
//! impl Display for ErrorCode {
//!   fn fmt(&self, fmt: &mut Formatter<'_>) -> std::fmt::Result {
//!     write!(fmt, "error: {}", self.0)
//!   }
//! }
//!
//! struct Suggestion(&'static str);
//! struct Warning(&'static str);
//!
//! // This hook will never be called, because a later invocation of `install_debug_hook` overwrites
//! // the hook for the type `ErrorCode`.
//! Report::install_debug_hook::<ErrorCode>(|_, _| {
//!     unreachable!("will never be called");
//! });
//!
//! // `HookContext` always has a type parameter, which needs to be the same as the type of the
//! // value, we use `HookContext` here as storage, to store values specific to this hook.
//! // Here we make use of the auto-incrementing feature.
//! // The incrementation is type specific, meaning that `context.increment()` for the `Suggestion` hook
//! // will not influence the counter of the `ErrorCode` or `Warning` hook.
//! Report::install_debug_hook::<Suggestion>(|Suggestion(value), context| {
//!     let idx = context.increment_counter() + 1;
//!     context.push_body(format!("suggestion {idx}: {value}"));
//! });
//!
//! // Even though we used `attach_printable`, we can still use hooks, `Display` of a type attached
//! // via `attach_printable` is only ever used when no hook was found.
//! Report::install_debug_hook::<ErrorCode>(|ErrorCode(value), context| {
//!     context.push_body(format!("error ({value})"));
//! });
//!
//! Report::install_debug_hook::<Warning>(|Warning(value), context| {
//!     let idx = context.increment_counter() + 1;
//!
//!     // we set a value, which will be removed on non-alternate views
//!     // and is going to be appended to the actual return value.
//!     if context.alternate() {
//!         context.push_appendix(format!("warning {idx}:\n  {value}"));
//!     }
//!
//!     context.push_body(format!("warning ({idx}) occurred"));
//!  });
//!
//!
//! let report = Report::new(Error::from(ErrorKind::InvalidInput))
//!     .attach_printable(ErrorCode(404))
//!     .attach(Suggestion("try to be connected to the internet."))
//!     .attach(Suggestion("try better next time!"))
//!     .attach(Warning("unable to fetch resource"));
//!
//! # owo_colors::set_override(true);
//! # fn render(value: String) -> String {
//! #     let backtrace = regex::Regex::new(r"backtrace no\. (\d+)\n(?:  .*\n)*  .*").unwrap();
//! #     let backtrace_info = regex::Regex::new(r"backtrace( with (\d+) frames)? \((\d+)\)").unwrap();
//! #
//! #     let value = backtrace.replace_all(&value, "backtrace no. $1\n  [redacted]");
//! #     let value = backtrace_info.replace_all(value.as_ref(), "backtrace ($3)");
//! #
//! #     ansi_to_html::convert_escaped(value.as_ref()).unwrap()
//! # }
//! #
//! # #[cfg(rust_1_65)]
//! # expect_test::expect_file![concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/fmt__doc.snap")].assert_eq(&render(format!("{report:?}")));
//! #
//! println!("{report:?}");
//!
//! # #[cfg(rust_1_65)]
//! # expect_test::expect_file![concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/fmt_doc_alt.snap")].assert_eq(&render(format!("{report:#?}")));
//! #
//! println!("{report:#?}");
//! ```
//!
//! The output of `println!("{report:?}")`:
//!
//! <pre>
#![doc = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/fmt__doc.snap"))]
//! </pre>
//!
//! The output of `println!("{report:#?}")`:
//!
//! <pre>
#![doc = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/fmt_doc_alt.snap"))]
//! </pre>
//!
//! [`Display`]: core::fmt::Display
//! [`Debug`]: core::fmt::Debug
//! [`Mutex`]: std::sync::Mutex
//! [`RwLock`]: std::sync::RwLock
//! [`Backtrace`]: std::backtrace::Backtrace
//! [`SpanTrace`]: tracing_error::SpanTrace
//! [`atomic`]: std::sync::atomic
//! [`Error::provide`]: core::error::Error::provide

#[cfg(feature = "std")]
mod hook;

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
    mem,
};

#[cfg(feature = "std")]
pub use hook::HookContext;
#[cfg(feature = "std")]
pub(crate) use hook::{install_builtin_hooks, Hooks};
#[cfg(feature = "pretty-print")]
use owo_colors::{OwoColorize, Stream, Style as OwOStyle};

use crate::{AttachmentKind, Context, Frame, FrameKind, Report};

#[derive(Debug, Copy, Clone, Eq, PartialEq)]
enum Symbol {
    Vertical,
    VerticalRight,
    Horizontal,
    HorizontalLeft,
    HorizontalDown,
    ArrowRight,
    CurveRight,

    Space,
}

/// We use symbols during resolution, which is efficient and versatile, but makes the conversion
/// between [`Instruction`] to [`Symbol`] harder to comprehend for a user.
///
/// This macro fixes this by creating a compile-time lookup table to easily map every character in
/// the [`Display`] of [`Symbol`] to it's corresponding symbol.
///
/// # Example
///
/// ```ignore
/// assert_eq!(sym!('├', '┬'), &[
///     Symbol::VerticalRight,
///     Symbol::HorizontalDown
/// ])
/// ```
macro_rules! sym {
    (#char '@') => {
        Symbol::Location
    };

    (#char '│') => {
        Symbol::Vertical
    };

    (#char '├') => {
        Symbol::VerticalRight
    };

    (#char '─') => {
        Symbol::Horizontal
    };

    (#char '╴') => {
        Symbol::HorizontalLeft
    };

    (#char '┬') => {
        Symbol::HorizontalDown
    };

    (#char '▶') => {
        Symbol::ArrowRight
    };

    (#char '╰') => {
        Symbol::CurveRight
    };

    (#char ' ') => {
        Symbol::Space
    };

    ($($char:tt),+) => {
        &[$(sym!(#char $char)),*]
    };
}

#[cfg(feature = "pretty-print")]
impl Display for Symbol {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        match self {
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

#[cfg(not(feature = "pretty-print"))]
impl Display for Symbol {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        match self {
            Self::Vertical | Self::VerticalRight | Self::CurveRight => f.write_str("|"),
            Self::Horizontal | Self::HorizontalDown | Self::HorizontalLeft => f.write_str("-"),
            Self::ArrowRight => f.write_str(">"),
            Self::Space => f.write_str(" "),
        }
    }
}

/// Small compatability layer between owocolors regardless if we use pretty-print or not
#[derive(Debug, Copy, Clone)]
struct Style {
    bold: bool,
}

impl Style {
    const fn new() -> Self {
        Self { bold: false }
    }

    const fn bold(mut self) -> Self {
        self.bold = true;
        self
    }
}

#[cfg(feature = "pretty-print")]
impl From<Style> for OwOStyle {
    fn from(value: Style) -> Self {
        let mut this = Self::new();

        if value.bold {
            this = this.bold();
        }

        this
    }
}

#[derive(Debug, Copy, Clone)]
enum Position {
    First,
    Inner,
    Final,
}

#[derive(Debug, Copy, Clone)]
enum Spacing {
    // Standard to create a width of 4 characters
    Full,
    // Minimal width to create a width of 2/3 characters
    Minimal,
}

#[derive(Debug, Copy, Clone)]
struct Indent {
    /// Is this used in a group context, if that is the case, then add a single leading space
    group: bool,
    /// Should the indent be visible, if that isn't the case it will render a space instead of
    /// `|`
    visible: bool,
    /// Should spacing included, this is the difference between `|   ` and `|`
    spacing: Option<Spacing>,
}

impl Indent {
    const fn new(group: bool) -> Self {
        Self {
            group,
            visible: true,
            spacing: Some(Spacing::Full),
        }
    }

    fn spacing(mut self, spacing: impl Into<Option<Spacing>>) -> Self {
        self.spacing = spacing.into();
        self
    }

    const fn visible(mut self, visible: bool) -> Self {
        self.visible = visible;
        self
    }

    const fn group() -> Self {
        Self::new(true)
    }

    const fn no_group() -> Self {
        Self::new(false)
    }

    const fn prepare(self) -> &'static [Symbol] {
        match self {
            Self {
                group: true,
                visible: true,
                spacing: Some(_),
            } => sym!(' ', '│', ' ', ' '),
            Self {
                group: true,
                visible: true,
                spacing: None,
            } => sym!(' ', '│'),
            Self {
                group: false,
                visible: true,
                spacing: Some(Spacing::Full),
            } => sym!('│', ' ', ' ', ' '),
            Self {
                group: false,
                visible: true,
                spacing: Some(Spacing::Minimal),
            } => sym!('│', ' ', ' '),
            Self {
                group: false,
                visible: true,
                spacing: None,
            } => sym!('│'),
            Self {
                visible: false,
                spacing: Some(Spacing::Full),
                ..
            } => sym!(' ', ' ', ' ', ' '),
            Self {
                visible: false,
                spacing: Some(Spacing::Minimal),
                ..
            } => sym!(' ', ' ', ' '),
            Self {
                visible: false,
                spacing: None,
                ..
            } => &[],
        }
    }
}

impl From<Indent> for Instruction {
    fn from(indent: Indent) -> Self {
        Self::Indent(indent)
    }
}

/// The display of content is using an instruction style architecture,
/// where we first render every indentation and action as an [`Instruction`], these instructions
/// are a lot easier to reason about and enable better manipulation of the stream of data.
///
/// Once generation of all data is done, it is interpreted as a String, with glyphs and color added
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
    /// `Position::Final` means *that nothing follows*
    Attachment {
        position: Position,
    },

    Indent(Indent),
}

/// Minimized instruction, which looses information about what it represents and converts it to
/// only symbols, this then is output instead.
enum PreparedInstruction<'a> {
    Symbols(&'a [Symbol]),
    Content(&'a str, &'a Style),
}

impl Instruction {
    // Reason: the match arms are the same intentionally, this makes it more clean which variant
    //  emits which and also keeps it nicely formatted.
    #[allow(clippy::match_same_arms)]
    fn prepare(&self) -> PreparedInstruction {
        match self {
            Self::Value { value, style } => PreparedInstruction::Content(value, style),

            Self::Group { position } => match position {
                Position::First => PreparedInstruction::Symbols(sym!('╰', '┬', '▶', ' ')),
                Position::Inner => PreparedInstruction::Symbols(sym!(' ', '├', '▶', ' ')),
                Position::Final => PreparedInstruction::Symbols(sym!(' ', '╰', '▶', ' ')),
            },

            Self::Context { position } => match position {
                Position::First => PreparedInstruction::Symbols(sym!('├', '─', '▶', ' ')),
                Position::Inner => PreparedInstruction::Symbols(sym!('├', '─', '▶', ' ')),
                Position::Final => PreparedInstruction::Symbols(sym!('╰', '─', '▶', ' ')),
            },

            Self::Attachment { position } => match position {
                Position::First => PreparedInstruction::Symbols(sym!('├', '╴', ' ')),
                Position::Inner => PreparedInstruction::Symbols(sym!('├', '╴', ' ')),
                Position::Final => PreparedInstruction::Symbols(sym!('╰', '╴', ' ')),
            },

            // Indentation (like `|   ` or ` |  `)
            Self::Indent(indent) => PreparedInstruction::Symbols(indent.prepare()),
        }
    }
}

#[cfg(feature = "pretty-print")]
impl Display for Instruction {
    fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
        match self.prepare() {
            PreparedInstruction::Symbols(symbols) => {
                for symbol in symbols {
                    Display::fmt(
                        &symbol.if_supports_color(Stream::Stdout, OwoColorize::red),
                        fmt,
                    )?;
                }
            }
            PreparedInstruction::Content(value, &style) => Display::fmt(
                &value.if_supports_color(Stream::Stdout, |value| value.style(style.into())),
                fmt,
            )?,
        }

        Ok(())
    }
}

#[cfg(not(feature = "pretty-print"))]
impl Display for Instruction {
    fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
        match self.prepare() {
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

fn debug_context(context: &dyn Context) -> Lines {
    context
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
        .collect()
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
                value: "1 additional opaque attachment".to_owned(),
                style: Style::new(),
            })),
            n => Some(Line::new().push(Instruction::Value {
                value: format!("{n} additional opaque attachments"),
                style: Style::new(),
            })),
        }
    }
}

fn debug_attachments_invoke(
    frames: Vec<&Frame>,
    #[cfg(feature = "std")] context: &mut HookContext<Frame>,
) -> (Opaque, Vec<String>) {
    let mut opaque = Opaque::new();

    let body = frames
        .into_iter()
        .map(|frame| match frame.kind() {
            #[cfg(feature = "std")]
            FrameKind::Attachment(AttachmentKind::Opaque(_)) | FrameKind::Context(_) => {
                Report::invoke_debug_format_hook(|hooks| hooks.call(frame, context));
                context.take_body()
            }
            #[cfg(all(not(feature = "std"), feature = "pretty-print"))]
            FrameKind::Context(_) => {
                let location = frame
                    .location()
                    .if_supports_color(Stream::Stdout, OwoColorize::bright_black);

                vec![format!("{location}")]
            }
            #[cfg(all(not(feature = "std"), not(feature = "pretty-print")))]
            FrameKind::Context(_) => {
                let location = frame.location();

                vec![format!("at {location}")]
            }
            #[cfg(not(feature = "std"))]
            FrameKind::Attachment(AttachmentKind::Opaque(_)) => {
                vec![]
            }
            #[cfg(feature = "std")]
            FrameKind::Attachment(AttachmentKind::Printable(attachment)) => {
                Report::invoke_debug_format_hook(|hooks| hooks.call(frame, context));
                let mut body = context.take_body();

                if body.is_empty() {
                    body.push(attachment.to_string());
                }

                body
            }
            #[cfg(not(feature = "std"))]
            FrameKind::Attachment(AttachmentKind::Printable(attachment)) => {
                vec![attachment.to_string()]
            }
        })
        .enumerate()
        .flat_map(|(idx, body)| {
            // increase the opaque counter, if we're unable to determine the actual value of the
            // frame
            if idx > 0 && body.is_empty() {
                opaque.increase();
            }

            body
        })
        .collect();

    (opaque, body)
}

fn debug_attachments(
    position: Position,
    frames: Vec<&Frame>,
    #[cfg(feature = "std")] context: &mut HookContext<Frame>,
) -> Lines {
    let last = matches!(position, Position::Final);

    let (opaque, entries) = debug_attachments_invoke(
        frames,
        #[cfg(feature = "std")]
        context,
    );
    let opaque = opaque.render();

    // Calculate the expected end length, by adding all values that have would contribute to the
    // line count later.
    let len = entries.len() + opaque.as_ref().map_or(0, |_| 1);
    let lines = entries.into_iter().map(|value| {
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

    // indentation for every first line, use `Instruction::Attachment`, otherwise use minimal
    // indent omit that indent when we're the last value
    lines
        .chain(opaque.into_iter().map(|line| line.into_lines().into_vec()))
        .enumerate()
        .flat_map(|(idx, lines)| {
            let position = match idx {
                pos if pos + 1 == len && last => Position::Final,
                0 => Position::First,
                _ => Position::Inner,
            };

            lines.into_iter().enumerate().map(move |(idx, line)| {
                if idx == 0 {
                    line.push(Instruction::Attachment { position })
                } else {
                    line.push(
                        Indent::no_group()
                            .visible(!matches!(position, Position::Final))
                            .spacing(Spacing::Minimal)
                            .into(),
                    )
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
                pos if pos + 1 == len => Position::Final,
                0 => Position::First,
                _ => Position::Inner,
            };

            lines
                .into_iter()
                .enumerate()
                .map(|(idx, line)| {
                    if idx == 0 {
                        line.push(Instruction::Group { position })
                    } else {
                        line.push(
                            Indent::group()
                                .visible(!matches!(position, Position::Final))
                                .into(),
                        )
                    }
                })
                .collect::<Lines>()
                .before(
                    // add a buffer line for readability
                    Line::new().push(Indent::new(idx != 0).spacing(None).into()),
                )
        })
        .collect::<Vec<_>>();

    let tail = !sources.is_empty();
    let len = contexts.len();

    // insert the arrows and buffer indentation
    let contexts = contexts.into_iter().enumerate().flat_map(|(idx, lines)| {
        let position = match idx {
            pos if pos + 1 == len && !tail => Position::Final,
            0 => Position::First,
            _ => Position::Inner,
        };

        let mut lines = lines
            .into_iter()
            .enumerate()
            .map(|(idx, line)| {
                if idx == 0 {
                    line.push(Instruction::Context { position })
                } else {
                    line.push(
                        Indent::no_group()
                            .visible(!matches!(position, Position::Final))
                            .into(),
                    )
                }
            })
            .collect::<Vec<_>>();

        // this is not using `.collect<>().before()`, because somehow that kills rustfmt?!
        lines.insert(0, Line::new().push(Indent::no_group().spacing(None).into()));

        lines
    });

    head.into_iter()
        .chain(contexts)
        .chain(sources.into_iter().flat_map(Lines::into_vec))
        .collect()
}

fn debug_frame(
    root: &Frame,
    prefix: &[&Frame],
    #[cfg(feature = "std")] context: &mut HookContext<Frame>,
) -> Vec<Lines> {
    let (stack, sources) = collect(root, prefix);
    let (stack, prefix) = partition(&stack);

    let len = stack.len();
    // collect all the contexts that we have partitioned previously and render them
    let mut contexts: VecDeque<_> = stack
        .into_iter()
        .enumerate()
        .map(|(idx, (head, mut body))| {
            // each "paket" on the stack is made up of a head (guaranteed to be a `Context`) and
            // `n` attachments.
            // The attachments are rendered as direct descendants of the parent context
            let head_context = debug_context(match head.kind() {
                FrameKind::Context(c) => c,
                FrameKind::Attachment(_) => unreachable!(),
            });

            // reverse all attachments, to make it more logical relative to the attachment order
            body.reverse();
            let body = debug_attachments(
                // This makes sure that we use `╰─` instead of `├─`,
                // this is true whenever we only have a single context and no sources,
                // **or** if our idx is larger than `0`, this might sound false,
                // but this is because contexts other than the first context create a new
                // "indentation", in this indentation we are considered last.
                //
                // Context A
                // ├╴Attachment B
                // ├╴Attachment C <- not last, because we are not the only context
                // |
                // ╰─▶ Context D <- indentation here is handled by `debug_render`!
                //     ├╴Attachment E
                //     ╰╴Attachment F <- last because it's the last of the parent context!
                if (len == 1 && sources.is_empty()) || idx > 0 {
                    Position::Final
                } else {
                    Position::Inner
                },
                once(head).chain(body).collect(),
                #[cfg(feature = "std")]
                context,
            );
            head_context.then(body)
        })
        .collect();

    let sources = sources
        .iter()
        .flat_map(
            // if the group is "transparent" (has no context), it will return all it's parents
            // rendered this is why we must first flat_map.
            |source| {
                debug_frame(
                    source,
                    &prefix,
                    #[cfg(feature = "std")]
                    context,
                )
            },
        )
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
        #[cfg(feature = "std")]
        if let Some(result) = Report::invoke_debug_hook(|hook| hook(self.generalized(), fmt)) {
            return result;
        }

        #[cfg(feature = "std")]
        let mut context = HookContext::new(fmt.alternate());

        #[cfg_attr(not(feature = "std"), allow(unused_mut))]
        let mut lines = self
            .current_frames()
            .iter()
            .flat_map(|frame| {
                debug_frame(
                    frame,
                    &[],
                    #[cfg(feature = "std")]
                    &mut context,
                )
            })
            .enumerate()
            .flat_map(|(idx, lines)| {
                if idx == 0 {
                    lines.into_vec()
                } else {
                    lines
                        .before(
                            Line::new()
                                .push(Indent::no_group().visible(false).spacing(None).into()),
                        )
                        .into_vec()
                }
            })
            .map(|line| line.to_string())
            .collect::<Vec<_>>()
            .join("\n");

        #[cfg(feature = "std")]
        {
            let appendix = context
                .appendix()
                .iter()
                .map(
                    // remove all trailing newlines for a more uniform look
                    |snippet| snippet.trim_end_matches('\n').to_owned(),
                )
                .collect::<Vec<_>>()
                .join("\n\n");

            if !appendix.is_empty() {
                // 44 is the size for the separation.
                lines.reserve(44 + appendix.len());

                lines.push_str("\n\n");
                #[cfg(feature = "pretty-print")]
                {
                    lines.push_str(&"━".repeat(40));
                }
                #[cfg(not(feature = "pretty-print"))]
                {
                    lines.push_str(&"=".repeat(40));
                }

                lines.push_str("\n\n");
                lines.push_str(&appendix);
            }
        }

        fmt.write_str(&lines)
    }
}

impl<Context> Display for Report<Context> {
    fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
        #[cfg(feature = "std")]
        if let Some(result) = Report::invoke_display_hook(|hook| hook(self.generalized(), fmt)) {
            return result;
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
