//! The card's closing line, the relation slug.

use alloc::borrow::Cow;
use core::{fmt, fmt::Display};

/// The card's final line, carrying the relation slug.
pub(crate) struct Epilogue<'text> {
    /// The relation's slug.
    pub slug: Cow<'text, str>,
}

impl Display for Epilogue<'_> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        let Self { slug } = self;

        write!(fmt, "Slug: {slug}")
    }
}
