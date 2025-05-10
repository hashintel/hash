use hashql_core::{intern::Interned, symbol::Ident};

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
