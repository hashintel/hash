use core::fmt::Display;
use std::{borrow::Cow, fmt};

pub(crate) struct Epilogue<'text> {
    pub slug: Cow<'text, str>,
}

impl Display for Epilogue<'_> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        let Self { slug } = self;

        write!(fmt, "Slug: {slug}")
    }
}
