//! Implementation of formatting, to enable colors and the use of box-drawing characters use the
//! `pretty-print` feature.
//!
//! # Hooks
//!
//! The format implementation (especially the [`Debug`] implementation),
//! can be easily extended using hooks.
//! Hooks are functions of the signature `Fn(&T, &mut HookContext<T>) -> Vec<Emit>`, they provide
//! an easy and ergonomic way to partially modify the format and enable the output of types that are
//! not necessarily added via `.attach_printable()` or are unable to implement [`Display`].
//!
//! Hooks can be attached through the central hooking mechanism which `error-stack`
//! provides via [`Report::install_debug_hook`].
//!
//! You can also provide a fallback function, which is called whenever a hook hasn't been added for
//! a specific type of attachment.
//! The fallback function needs to have a signature of
//! `Fn(&Frame, &mut HookContext<T>) -> Vec<Emit>`
//! and can be set via [`Report::install_debug_hook_fallback`].
//!
//! > **Caution:** Overwriting the fallback **will** remove the builtin formatting for types like
//! > [`Backtrace`] and [`SpanTrace`], you can mitigate this by calling
//! > [`error_stack::fmt::builtin_debug_hook_fallback`] in your fallback code.
//!
//! Hook functions need to be [`Fn`] and **not** [`FnMut`], which means they are unable to directly
//! mutate state outside of the closure.
//! You can still achieve mutable state outside of the scope of your closure through interior
//! mutability, e.g. by using the [`std::sync`] module like [`Mutex`], [`RwLock`], and [`atomic`]s.
//!
//! The type a hook will be called for is determined by the type of the first argument.
//! This type can either be specified at the closure level or when calling
//! [`Report::install_debug_hook`].
//! This type needs to be `'static`, [`Send`], and [`Sync`].
//!
//! The hook function must return [`Vec<Emit>`], which decides what is going
//! to be emitted during printing, refer to the documentation of [`Emit`] for further
//! information.
//!
//! ## Example
//!
//! ```rust
//! # // we only test on nightly, therefore report is unused (so is render)
//! # #![cfg_attr(not(nightly), allow(dead_code, unused_variables, unused_imports))]
//! use std::io::{Error, ErrorKind};
//! use error_stack::Report;
//! use error_stack::fmt::Emit;
//!
//! struct ErrorCode(u64);
//! struct Suggestion(&'static str);
//! struct Warning(&'static str);
//! struct Info(&'static str);
//!
//! // This hook will never be called, because a later invocation of `install_debug_hook` overwrites
//! // the hook for the type `u64`.
//! Report::install_debug_hook::<ErrorCode>(|_, _| vec![Emit::next("will never be called")]);
//!
//! // `HookContext` always has a type parameter, which needs to be the same as the type of the
//! // value, we use `HookContext` here as storage, to store values specific to this hook.
//! // Here we make use of the auto-incrementing feature.
//! // The incrementation is type specific, meaning that `ctx.increment()` for the `Suggestion` hook
//! // will not influence the counter of the `ErrorCode` or `Warning` hook.
//! Report::install_debug_hook::<Suggestion>(|Suggestion(val), ctx| vec![Emit::next(format!("Suggestion {}: {val}", ctx.increment() + 1))]);
//!
//! // we do not need to make use of the context, to either store a value for the duration of the
//! // rendering, or to render additional text, which is why we omit the parameter.
//! Report::install_debug_hook::<ErrorCode>(|ErrorCode(val), _| vec![Emit::next(format!("Error ({val})"))]);
//!
//! Report::install_debug_hook::<Warning>(|Warning(val), ctx| {
//!     let idx = ctx.increment() + 1;
//!
//!     // we set a value, which will be removed on non-alternate views
//!     // and is going to be appended to the actual return value.
//!     if ctx.alternate() {
//!         ctx.attach_snippet(format!("Warning {idx}:\n  {val}"));
//!     }
//!
//!     vec![Emit::next(format!("Warning ({idx}) occurred"))]
//!  });
//!
//! // you can use arbitrary values as arguments, just make sure that you won't repeat them.
//! // here we use [`Emit::defer`], this means that this value will be put at the end of the group.
//! Report::install_debug_hook::<Info>(|Info(val), _| vec![Emit::defer(format!("Info: {val}"))]);
//!
//! let report = Report::new(Error::from(ErrorKind::InvalidInput))
//!     .attach(ErrorCode(404))
//!     .attach(Info("This is going to be at the end"))
//!     .attach(Suggestion("Try to be connected to the internet."))
//!     .attach(Suggestion("Try better next time!"))
//!     .attach(Warning("Unable to fetch resource"));
//!
//! # owo_colors::set_override(true);
//! # fn render(value: String) -> String {
//! #     let backtrace = regex::Regex::new(r"Backtrace No\. (\d+)\n(?:  .*\n)*  .*").unwrap();
//! #     let backtrace_info = regex::Regex::new(r"backtrace with (\d+) frames \((\d+)\)").unwrap();
//! #
//! #     let value = backtrace.replace_all(&value, "Backtrace No. $1\n  [redacted]");
//! #     let value = backtrace_info.replace_all(value.as_ref(), "backtrace with [n] frames ($2)");
//! #
//! #     ansi_to_html::convert_escaped(value.as_ref()).unwrap()
//! # }
//! #
//! # #[cfg(nightly)]
//! # expect_test::expect_file![concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/fmt__doc.snap")].assert_eq(&render(format!("{report:?}")));
//! #
//! println!("{report:?}");
//!
//! # #[cfg(nightly)]
//! # expect_test::expect_file![concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/fmt_doc_alt.snap")].assert_eq(&render(format!("{report:#?}")));
//! #
//! println!("{report:#?}");
//! ```
//! ### `println!("{report:?}")`
//!
//! <pre>
#![doc = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/fmt__doc.snap"))]
//! </pre>
//!
//! ### `println!("{report:#?}")`
//!
//! <pre>
#![doc = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/fmt_doc_alt.snap"))]
//! </pre>
//!
//!
//! [`Display`]: core::fmt::Display
//! [`Debug`]: core::fmt::Debug
//! [`Mutex`]: std::sync::Mutex
//! [`RwLock`]: std::sync::RwLock
//! [`Backtrace`]: std::backtrace::Backtrace
//! [`SpanTrace`]: tracing_error::SpanTrace
//! [`error_stack::fmt::builtin_debug_hook_fallback`]: crate::fmt::builtin_debug_hook_fallback
//! [`atomic`]: std::sync::atomic
// Makes sure that `Emit` isn't regarded as unreachable even though it isn't exported on
// no-std. Simplifies maintenance as we don't need to special case the visibility modifier.
#![cfg_attr(not(feature = "std"), allow(unreachable_pub))]

mod hook;
#[cfg(feature = "unstable")]
mod unstable;

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

#[cfg(feature = "std")]
pub use hook::builtin_debug_hook_fallback;
#[cfg(not(feature = "std"))]
#[allow(clippy::redundant_pub_crate)]
pub(crate) use hook::builtin_debug_hook_fallback;
#[cfg(feature = "std")]
pub use hook::HookContext;
use hook::HookContextImpl;
#[cfg(feature = "std")]
pub(crate) use hook::Hooks;
#[cfg(feature = "pretty-print")]
use owo_colors::{OwoColorize, Stream::Stdout, Style as OwOStyle};
#[cfg(feature = "unstable")]
pub use unstable::DebugDiagnostic;

use crate::{AttachmentKind, Context, Frame, FrameKind, Report};

/// Modify the behaviour, with which text returned from hook invocations are rendered.
///
/// Text can either be emitted immediately as next line, or deferred until the end of the current
/// stack, a stack is a list of attachments until a frame which has more than a single source.
///
/// Deferred lines are reversed when rendered, meaning that when `A`, `B`, and `C` have been added
/// by **any** hook, they will be rendered in the order: `C`, `B`, `A`.
///
/// # Example
///
/// ```rust
/// # // we only test on nightly, therefore report is unused (so is render)
/// # #![cfg_attr(not(nightly), allow(dead_code, unused_variables, unused_imports))]
/// use std::io::{Error, ErrorKind};
///
/// use error_stack::{fmt::Emit, Report};
///
/// struct Warning(&'static str);
/// struct ErrorCode(u64);
/// struct Suggestion(&'static str);
/// struct Secret(&'static str);
///
/// Report::install_debug_hook::<ErrorCode>(|ErrorCode(val), _| {
///     vec![Emit::next(format!("Error Code: {val}"))]
/// });
/// Report::install_debug_hook::<Suggestion>(|Suggestion(val), _| {
///     vec![Emit::defer(format!("Suggestion: {val}"))]
/// });
/// Report::install_debug_hook::<Warning>(|Warning(val), _| {
///     vec![Emit::next("Abnormal program execution detected"), Emit::next(format!("Warning: {val}"))]
/// });
/// Report::install_debug_hook::<Secret>(|_, _| vec![]);
///
/// let report = Report::new(Error::from(ErrorKind::InvalidInput))
///     .attach(ErrorCode(404))
///     .attach(Suggestion("Do you have a connection to the internet?"))
///     .attach(ErrorCode(405))
///     .attach(Warning("Unable to determine environment"))
///     .attach(Secret("pssst, don't tell anyone else c;"))
///     .attach(Suggestion("Execute the program from the fish shell"))
///     .attach(ErrorCode(501))
///     .attach(Suggestion("Try better next time!"));
///
/// # owo_colors::set_override(true);
/// # fn render(value: String) -> String {
/// #     let backtrace = regex::Regex::new(r"Backtrace No\. (\d+)\n(?:  .*\n)*  .*").unwrap();
/// #     let backtrace_info = regex::Regex::new(r"backtrace with (\d+) frames \((\d+)\)").unwrap();
/// #
/// #     let value = backtrace.replace_all(&value, "Backtrace No. $1\n  [redacted]");
/// #     let value = backtrace_info.replace_all(value.as_ref(), "backtrace with [n] frames ($2)");
/// #
/// #     ansi_to_html::convert_escaped(value.as_ref()).unwrap()
/// # }
/// #
/// # #[cfg(nightly)]
/// # expect_test::expect_file![concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/fmt__emit.snap")].assert_eq(&render(format!("{report:?}")));
/// #
/// println!("{report:?}");
/// ```
///
/// <pre>
#[doc = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/fmt__emit.snap"))]
/// </pre>
#[derive(Debug, Clone, PartialEq, Eq)]
#[must_use]
#[non_exhaustive]
pub enum Emit {
    /// Line is going to be emitted after all immediate lines have been emitted from the current
    /// stack.
    /// This means that deferred lines will always be last in a group.
    #[cfg_attr(not(any(feature = "std", feature = "spantrace")), allow(dead_code))]
    Defer(String),
    /// Going to be emitted immediately as the next line in the chain of
    /// attachments and contexts.
    Next(String),
}

impl Emit {
    /// Add a new line which is going to be emitted immediately.
    ///
    /// # Example
    ///
    /// ```rust
    /// # // we only test on nightly, therefore report is unused (so is render)
    /// # #![cfg_attr(not(nightly), allow(dead_code, unused_variables, unused_imports))]
    /// use std::io;
    ///
    /// use error_stack::{fmt::Emit, Report};
    ///
    /// struct Suggestion(&'static str);
    ///
    /// Report::install_debug_hook::<Suggestion>(|Suggestion(val), _| {
    ///     vec![
    ///         Emit::next(format!("Suggestion: {val}")),
    ///         Emit::next("Sorry for the inconvenience!")
    ///     ]
    /// });
    ///
    /// let report = Report::new(io::Error::from(io::ErrorKind::InvalidInput))
    ///     .attach(Suggestion("Try better next time"));
    ///
    /// # owo_colors::set_override(true);
    /// # fn render(value: String) -> String {
    /// #     let backtrace = regex::Regex::new(r"Backtrace No\. (\d+)\n(?:  .*\n)*  .*").unwrap();
    /// #     let backtrace_info = regex::Regex::new(r"backtrace with (\d+) frames \((\d+)\)").unwrap();
    /// #
    /// #     let value = backtrace.replace_all(&value, "Backtrace No. $1\n  [redacted]");
    /// #     let value = backtrace_info.replace_all(value.as_ref(), "backtrace with [n] frames ($2)");
    /// #
    /// #     ansi_to_html::convert_escaped(value.as_ref()).unwrap()
    /// # }
    /// #
    /// # #[cfg(nightly)]
    /// # expect_test::expect_file![concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/fmt__diagnostics_add.snap")].assert_eq(&render(format!("{report:?}")));
    /// #
    /// println!("{report:?}");
    /// ```
    ///
    /// <pre>
    #[doc = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/fmt__diagnostics_add.snap"))]
    /// </pre>
    pub fn next<T: Into<String>>(line: T) -> Self {
        Self::Next(line.into())
    }

    /// Create a new line, which is going to be deferred until the end of the current stack.
    ///
    /// A stack are all attachments until a [`Context`] is encountered in the frame stack,
    /// lines added via this function are going to be emitted at the end, in reversed direction to
    /// the attachments that added them
    ///
    /// [`Context`]: crate::Context
    ///
    /// # Example
    ///
    /// ```rust
    /// # // we only test on nightly, therefore report is unused (so is render)
    /// # #![cfg_attr(not(nightly), allow(dead_code, unused_variables, unused_imports))]
    /// use std::io;
    ///
    /// use error_stack::{fmt::Emit, Report};
    ///
    /// struct ErrorCode(u64);
    /// struct Suggestion(&'static str);
    ///
    /// Report::install_debug_hook::<Suggestion>(|Suggestion(val), _| {
    ///     vec![Emit::defer(format!("Suggestion: {val}"))]
    /// });
    /// Report::install_debug_hook::<ErrorCode>(|ErrorCode(val), _| {
    ///     vec![Emit::next(format!("Error Code: {val}"))]
    /// });
    ///
    /// let report = Report::new(io::Error::from(io::ErrorKind::InvalidInput))
    ///     .attach(Suggestion("Try better next time!"))
    ///     .attach(ErrorCode(404))
    ///     .attach(Suggestion("Try to use a different shell!"))
    ///     .attach(ErrorCode(405));
    ///
    /// # owo_colors::set_override(true);
    /// # fn render(value: String) -> String {
    /// #     let backtrace = regex::Regex::new(r"Backtrace No\. (\d+)\n(?:  .*\n)*  .*").unwrap();
    /// #     let backtrace_info = regex::Regex::new(r"backtrace with (\d+) frames \((\d+)\)").unwrap();
    /// #
    /// #     let value = backtrace.replace_all(&value, "Backtrace No. $1\n  [redacted]");
    /// #     let value = backtrace_info.replace_all(value.as_ref(), "backtrace with [n] frames ($2)");
    /// #
    /// #     ansi_to_html::convert_escaped(value.as_ref()).unwrap()
    /// # }
    /// #
    /// # #[cfg(nightly)]
    /// # expect_test::expect_file![concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/fmt__diagnostics_add_defer.snap")].assert_eq(&render(format!("{report:?}")));
    /// #
    /// println!("{report:?}");
    /// ```
    ///
    /// <pre>
    #[doc = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/fmt__diagnostics_add_defer.snap"))]
    /// </pre>
    #[cfg_attr(not(any(feature = "std", feature = "spantrace")), allow(dead_code))]
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

#[cfg(feature = "pretty-print")]
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

#[cfg(not(feature = "pretty-print"))]
impl Display for Symbol {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        match self {
            Self::Location => f.write_str("at "),
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

#[cfg(feature = "pretty-print")]
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

/// Minimized instruction, which looses information about what it represents and converts it to
/// only symbols, this then is output instead.
enum PreparedInstruction<'a> {
    Symbol(&'a Symbol),
    Symbols(&'a [Symbol]),
    Content(&'a str, &'a Style),
}

impl Instruction {
    // Reason for allow:
    // > This is just a big statement to convert to a prepared instruction, there
    // isn't really any logic here
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

#[cfg(feature = "pretty-print")]
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

#[cfg(not(feature = "pretty-print"))]
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

fn debug_context(frame: &Frame, context: &dyn Context) -> (Lines, Line) {
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
        .collect();

    let loc = Line::new()
        .push(Instruction::Value {
            value: loc.to_string(),
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
                #[cfg(all(nightly, feature = "unstable"))]
                if let Some(debug) = frame.request_ref::<DebugDiagnostic>() {
                    for snippet in debug.snippets() {
                        ctx.as_hook_context::<DebugDiagnostic>()
                            .attach_snippet(snippet.clone());
                    }

                    return debug.output().to_vec();
                }

                #[cfg(all(not(nightly), feature = "unstable"))]
                if let Some(debug) = frame.downcast_ref::<DebugDiagnostic>() {
                    for snippet in debug.snippets() {
                        ctx.as_hook_context::<DebugDiagnostic>()
                            .attach_snippet(snippet.clone());
                    }

                    return debug.output().to_vec();
                }

                #[cfg(feature = "std")]
                {
                    Report::get_debug_format_hook(|hooks| {
                        hooks.call(frame, &mut ctx.as_hook_context())
                    })
                }

                #[cfg(not(feature = "std"))]
                {
                    builtin_debug_hook_fallback(frame, &mut ctx.as_hook_context())
                }
            }
            FrameKind::Attachment(AttachmentKind::Printable(attachment)) => {
                vec![Emit::next(attachment.to_string())]
            }
        })
        .flat_map(|value| {
            // increase the opaque counter, if we're unable to determine the actual value of the
            // frame
            if value.is_empty() {
                opaque.increase();
            }

            value
        })
        .partition(|f| matches!(f, Emit::Next(_)));

    let opaque = opaque.render();

    // calculate the len, combine next and defer emitted values into a single stream
    let len =
        next.len() + defer.len() + loc.as_ref().map_or(0, |_| 1) + opaque.as_ref().map_or(0, |_| 1);
    let lines = next
        .into_iter()
        .chain(defer.into_iter().rev())
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

    // indentation for every first line, use `Instruction::Attachment`, otherwise use minimal
    // indent omit that indent when we're the last value
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
                .before(
                    // add a buffer line for readability
                    Line::new().push(Instruction::Indent {
                        group: idx != 0,
                        visible: true,
                        spacing: false,
                        minimal: false,
                    }),
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
        .map(|(idx, (head, mut body))| {
            // each "paket" on the stack is made up of a head (guaranteed to be a `Context`) and
            // `n` attachments.
            // The attachments are rendered as direct descendants of the parent context
            let (head, loc) = debug_context(head, match head.kind() {
                FrameKind::Context(c) => c,
                FrameKind::Attachment(_) => unreachable!(),
            });

            // reverse all attachments, to make it more logical relative to the attachment order
            body.reverse();
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
        .flat_map(
            // if the group is "transparent" (has no context), it will return all it's parents
            // rendered this is why we must first flat_map.
            |source| debug_frame(source, ctx, &prefix),
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
        if let Some(result) = Report::get_debug_hook(|hook| hook(self.generalized(), fmt)) {
            return result;
        }

        let mut ctx = HookContextImpl::new(fmt.alternate());

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

        // only output detailed information (like backtraces), if alternate mode is enabled, or the
        // snippet has been forced.
        let suffix = ctx
            .snippets
            .into_iter()
            .map(
                // remove all trailing newlines for a more uniform look
                |snippet| snippet.trim_end_matches('\n').to_owned(),
            )
            .collect::<Vec<_>>()
            .join("\n\n");

        if !suffix.is_empty() {
            // 44 is the size for the separation.
            lines.reserve(44 + suffix.len());

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
            lines.push_str(&suffix);
        }

        fmt.write_str(&lines)
    }
}

impl<Context> Display for Report<Context> {
    fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
        #[cfg(feature = "std")]
        if let Some(result) = Report::get_display_hook(|hook| hook(self.generalized(), fmt)) {
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
