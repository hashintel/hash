//! Pretty printing for structured data with recursion control.
//!
//! This module implements a document model-based pretty printing system with
//! configurable formatting, color support, and robust handling of recursive
//! structures. The implementation uses the `pretty` crate as its document model.

pub mod display;

use core::fmt::{self, Display, Formatter};
use std::io;

use ::pretty::{RcDoc, Render, RenderAnnotated};
use anstyle::{AnsiColor, Color, Style};

use crate::{
    collection::FastHashSet,
    r#type::{TypeId, environment::Environment, kind::GenericArguments},
};

pub(crate) const BLUE: Style = Style::new().fg_color(Some(Color::Ansi(AnsiColor::Blue)));
pub(crate) const CYAN: Style = Style::new().fg_color(Some(Color::Ansi(AnsiColor::Cyan)));
pub(crate) const RED: Style = Style::new().fg_color(Some(Color::Ansi(AnsiColor::Red)));
pub(crate) const ORANGE: Style = Style::new().fg_color(Some(Color::Ansi(AnsiColor::BrightYellow)));
pub(crate) const GRAY: Style = Style::new().fg_color(Some(Color::Ansi(AnsiColor::BrightBlack)));

struct WriteColoredFmt<'a, 'b> {
    stack: Vec<Style>,
    colored: bool,
    formatter: &'a mut Formatter<'b>,
}

impl<'a, 'b> WriteColoredFmt<'a, 'b> {
    const fn new(formatter: &'a mut Formatter<'b>, colored: bool) -> Self {
        Self {
            stack: Vec::new(),
            colored,
            formatter,
        }
    }
}

#[expect(clippy::renamed_function_params)]
impl Render for WriteColoredFmt<'_, '_> {
    type Error = fmt::Error;

    fn write_str(&mut self, string: &str) -> Result<usize, Self::Error> {
        self.formatter.write_str(string)?;
        Ok(string.len())
    }

    fn write_str_all(&mut self, string: &str) -> Result<(), Self::Error> {
        self.formatter.write_str(string)
    }

    fn fail_doc(&self) -> Self::Error {
        fmt::Error
    }
}

impl RenderAnnotated<'_, Style> for WriteColoredFmt<'_, '_> {
    fn push_annotation(&mut self, annotation: &'_ Style) -> Result<(), Self::Error> {
        if !self.colored {
            return Ok(());
        }

        self.stack.push(*annotation);

        Display::fmt(annotation, self.formatter)
    }

    fn pop_annotation(&mut self) -> Result<(), Self::Error> {
        if !self.colored {
            return Ok(());
        }

        if let Some(annotation) = self.stack.pop() {
            Display::fmt(&annotation.render_reset(), self.formatter)?;
        }

        self.stack.last().map_or(Ok(()), |annotation| {
            Display::fmt(&annotation, self.formatter)
        })
    }
}

struct WriteColoredIo<W> {
    stack: Vec<Style>,
    colored: bool,
    inner: W,
}

impl<W> WriteColoredIo<W> {
    const fn new(inner: W, colored: bool) -> Self {
        Self {
            stack: Vec::new(),
            colored,
            inner,
        }
    }
}

#[expect(clippy::renamed_function_params)]
impl<W> Render for WriteColoredIo<W>
where
    W: io::Write,
{
    type Error = io::Error;

    fn write_str(&mut self, string: &str) -> Result<usize, Self::Error> {
        self.inner.write(string.as_bytes())
    }

    fn write_str_all(&mut self, string: &str) -> Result<(), Self::Error> {
        self.inner.write_all(string.as_bytes())
    }

    fn fail_doc(&self) -> Self::Error {
        io::Error::other("Document failed to render")
    }
}

impl<W> RenderAnnotated<'_, Style> for WriteColoredIo<W>
where
    W: io::Write,
{
    fn push_annotation(&mut self, annotation: &'_ Style) -> Result<(), Self::Error> {
        if !self.colored {
            return Ok(());
        }

        self.stack.push(*annotation);
        annotation.write_to(&mut self.inner)
    }

    fn pop_annotation(&mut self) -> Result<(), Self::Error> {
        if !self.colored {
            return Ok(());
        }

        if let Some(annotation) = self.stack.pop() {
            annotation.write_reset_to(&mut self.inner)?;
        }

        match self.stack.last() {
            Some(annotation) => annotation.write_to(&mut self.inner),
            None => Ok(()),
        }
    }
}

/// Strategy for detecting recursive structures during pretty-printing.
///
/// Determines how [`PrettyRecursionBoundary`] identifies already-visited values.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Default)]
pub enum PrettyRecursionGuardStrategy {
    /// Simple depth counter without identity tracking.
    ///
    /// Limits recursion based solely on nesting depth without tracking specific
    /// object identities. Suitable for simpler cases where exact cycle detection
    /// isn't required or desired.
    DepthCounting,

    /// Tracks object identity to detect actual cycles.
    ///
    /// Records each visited object's address to precisely identify cycles in
    /// recursive structures. This is the default strategy.
    #[default]
    IdentityTracking,
}

#[derive(Debug)]
enum RecursionGuardState {
    Depth(usize),
    Reference(FastHashSet<usize>),
}

impl RecursionGuardState {
    fn enter<T>(&mut self, value: &T) -> bool {
        match self {
            Self::Depth(depth) => {
                *depth += 1;
                true
            }
            Self::Reference(set) => set.insert(core::ptr::from_ref(value).addr()),
        }
    }

    fn exit<T>(&mut self, value: &T) {
        match self {
            Self::Depth(depth) => *depth -= 1,
            Self::Reference(set) => {
                set.remove(&core::ptr::from_ref(value).addr());
            }
        }
    }

    fn depth(&self) -> usize {
        match self {
            Self::Depth(depth) => *depth,
            Self::Reference(set) => set.len(),
        }
    }
}

impl From<PrettyRecursionGuardStrategy> for RecursionGuardState {
    fn from(tracking: PrettyRecursionGuardStrategy) -> Self {
        match tracking {
            PrettyRecursionGuardStrategy::DepthCounting => Self::Depth(0),
            PrettyRecursionGuardStrategy::IdentityTracking => {
                Self::Reference(FastHashSet::default())
            }
        }
    }
}

/// Guard against infinite recursion during pretty-printing.
///
/// Tracks already-visited objects and enforces depth limits to prevent
/// infinite recursion and control output size when printing recursive structures.
#[derive(Debug)]
pub struct PrettyPrintBoundary {
    visited: RecursionGuardState,
    limit: Option<usize>,
    config: PrettyOptions,
}

impl PrettyPrintBoundary {
    /// Creates a new recursion boundary.
    ///
    /// Configures how cycles are detected and the maximum recursion depth.
    #[must_use]
    pub fn new(config: PrettyOptions) -> Self {
        Self {
            visited: config.recursion_strategy.into(),
            limit: config.recursion_limit,
            config,
        }
    }

    fn track<'heap, T>(
        &mut self,
        env: &Environment<'heap>,
        value: &T,
        call: impl FnOnce(&T, &Environment<'heap>, &mut Self) -> RcDoc<'heap, Style>,
    ) -> RcDoc<'heap, Style>
    where
        T: PrettyPrint<'heap>,
    {
        if !self.visited.enter(value) {
            return RcDoc::text("...");
        }

        if let Some(limit) = self.limit
            && self.visited.depth() >= limit
        {
            // proper cleanup
            self.visited.exit(value);
            return RcDoc::text("...");
        }

        let document = call(value, env, self);

        self.visited.exit(value);
        document
    }

    pub const fn config(&self) -> PrettyOptions {
        self.config
    }

    /// Pretty-prints a type using its ID.
    ///
    /// Type system utility that resolves a type by ID and formats it with
    /// recursion tracking.
    #[inline]
    pub fn pretty_type<'heap>(
        &mut self,
        env: &Environment<'heap>,
        id: TypeId,
    ) -> RcDoc<'heap, Style> {
        let r#type = env.r#type(id);

        self.pretty(env, r#type.kind) // using `kind` is strategic here, that way the reference is tracked
    }

    /// Pretty-prints a generic type with applied type arguments.
    ///
    /// Type system utility that formats a generic type with its arguments.
    #[inline]
    pub fn pretty_generic_type<'heap>(
        &mut self,
        env: &Environment<'heap>,
        id: TypeId,
        arguments: GenericArguments<'heap>,
    ) -> RcDoc<'heap, Style> {
        let r#type = env.r#type(id);

        // untracked to properly allow for recursion detection
        r#type.kind.pretty_generic(env, self, arguments)
    }

    /// Pretty-prints a value with cycle detection.
    ///
    /// Main entry point for printing any value that implements [`PrettyPrint`].
    #[inline]
    pub fn pretty<'heap, T>(&mut self, env: &Environment<'heap>, value: &T) -> RcDoc<'heap, Style>
    where
        T: PrettyPrint<'heap>,
    {
        self.track(env, value, PrettyPrint::pretty)
    }
}

/// Formatting configuration for pretty-printing.
///
/// Controls layout, wrapping, and recursion handling for document rendering.
#[must_use = "pretty options don't do anything unless explicitly applied"]
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Default)]
pub struct PrettyOptions {
    /// Spaces per indentation level.
    pub indent: u8 = 4,

    /// Width limit before line wrapping.
    pub max_width: usize = 80,

    /// Whether to use color in output.
    pub colored: bool = true,

    /// Whether to resolve substitutions in the document.
    pub resolve_substitutions: bool = false,

    /// Maximum nesting depth before truncating with "...".
    ///
    /// Use [`None`] to disable limits, though this is risky with cyclic structures.
    /// Do not use [`None`] on arbitrary user input.
    pub recursion_limit: Option<usize> = Some(32),

    /// Method used to detect cycles in recursive structures.
    pub recursion_strategy: PrettyRecursionGuardStrategy
}

impl PrettyOptions {
    /// Creates a new instance with default settings.
    pub fn new() -> Self {
        Self::default()
    }

    /// Sets the number of spaces per indentation level.
    pub const fn with_indent(mut self, indent: u8) -> Self {
        self.indent = indent;
        self
    }

    /// Sets the maximum line width before wrapping.
    pub const fn with_max_width(mut self, max_width: usize) -> Self {
        self.max_width = max_width;
        self
    }

    /// Controls whether ANSI color codes are used in output.
    pub const fn with_colored(mut self, colored: bool) -> Self {
        self.colored = colored;
        self
    }

    /// Enables colored output.
    pub const fn with_color(self) -> Self {
        self.with_colored(true)
    }

    /// Disables colored output.
    pub const fn without_color(self) -> Self {
        self.with_colored(false)
    }

    /// Sets the maximum recursion depth.
    pub const fn with_recursion_limit(mut self, limit: Option<usize>) -> Self {
        self.recursion_limit = limit;
        self
    }

    /// Controls whether substitutions are resolved in output.
    pub const fn with_resolve_substitutions(mut self, resolve_substitutions: bool) -> Self {
        self.resolve_substitutions = resolve_substitutions;
        self
    }

    /// Sets the recursion detection strategy.
    pub const fn with_recursion_strategy(mut self, strategy: PrettyRecursionGuardStrategy) -> Self {
        self.recursion_strategy = strategy;
        self
    }

    /// Sets the recursion strategy to depth counting.
    pub const fn with_depth_tracking(mut self) -> Self {
        self.recursion_strategy = PrettyRecursionGuardStrategy::DepthCounting;
        self
    }

    /// Sets the recursion strategy to identity tracking.
    pub const fn with_identity_tracking(mut self) -> Self {
        self.recursion_strategy = PrettyRecursionGuardStrategy::IdentityTracking;
        self
    }
}

/// Format values as pretty-printed documents.
///
/// Enables structured formatting with proper indentation, line wrapping, and
/// syntax highlighting. Implementations only need to define how their values
/// convert to documents; the trait provides methods for rendering to different outputs.
///
/// Implementers need only define the [`Self::pretty`] method. The trait handles
/// display, I/O, and recursion control through default implementations.
pub trait PrettyPrint<'heap> {
    /// Convert to a document representation.
    ///
    /// Core method that transforms the value into a document that can be
    /// rendered with proper formatting, indentation, and syntax highlighting.
    fn pretty(
        &self,
        env: &Environment<'heap>,
        boundary: &mut PrettyPrintBoundary,
    ) -> RcDoc<'heap, Style>;

    /// Format with generic type arguments.
    ///
    /// Specialized for generic types. The default implementation renders
    /// arguments before the value. Most implementations can use this default.
    fn pretty_generic(
        &self,
        env: &Environment<'heap>,
        boundary: &mut PrettyPrintBoundary,
        arguments: GenericArguments<'heap>,
    ) -> RcDoc<'heap, Style> {
        RcDoc::line_()
            .append(arguments.pretty(env, boundary))
            .append(self.pretty(env, boundary))
    }

    /// Write formatted output to a stream.
    ///
    /// Renders the value to an output stream with the specified formatting options.
    ///
    /// # Errors
    ///
    /// Returns [`io::Error`] if writing fails.
    fn pretty_print_into<W>(
        &self,
        write: &mut W,
        env: &Environment<'heap>,
        options: PrettyOptions,
    ) -> io::Result<()>
    where
        W: io::Write,
    {
        let mut writer = WriteColoredIo::new(write, options.colored);

        self.pretty(env, &mut PrettyPrintBoundary::new(options))
            .render_raw(options.max_width, &mut writer)
    }

    /// Get a displayable representation.
    ///
    /// Returns a [`Display`] implementor for using in formatting contexts.
    fn pretty_print(&self, env: &Environment<'heap>, options: PrettyOptions) -> impl Display {
        struct PrettyPrinter<'a, 'b, 'heap, T: ?Sized>(
            &'a T,
            &'b Environment<'heap>,
            PrettyOptions,
        );

        impl<'a, T> Display for PrettyPrinter<'_, '_, 'a, T>
        where
            T: PrettyPrint<'a> + ?Sized,
        {
            fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
                let Self(target, env, options) = self;

                let mut writer = WriteColoredFmt::new(fmt, options.colored);

                target
                    .pretty(env, &mut PrettyPrintBoundary::new(*options))
                    .render_raw(options.max_width, &mut writer)
            }
        }

        PrettyPrinter(self, env, options)
    }
}

impl<'heap, T> PrettyPrint<'heap> for &T
where
    T: PrettyPrint<'heap>,
{
    fn pretty(
        &self,
        env: &Environment<'heap>,
        boundary: &mut PrettyPrintBoundary,
    ) -> RcDoc<'heap, Style> {
        T::pretty(self, env, boundary)
    }

    fn pretty_generic(
        &self,
        env: &Environment<'heap>,
        boundary: &mut PrettyPrintBoundary,
        arguments: GenericArguments<'heap>,
    ) -> RcDoc<'heap, Style> {
        T::pretty_generic(self, env, boundary, arguments)
    }
}
