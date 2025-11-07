//! Pretty printing for structured data with recursion control.
//!
//! This module implements a document model-based pretty printing system with
//! configurable formatting, color support, and robust handling of recursive
//! structures. The implementation uses the `pretty` crate as its document model.

pub mod display;
mod formatter;
mod semantic;
mod write;

use core::fmt::{self, Display};
use std::io;

use self::write::{AnsiWriter, PlainWriter, RenderError};
pub use self::{
    formatter::{Doc, Formatter},
    semantic::Semantic,
};

enum Format {
    Ansi,
    Plain,
}

pub struct RenderOptions {
    pub format: Format,
    pub max_width: usize,
}

impl Default for RenderOptions {
    fn default() -> Self {
        Self {
            format: Format::Ansi,
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
pub fn render_into<'doc, W>(
    doc: &Doc<'doc>,
    options: RenderOptions,
    write: &mut W,
) -> io::Result<()>
where
    W: io::Write,
{
    match options.format {
        Format::Ansi => doc
            .render_raw(options.max_width, &mut AnsiWriter::new_io(write))
            .map_err(RenderError::into_io),
        Format::Plain => doc
            .render_raw(options.max_width, &mut PlainWriter::new_io(write))
            .map_err(RenderError::into_io),
    }
}

/// Get a displayable representation.
///
/// Returns a [`Display`] implementor for using in formatting contexts.
pub fn render<'doc>(doc: &Doc<'doc>, options: RenderOptions) -> impl Display {
    fmt::from_fn(move |fmt| match options.format {
        Format::Ansi => doc
            .render_raw(options.max_width, &mut AnsiWriter::new_fmt(fmt))
            .map_err(RenderError::into_fmt),
        Format::Plain => doc
            .render_raw(options.max_width, &mut PlainWriter::new_fmt(fmt))
            .map_err(RenderError::into_fmt),
    })
}
