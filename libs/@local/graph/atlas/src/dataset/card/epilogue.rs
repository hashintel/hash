use alloc::borrow::Cow;
use core::{fmt, fmt::Display};

pub(crate) struct Epilogue<'text> {
    pub slug: Cow<'text, str>,
}

impl Display for Epilogue<'_> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        let Self { slug } = self;

        write!(fmt, "Slug: {slug}")
    }
}
