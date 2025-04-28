mod map;
mod set;
use core::{
    cmp::Ordering,
    fmt::{self, Debug, Display},
    hash::{Hash, Hasher},
    ops::Deref,
    ptr,
};

pub use self::{
    map::{Decompose, InternMap},
    set::InternSet,
};

mod private {
    #[derive(Debug, Copy, Clone)]
    pub struct Marker;
}

/// A reference to a value that is interned, and is known to be unique.
///
/// Note that it is possible to have a `T` and a `Interned<T>` that are (or
/// refer to) equal but different values. But if you have two different
/// `Interned<T>`s, they both refer to the same value, at a single location in
/// memory. This means that equality and hashing can be done on the value's
/// address rather than the value's contents, which can improve performance.
///
/// The `Marker` field means you can pattern match with `Interned(v, _)`
/// but you can only construct a `Interned` with `new_unchecked`, and not
/// directly.
pub struct Interned<'heap, T: ?Sized>(pub &'heap T, pub private::Marker);

impl<'heap, T: ?Sized> Interned<'heap, T> {
    /// Create a new `Interned` value.
    ///
    /// The value referred to *must* be interned
    /// and thus be unique, and it *must* remain unique in the future. This
    /// function has `_unchecked` in the name but is not `unsafe`, because if
    /// the uniqueness condition is violated condition it will cause incorrect
    /// behaviour but will not affect memory safety.
    #[inline]
    pub const fn new_unchecked(value: &'heap T) -> Self {
        Interned(value, private::Marker)
    }
}

impl<T: ?Sized + Debug> Debug for Interned<'_, T> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        Debug::fmt(self.0, fmt)
    }
}

impl<T: ?Sized + Display> Display for Interned<'_, T> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        Display::fmt(self.0, fmt)
    }
}

impl<T: ?Sized> Clone for Interned<'_, T> {
    fn clone(&self) -> Self {
        *self
    }
}

impl<T: ?Sized> Copy for Interned<'_, T> {}

impl<T: ?Sized> Deref for Interned<'_, T> {
    type Target = T;

    #[inline]
    fn deref(&self) -> &Self::Target {
        self.0
    }
}

impl<T: ?Sized> PartialEq for Interned<'_, T> {
    #[inline]
    fn eq(&self, other: &Self) -> bool {
        // Pointer equality implies equality, due to the uniqueness constraint.
        ptr::eq(self.0, other.0)
    }
}

impl<T: ?Sized> Eq for Interned<'_, T> {}

impl<T: ?Sized + PartialOrd> PartialOrd for Interned<'_, T> {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        // Pointer equality implies equality, due to the uniqueness constraint,
        // but the contents must be compared otherwise.
        if ptr::eq(self.0, other.0) {
            Some(Ordering::Equal)
        } else {
            self.0.partial_cmp(other.0)
        }
    }
}

impl<T: ?Sized + Ord> Ord for Interned<'_, T> {
    fn cmp(&self, other: &Self) -> Ordering {
        // Pointer equality implies equality, due to the uniqueness constraint,
        // but the contents must be compared otherwise.
        if ptr::eq(self.0, other.0) {
            Ordering::Equal
        } else {
            self.0.cmp(other.0)
        }
    }
}

impl<T: ?Sized> Hash for Interned<'_, T> {
    #[inline]
    fn hash<H: Hasher>(&self, state: &mut H) {
        // Pointer hashing is sufficient, due to the uniqueness constraint.
        ptr::hash(self.0, state);
    }
}

impl<'heap, T> IntoIterator for Interned<'heap, [T]> {
    type IntoIter = core::slice::Iter<'heap, T>;
    type Item = &'heap T;

    fn into_iter(self) -> Self::IntoIter {
        self.0.iter()
    }
}
