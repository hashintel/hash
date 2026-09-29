use core::fmt::{self, Write as _};

/// Text between `quote` characters, with each `quote` in the text doubled.
struct Quoted<'text> {
    text: &'text str,
    quote: char,
}

impl fmt::Display for Quoted<'_> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_char(self.quote)?;
        let mut parts = self.text.split(self.quote);
        if let Some(first) = parts.next() {
            fmt.write_str(first)?;
        }
        for part in parts {
            fmt.write_char(self.quote)?;
            fmt.write_char(self.quote)?;
            fmt.write_str(part)?;
        }
        fmt.write_char(self.quote)
    }
}

/// A table or column name in a DuckDB statement.
///
/// It displays as a quoted identifier, so the name can contain spaces, quotes and `/`, and can be
/// a keyword. DuckDB refuses an empty name and a name that contains NUL. It compares identifiers
/// without regard to case, quoted or not.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Identifier<'name>(&'name str);

impl<'name> Identifier<'name> {
    #[must_use]
    pub const fn new(name: &'name str) -> Self {
        Self(name)
    }
}

impl fmt::Display for Identifier<'_> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        Quoted {
            text: self.0,
            quote: '"',
        }
        .fmt(fmt)
    }
}

/// A string value in a DuckDB statement.
///
/// It displays as a quoted string literal whose value is the given text. DuckDB refuses text that
/// contains NUL. Use it where DuckDB does not accept a parameter, such as in a `SET` statement.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct StringLiteral<'text>(&'text str);

impl<'text> StringLiteral<'text> {
    #[must_use]
    pub const fn new(text: &'text str) -> Self {
        Self(text)
    }
}

impl fmt::Display for StringLiteral<'_> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        Quoted {
            text: self.0,
            quote: '\'',
        }
        .fmt(fmt)
    }
}
