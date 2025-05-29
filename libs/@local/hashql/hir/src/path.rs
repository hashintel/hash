use core::fmt::{self, Display};

use hashql_core::{intern::Interned, pretty::display::DisplayBuilder, symbol::Ident};

mod private {
    #[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
    pub struct Marker;
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct QualifiedPath<'heap>(pub Interned<'heap, [Ident<'heap>]>, pub private::Marker);

impl<'heap> QualifiedPath<'heap> {
    /// Create a new `QualifiedPath` value.
    ///
    /// The value referred to *must* follow all the constraints and guarantees that are required for
    /// the `QualifiedPath` type.
    #[inline]
    #[must_use]
    pub const fn new_unchecked(value: Interned<'heap, [Ident<'heap>]>) -> Self {
        Self(value, private::Marker)
    }
}

impl Display for QualifiedPath<'_> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        let display = DisplayBuilder::new(self.0.iter().map(|ident| ident.value.demangle()))
            .separated("::")
            .leading("::");

        Display::fmt(&display, fmt)
    }
}
