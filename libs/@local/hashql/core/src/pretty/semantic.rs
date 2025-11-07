//! Semantic annotations for pretty-printed documents.
//!
//! These annotations represent the *meaning* of text elements, not their visual
//! appearance. During rendering, these are converted to visual styles (colors).

use std::io;

use anstyle::{AnsiColor, Color, Style};
use pretty::{Render, RenderAnnotated};

/// Semantic category of a document fragment.
///
/// This describes what a piece of text represents semantically, allowing
/// rendering to apply appropriate visual styling.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum Semantic {
    /// Language keywords (let, in, if, fn, etc.)
    Keyword,
    /// Type names (Integer, String, List, etc.)
    TypeName,
    /// Variable and function names
    Variable,
    /// Operators (+, ->, =>, |, &, etc.)
    Operator,
    /// Structural punctuation (parens, brackets, commas, colons, etc.)
    Punctuation,
    /// Literal values (numbers, strings, booleans)
    Literal,
    /// Field and property names
    Field,
    /// Comments, recursive indicators, etc.
    Comment,
}

impl Semantic {
    /// Converts semantic annotation to visual style.
    pub const fn to_style(self) -> Style {
        match self {
            Self::Keyword => Style::new().fg_color(Some(Color::Ansi(AnsiColor::Magenta))),
            Self::TypeName => Style::new().fg_color(Some(Color::Ansi(AnsiColor::Blue))),
            Self::Variable => Style::new(),
            Self::Operator => Style::new().fg_color(Some(Color::Ansi(AnsiColor::Yellow))),
            Self::Punctuation => Style::new().fg_color(Some(Color::Ansi(AnsiColor::BrightBlack))),
            Self::Literal => Style::new().fg_color(Some(Color::Ansi(AnsiColor::Green))),
            Self::Field => Style::new().fg_color(Some(Color::Ansi(AnsiColor::Cyan))),
            Self::Comment => Style::new().fg_color(Some(Color::Ansi(AnsiColor::BrightBlack))),
        }
    }
}

/// Writer that renders documents with semantic annotations as ANSI colors.
pub struct StyledWriter<W> {
    stack: Vec<Style>,
    colored: bool,
    inner: W,
}

impl<W> StyledWriter<W> {
    /// Creates a new styled writer.
    pub const fn new(inner: W, colored: bool) -> Self {
        Self {
            stack: Vec::new(),
            colored,
            inner,
        }
    }

    /// Unwraps and returns the inner writer.
    pub fn into_inner(self) -> W {
        self.inner
    }
}

impl<W: io::Write> Render for StyledWriter<W> {
    type Error = io::Error;

    fn write_str(&mut self, s: &str) -> Result<usize, Self::Error> {
        self.inner.write(s.as_bytes())
    }

    fn write_str_all(&mut self, s: &str) -> Result<(), Self::Error> {
        self.inner.write_all(s.as_bytes())
    }

    fn fail_doc(&self) -> Self::Error {
        io::Error::other("Document rendering failed")
    }
}

impl<W: io::Write> RenderAnnotated<'_, Semantic> for StyledWriter<W> {
    fn push_annotation(&mut self, annotation: &Semantic) -> Result<(), Self::Error> {
        if !self.colored {
            return Ok(());
        }

        let style = annotation.to_style();
        self.stack.push(style);
        style.write_to(&mut self.inner)
    }

    fn pop_annotation(&mut self) -> Result<(), Self::Error> {
        if !self.colored {
            return Ok(());
        }

        if let Some(style) = self.stack.pop() {
            style.write_reset_to(&mut self.inner)?;
        }

        if let Some(style) = self.stack.last() {
            style.write_to(&mut self.inner)?;
        }

        Ok(())
    }
}
