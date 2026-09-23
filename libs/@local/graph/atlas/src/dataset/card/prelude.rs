//! The card's head block holds the relation name, description, aliases and inverse.

use alloc::{alloc::Global, borrow::Cow};
use core::{alloc::Allocator, fmt, fmt::Display};

use super::phrase::Phrase;

/// The untruncatable head of every card.
pub(crate) struct Prelude<'text, A: Allocator = Global> {
    /// The relation's name.
    pub relation: Cow<'text, str>,
    /// The relation's description.
    pub description: Option<Cow<'text, str>>,
    /// The relation's alternative names.
    pub aliases: Vec<Cow<'text, str>, A>,
    /// The inverse relation.
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
