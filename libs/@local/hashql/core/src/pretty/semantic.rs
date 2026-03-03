//! Semantic annotations for pretty-printed documents.
//!
//! These annotations represent the *meaning* of text elements, not their visual
//! appearance. During rendering, these are converted to visual styles (colors).

use anstyle::{AnsiColor, Color, Style};

/// Semantic category of a document fragment.
///
/// This describes what a piece of text represents semantically, allowing
/// rendering to apply appropriate visual styling.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum Semantic {
    /// Language keywords (let, in, if, fn, etc.).
    Keyword,
    /// Type names (Integer, String, List, etc.).
    TypeName,
    /// Variable and function names.
    Variable,
    /// Operators (+, ->, =>, |, &, etc.).
    Operator,
    /// Structural punctuation (parens, brackets, commas, colons, etc.).
    Punctuation,
    /// Literal values (numbers, strings, booleans).
    Literal,
    /// Field and property names.
    Field,
    /// Comments, recursive indicators, etc.
    Comment,
}

impl Semantic {
    /// Converts semantic annotation to visual style.
    #[must_use]
    pub const fn to_style(self) -> Style {
        match self {
            Self::Keyword => Style::new().fg_color(Some(Color::Ansi(AnsiColor::Magenta))),
            Self::TypeName => Style::new().fg_color(Some(Color::Ansi(AnsiColor::Blue))),
            Self::Variable => Style::new(),
            Self::Operator => Style::new().fg_color(Some(Color::Ansi(AnsiColor::Yellow))),
            Self::Punctuation | Self::Comment => {
                Style::new().fg_color(Some(Color::Ansi(AnsiColor::BrightBlack)))
            }
            Self::Literal => Style::new().fg_color(Some(Color::Ansi(AnsiColor::Green))),
            Self::Field => Style::new().fg_color(Some(Color::Ansi(AnsiColor::Cyan))),
        }
    }
}
