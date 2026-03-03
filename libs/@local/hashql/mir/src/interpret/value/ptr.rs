//! Function pointer representation for the MIR interpreter.

use core::{fmt, fmt::Display};

use crate::def::DefId;

/// A function pointer value.
///
/// Points to a function definition identified by its [`DefId`]. Used to
/// represent first-class functions and closures in the interpreter.
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Ptr {
    value: DefId,
}

impl Ptr {
    /// Creates a new function pointer from a [`DefId`].
    #[must_use]
    pub const fn new(value: DefId) -> Self {
        Self { value }
    }

    /// Returns the [`DefId`] this pointer references.
    #[must_use]
    pub const fn def(self) -> DefId {
        self.value
    }
}

impl From<DefId> for Ptr {
    fn from(value: DefId) -> Self {
        Self::new(value)
    }
}

impl Display for Ptr {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(fmt, "*{}", self.value)
    }
}
