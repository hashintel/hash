use alloc::{
    alloc::{Allocator, Global},
    borrow::Cow,
};
use core::{fmt, fmt::Display};

use super::phrase::Phrase;

/// The untruncatable head of every card.
pub(crate) struct Prelude<'text, A: Allocator = Global> {
    pub relation: Cow<'text, str>,
    pub description: Option<Cow<'text, str>>,
    pub aliases: Vec<Cow<'text, str>, A>,
    pub inverse: Option<Phrase<'text>>,
}

impl<A: Allocator> Display for Prelude<'_, A> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        let Self {
            relation,
            description,
            aliases,
            inverse,
        } = self;
        writeln!(fmt, "Relation: {relation}")?;

        if let Some(description) = description
            && !description.is_empty()
        {
            writeln!(fmt, "Description: {description}")?;
        }

        if !aliases.is_empty() {
            writeln!(fmt, "Aliases:")?;
            for alias in aliases {
                writeln!(fmt, "  - {alias}")?;
            }
        }

        if let Some(inverse) = inverse {
            writeln!(fmt, "Inverse Name: {inverse}")?;
        } else {
            writeln!(fmt, "Inverse Name: none recorded")?;
        }

        Ok(())
    }
}
