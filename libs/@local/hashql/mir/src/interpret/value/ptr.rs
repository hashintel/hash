//! Function pointer representation for the MIR interpreter.

use core::{fmt, fmt::Display};

use crate::def::DefId;

/// A function pointer value.
///
/// Points to a function definition identified by its [`DefId`]. Used to
/// represent first-class functions and closures in the interpreter.
///
/// # Examples
///
/// ```
/// use hashql_mir::{def::DefId, interpret::value::Ptr};
///
/// let def = DefId::new(0);
/// let ptr = Ptr::new(def);
/// assert_eq!(ptr.def(), def);
/// assert_eq!(ptr.to_string(), format!("*{def}"));
/// ```
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Ptr {
    value: DefId,
}

impl Ptr {
    /// Creates a new function pointer from a [`DefId`].
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_mir::{def::DefId, interpret::value::Ptr};
    ///
    /// let def = DefId::new(0);
    /// let ptr = Ptr::new(def);
    /// assert_eq!(ptr.def(), def);
    /// ```
    #[inline]
    #[must_use]
    pub const fn new(value: DefId) -> Self {
        Self { value }
    }

    /// Returns the [`DefId`] this pointer references.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_mir::{def::DefId, interpret::value::Ptr};
    ///
    /// let def = DefId::new(0);
    /// let ptr = Ptr::from(def);
    /// assert_eq!(ptr.def(), def);
    /// ```
    #[inline]
    #[must_use]
    pub const fn def(self) -> DefId {
        self.value
    }
}

impl From<DefId> for Ptr {
    #[inline]
    fn from(value: DefId) -> Self {
        Self::new(value)
    }
}

impl Display for Ptr {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(fmt, "*{}", self.value)
    }
}
