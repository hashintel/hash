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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Format {
    Plain,
    Ansi,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct RenderOptions {
    pub format: Format,
    pub max_width: usize,
}

impl RenderOptions {
    #[must_use]
    pub const fn with_ansi(mut self) -> Self {
        self.format = Format::Ansi;
        self
    }

    #[must_use]
    pub const fn with_plain(mut self) -> Self {
        self.format = Format::Plain;
        self
    }

    #[must_use]
    pub const fn with_max_width(mut self, max_width: usize) -> Self {
        self.max_width = max_width;
        self
    }
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
pub fn render_into<W>(doc: &Doc<'_>, options: RenderOptions, write: &mut W) -> io::Result<()>
where
    W: io::Write,
{
    match options.format {
        Format::Plain => doc
            .render_raw(options.max_width, &mut PlainWriter::new_io(write))
            .map_err(RenderError::into_io),
        Format::Ansi => doc
            .render_raw(options.max_width, &mut AnsiWriter::new_io(write))
            .map_err(RenderError::into_io),
    }
}

/// Get a displayable representation.
///
/// Returns a [`Display`] implementor for using in formatting contexts.
#[must_use]
pub fn render(doc: Doc<'_>, options: RenderOptions) -> impl Display {
    fmt::from_fn(move |fmt| match options.format {
        Format::Plain => doc
            .render_raw(options.max_width, &mut PlainWriter::new_fmt(fmt))
            .map_err(RenderError::into_fmt),
        Format::Ansi => doc
            .render_raw(options.max_width, &mut AnsiWriter::new_fmt(fmt))
            .map_err(RenderError::into_fmt),
    })
}
