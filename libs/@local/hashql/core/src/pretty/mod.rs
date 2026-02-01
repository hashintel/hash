//! Pretty-printing infrastructure for formatted output.
//!
//! Provides a high-level API for building formatted documents with semantic
//! annotations (colors, styles) that can be rendered to various output formats.
//!
//! # Architecture
//!
//! The pretty-printing system has three main layers:
//!
//! 1. **Document Construction** - [`Formatter`] builds semantic documents
//! 2. **Semantic Annotations** - [`Semantic`] categorizes text elements
//! 3. **Rendering** - [`render`] and [`render_into`] produce final output
//!
//! # Examples
//!
//! ```rust
//! use hashql_core::{
//!     heap::Heap,
//!     pretty::{Formatter, RenderOptions},
//!     symbol::sym,
//! };
//!
//! let heap = Heap::new();
//! let fmt = Formatter::new(&heap);
//!
//! let doc = fmt
//!     .keyword(sym::r#let)
//!     .append(fmt.space())
//!     .append(fmt.literal_str("43"))
//!     .append(fmt.space())
//!     .append(fmt.punct(sym::symbol::eq))
//!     .append(fmt.space())
//!     .append(fmt.literal_str("42"));
//!
//! let output = hashql_core::pretty::render(doc, RenderOptions::default());
//! println!("{}", output);
//! ```

pub mod display;
mod formatter;
mod semantic;
mod write;

use core::fmt::{self, Display};
use std::io;

use self::write::{AnsiWriter, HtmlFragmentWriter, PlainWriter, RenderError, XmlEscapingWriter};
pub use self::{
    formatter::{Doc, Formatter, FormatterOptions},
    semantic::Semantic,
};

/// Output format for rendered documents.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum RenderFormat {
    /// Plain text without ANSI escape codes.
    Plain,
    /// ANSI-colored output for terminals.
    Ansi,
    /// Output as a series of HTML text spans.
    HtmlFragment,
}

/// Configuration for rendering documents to output.
///
/// Controls the output format (plain/ANSI) and maximum line width for wrapping.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct RenderOptions {
    /// Whether to use ANSI colors or plain text.
    pub format: RenderFormat,
    /// Maximum line width before wrapping (default: 80).
    pub max_width: usize,
}

impl RenderOptions {
    /// Configures ANSI color output.
    ///
    /// Enables terminal colors and syntax highlighting in the rendered output.
    #[must_use]
    pub const fn with_ansi(mut self) -> Self {
        self.format = RenderFormat::Ansi;
        self
    }

    /// Configures plain text output.
    ///
    /// Disables colors and produces plain text suitable for logging or
    /// non-terminal output.
    #[must_use]
    pub const fn with_plain(mut self) -> Self {
        self.format = RenderFormat::Plain;
        self
    }

    /// Sets the maximum line width for wrapping.
    ///
    /// The pretty printer will attempt to keep lines under this width,
    /// breaking at appropriate points when possible.
    #[must_use]
    pub const fn with_max_width(mut self, max_width: usize) -> Self {
        self.max_width = max_width;
        self
    }
}

impl Default for RenderOptions {
    fn default() -> Self {
        Self {
            format: RenderFormat::Ansi,
            max_width: 80,
        }
    }
}

/// Write formatted output to a stream.
///
/// Renders the value to an output stream with the specified formatting options.
///
/// # Errors
///
/// Returns [`io::Error`] if writing fails.
pub fn render_into<W>(doc: &Doc<'_>, options: RenderOptions, write: &mut W) -> io::Result<()>
where
    W: io::Write,
{
    let mut writer = PlainWriter::new_io(write);

    match options.format {
        RenderFormat::Plain => doc.render_raw(options.max_width, &mut writer),
        RenderFormat::Ansi => doc.render_raw(options.max_width, &mut AnsiWriter::new(writer)),
        RenderFormat::HtmlFragment => doc.render_raw(
            options.max_width,
            &mut XmlEscapingWriter::new(HtmlFragmentWriter::new(writer)),
        ),
    }
    .map_err(RenderError::into_io)
}

/// Get a displayable representation.
///
/// Returns a [`Display`] implementor for using in formatting contexts.
#[must_use]
pub fn render(doc: Doc<'_>, options: RenderOptions) -> impl Display {
    fmt::from_fn(move |fmt| {
        let mut writer = PlainWriter::new_fmt(fmt);

        match options.format {
            RenderFormat::Plain => doc.render_raw(options.max_width, &mut writer),
            RenderFormat::Ansi => doc.render_raw(options.max_width, &mut AnsiWriter::new(writer)),
            RenderFormat::HtmlFragment => doc.render_raw(
                options.max_width,
                &mut XmlEscapingWriter::new(HtmlFragmentWriter::new(writer)),
            ),
        }
        .map_err(RenderError::into_fmt)
    })
}
