//! Implementation of formatting, to enable colors and the use of box-drawing characters use the
//! `pretty-print` feature.
//!
//! > **Note:** `error-stack` does not provide any stability guarantees for the [`Debug`] output.
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
//! # Report::set_color_mode(error_stack::fmt::ColorMode::Emphasis);
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
//! ## Implementation Details
//!
//! Nothing explained here is under any semver guarantee. This section explains the algorithm used
//! to produce the [`Debug`] output of a [`Report`].
//!
//! During the explanation we will make use of two different [`Report`]s, the overview tree (shown
//! first) only visualizes contexts, while the second, more detailed tree shows attachments and
//! contexts.
//!
//! In the detailed tree the type of [`Frame`] is distinguished using a superscript letter, `ᵃ` is
//! used to indicate attachments and `ᶜ` is used to indicate contexts. For clarity the overview tree
//! uses digits, while the detailed tree uses letters for different [`Frame`]s.
//!
//! Overview (Context only) Tree:
//!
//! ```text
//!     0
//!     |
//!     1
//!    / \
//!   2   6
//!  / \  |
//! 3   4 7
//!     | |
//!     5 8
//! ```
//!
//!
//! Detailed (Context + Attachment) Tree:
//!
//! ```text
//!    Aᶜ
//!    |
//!    Bᵃ
//!   / \
//!  Cᵃ  Eᵃ
//!  |   |
//!  Dᶜ  Fᵃ
//!     / \
//!    Gᵃ  Iᶜ
//!    |
//!    Hᶜ
//! ```
//!
//! During formatting we distinguish between two cases (for contexts):
//!
//! * Lists
//! * Groups
//!
//! in this explanation lists are delimited by `[` and `]`, while groups are delimited by `(` and
//! `)`.
//!
//! While formatting we view the [`Report`]s as a tree of [`Frame`]s, therefore the following
//! explanation will use terminology associated with trees, every [`Frame`] is a node and can have
//! `0..n` children, a node that has no children (a leaf) is guaranteed to be a [`Context`].
//!
//! A list is a list of nodes where each node in the list if the parent of the following element and
//! has only a single child, the last element of a list, can have `0..n` children. In the examples
//! above, `[6, 7, 8]` is considered a list, while `[1, 6]` is not, because while `1` is a parent of
//! `6`, `1` has more than 1 child.
//!
//! A group is a list of nodes where each node shares a common immediate context parent that has
//! more than `1` child, this means that `(2, 6)` is a group (they share `1` as an immediate context
//! parent), while `(3, 4, 6)` is not. `(3, 4, 6)` share the same parent with more than 1 child
//! (`1`), but `1` is not the immediate context parent of `3` and `4` (`2`) is. In the more detailed
//! example `(Dᶜ, Hᶜ, Iᶜ)` is considered a group because they share the same *immediate* context
//! parent `Aᶜ`, important to note is that we only refer to immediate context parents, `Fᵃ` is the
//! immediate parent of `Iᶜ`, but is not a [`Context`], therefore to find the immediate context
//! parent, we travel up the tree until we encounter our first [`Context`] node. Groups always
//! contain lists, for the sake of clarity this explanation only shows the first element.
//!
//! Additional rules that apply:
//! * lists are never empty
//! * lists are nested in groups
//! * groups are always preceded by lists
//! * groups are ordered left to right
//!
//! Using the aforementioned delimiters for lists and groups the end result would be:
//!
//! Overview Tree: `[0, 1] ([2] ([3], [4, 5]), [6, 7, 8])`
//! Detailed Tree: `[Aᶜ] ([Dᶜ], [Hᶜ], [Iᶜ])`
//!
//! Attachments are not ordered by insertion order but by depth in the tree. The depth in the tree
//! is the inverse of the insertion order, this means that the [`Debug`] output of all
//! attachments is reversed from the calling order of [`Report::attach`]. Each context uses the
//! attachments that are it's parents until the next context node. If attachments are shared between
//! multiple contexts, they are duplicated and output twice.
//!
//! ### Output Formatting
//!
//! Lists are guaranteed to be non-empty and have at least a single context. The context is the
//! heading of the whole list, while all other contexts are intended. The last entry in that
//! indentation is (if present) the group that follows, taking the detailed example this means that
//! the following output would be rendered:
//!
//! ```text
//! Aᶜ
//! │
//! ╰┬▶ Dᶜ
//!  │  ├╴Bᵃ
//!  │  ╰╴Cᵃ
//!  │
//!  ├▶ Hᶜ
//!  │  ├╴Bᵃ
//!  │  ├╴Eᵃ
//!  │  ├╴Fᵃ
//!  │  ╰╴Gᵃ
//!  │
//!  ╰▶ Iᶜ
//!     ├╴Bᵃ
//!     ├╴Eᵃ
//!     ╰╴Fᵃ
//! ```
//!
//! Groups are visually represented as an additional distinct indentation for other contexts in the
//! preceding list, taking the overview tree this means:
//!
//! ```text
//! 0
//! ├╴Attachment
//! │
//! ├─▶ 1
//! │   ╰╴Attachment
//! │
//! ╰┬▶ 2
//!  │  │
//!  │  ╰┬▶ 3
//!  │   │
//!  │   ╰▶ 4
//!  │      │
//!  │      ╰─▶ 5
//!  ╰▶ 6
//!     │
//!     ├─▶ 7
//!     │
//!     ╰─▶ 8
//! ```
//!
//! Attachments have been added to various places to simulate a real use-case with attachments and
//! to visualise their placement.
//!
//! The spacing and characters used are chosen carefully, to reduce indentation and increase visual
//! legibility in large trees. The indentation of the group following the last entry in the
//! preceding list is the same. To indicate that the last entry in the preceding list is the parent
//! a new indentation of the connecting line is used.
//!
//! [`Display`]: core::fmt::Display
//! [`Debug`]: core::fmt::Debug
//! [`Mutex`]: std::sync::Mutex
//! [`RwLock`]: std::sync::RwLock
//! [`Backtrace`]: std::backtrace::Backtrace
//! [`SpanTrace`]: tracing_error::SpanTrace
//! [`atomic`]: std::sync::atomic
//! [`Error::provide`]: core::error::Error::provide

mod charset;
mod color;
mod config;
#[cfg(any(feature = "std", feature = "hooks"))]
mod hook;
mod location;
mod r#override;

use alloc::{
    borrow::ToOwned,
    collections::VecDeque,
    format,
    string::{String, ToString},
    vec,
    vec::Vec,
};
use core::{
    fmt::{self, Debug, Display, Formatter},
    iter::once,
    mem,
};

pub use charset::Charset;
pub use color::ColorMode;
#[cfg(any(feature = "std", feature = "hooks"))]
pub use hook::HookContext;
#[cfg(any(feature = "std", feature = "hooks"))]
pub(crate) use hook::{install_builtin_hooks, Format, Hooks};
#[cfg(not(any(feature = "std", feature = "hooks")))]
use location::LocationDisplay;

use crate::{
    fmt::{
        color::{Color, DisplayStyle, Style},
        config::Config,
    },
    AttachmentKind, Context, Frame, FrameKind, Report,
};

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

impl Symbol {
    const fn to_str_utf8(self) -> &'static str {
        match self {
            Self::Vertical => "│",
            Self::VerticalRight => "├",
            Self::Horizontal => "─",
            Self::HorizontalLeft => "╴",
            Self::HorizontalDown => "┬",
            Self::ArrowRight => "▶",
            Self::CurveRight => "╰",
            Self::Space => " ",
        }
    }

    const fn to_str_ascii(self) -> &'static str {
        match self {
            Self::Vertical | Self::VerticalRight | Self::CurveRight => "|",
            Self::Horizontal | Self::HorizontalDown | Self::HorizontalLeft => "-",
            Self::ArrowRight => ">",
            Self::Space => " ",
        }
    }

    const fn to_str(self, charset: Charset) -> &'static str {
        match charset {
            Charset::Utf8 => self.to_str_utf8(),
            Charset::Ascii => self.to_str_ascii(),
        }
    }
}

struct SymbolDisplay<'a> {
    inner: &'a [Symbol],
    charset: Charset,
}

impl Display for SymbolDisplay<'_> {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        for symbol in self.inner {
            f.write_str(symbol.to_str(self.charset))?;
        }

        Ok(())
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
            } => sym!('│', ' '),
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
            } => sym!(' ', ' '),
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
                Position::First => PreparedInstruction::Symbols(sym!('├', '╴')),
                Position::Inner => PreparedInstruction::Symbols(sym!('├', '╴')),
                Position::Final => PreparedInstruction::Symbols(sym!('╰', '╴')),
            },

            // Indentation (like `|   ` or ` |  `)
            Self::Indent(indent) => PreparedInstruction::Symbols(indent.prepare()),
        }
    }
}

struct InstructionDisplay<'a> {
    color: ColorMode,
    charset: Charset,

    instruction: &'a Instruction,
}

impl Display for InstructionDisplay<'_> {
    fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
        match self.instruction.prepare() {
            PreparedInstruction::Symbols(symbols) => {
                let display = SymbolDisplay {
                    inner: symbols,
                    charset: self.charset,
                };

                let mut style = Style::new();

                if self.color == ColorMode::Color {
                    style.set_foreground(Color::Red, false);
                }

                Display::fmt(&style.apply(&display), fmt)?;
            }
            PreparedInstruction::Content(value, &style) => Display::fmt(&style.apply(&value), fmt)?,
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

struct LineDisplay<'a> {
    color: ColorMode,
    charset: Charset,

    line: &'a Line,
}

impl Display for LineDisplay<'_> {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        for instruction in self.line.0.iter().rev() {
            Display::fmt(
                &InstructionDisplay {
                    color: self.color,
                    charset: self.charset,
                    instruction,
                },
                f,
            )?;
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

fn debug_context(context: &dyn Context, mode: ColorMode) -> Lines {
    context
        .to_string()
        .lines()
        .map(ToOwned::to_owned)
        .enumerate()
        .map(|(idx, value)| {
            if idx == 0 {
                let mut style = Style::new();

                if mode == ColorMode::Color || mode == ColorMode::Emphasis {
                    style.set_display(DisplayStyle::new().with_bold(true));
                }

                Line::new().push(Instruction::Value { value, style })
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

fn debug_attachments_invoke<'a>(
    frames: impl IntoIterator<Item = &'a Frame>,
    config: &mut Config,
) -> (Opaque, Vec<String>) {
    let mut opaque = Opaque::new();

    #[cfg(any(feature = "std", feature = "hooks"))]
    let context = config.context();

    let body = frames
        .into_iter()
        .map(|frame| match frame.kind() {
            #[cfg(any(feature = "std", feature = "hooks"))]
            FrameKind::Context(_) => Some(
                Report::invoke_debug_format_hook(|hooks| hooks.call(frame, context))
                    .then(|| context.take_body())
                    .unwrap_or_default(),
            ),
            #[cfg(any(feature = "std", feature = "hooks"))]
            FrameKind::Attachment(AttachmentKind::Printable(attachment)) => Some(
                Report::invoke_debug_format_hook(|hooks| hooks.call(frame, context))
                    .then(|| context.take_body())
                    .unwrap_or_else(|| vec![attachment.to_string()]),
            ),
            #[cfg(any(feature = "std", feature = "hooks"))]
            FrameKind::Attachment(AttachmentKind::Opaque(_)) => {
                Report::invoke_debug_format_hook(|hooks| hooks.call(frame, context))
                    .then(|| context.take_body())
            }
            #[cfg(not(any(feature = "std", feature = "hooks")))]
            FrameKind::Context(_) => Some(vec![]),
            #[cfg(not(any(feature = "std", feature = "hooks")))]
            FrameKind::Attachment(AttachmentKind::Printable(attachment)) => {
                Some(vec![attachment.to_string()])
            }
            #[cfg(not(any(feature = "std", feature = "hooks")))]
            FrameKind::Attachment(AttachmentKind::Opaque(_)) => frame
                .downcast_ref::<core::panic::Location<'static>>()
                .map(|location| {
                    vec![LocationDisplay::new(location, config.color_mode()).to_string()]
                }),
        })
        .flat_map(|body| {
            body.unwrap_or_else(|| {
                // increase the opaque counter, if we're unable to determine the actual value of
                // the frame
                opaque.increase();
                Vec::new()
            })
        })
        .collect();

    (opaque, body)
}

fn debug_attachments<'a>(
    position: Position,
    frames: impl IntoIterator<Item = &'a Frame>,
    config: &mut Config,
) -> Lines {
    let last = matches!(position, Position::Final);

    let (opaque, entries) = debug_attachments_invoke(frames, config);
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

fn debug_frame(root: &Frame, prefix: &[&Frame], config: &mut Config) -> Vec<Lines> {
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
            let head_context = debug_context(
                match head.kind() {
                    FrameKind::Context(c) => c,
                    FrameKind::Attachment(_) => unreachable!(),
                },
                config.color_mode(),
            );

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
                once(head).chain(body),
                config,
            );
            head_context.then(body)
        })
        .collect();

    let sources = sources
        .iter()
        .flat_map(
            // if the group is "transparent" (has no context), it will return all it's parents
            // rendered this is why we must first flat_map.
            |source| debug_frame(source, &prefix, config),
        )
        .collect::<Vec<_>>();

    // if there is no context, this is considered a "transparent" group,
    // and just directly returns all sources without modifying them
    if contexts.is_empty() {
        return sources;
    }

    // take the first Context, this is our "root", all others are indented
    // this unwrap always succeeds due to the call before <3
    let head = contexts
        .pop_front()
        .expect("should always have single context");

    // combine everything into a single group
    vec![debug_render(head, contexts, sources)]
}

impl<C> Debug for Report<C> {
    fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
        let mut config = Config::load(fmt.alternate());

        let color = config.color_mode();
        let charset = config.charset();

        #[cfg_attr(not(any(feature = "std", feature = "hooks")), allow(unused_mut))]
        let mut lines = self
            .current_frames()
            .iter()
            .flat_map(|frame| debug_frame(frame, &[], &mut config))
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
            .map(|line| {
                LineDisplay {
                    color,
                    charset,
                    line: &line,
                }
                .to_string()
            })
            .collect::<Vec<_>>()
            .join("\n");

        #[cfg(any(feature = "std", feature = "hooks"))]
        {
            let appendix = config
                .context::<Frame>()
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
                if charset == Charset::Utf8 {
                    lines.push_str(&"━".repeat(40));
                } else {
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
