mod beef;
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
    beef::Beef,
    map::{Decompose, InternMap, Provisioned},
    set::InternSet,
};

mod private {
    #[derive(Debug, Copy, Clone)]
    pub struct Marker;
}

/// A reference to a value that is interned, and is known to be unique.
///
/// Note that it is possible to have a `T` and a `Interned<T>` that are (or refer to) equal but
/// different values. But if you have two different `Interned<T>`s, they both refer to the same
/// value, at a single location in memory. This means that equality and hashing can be done on the
/// value's address rather than the value's contents, which can improve performance.
///
/// The `Marker` field means you can pattern match with `Interned(v, _)` but you can only construct
/// a `Interned` with `new_unchecked`, and not directly.
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

impl<T> Interned<'_, [T]> {
    /// Returns a canonical empty interned slice.
    ///
    /// This method returns a reference to a single static empty slice that is shared across all
    /// element types `T`. This avoids unnecessary allocations when interning empty slices and
    /// ensures pointer equality for all empty slices regardless of their element type.
    ///
    /// # Implementation
    ///
    /// The implementation uses a 64-byte aligned static to satisfy alignment requirements for all
    /// standard types.
    ///
    /// The same memory address is reused for all `T`, which is sound because:
    /// - Zero-length slices are never dereferenced.
    /// - The pointer is properly aligned (64 bytes covers all standard alignments).
    /// - The length (0) is stored in the fat pointer, not at the pointed-to address.
    ///
    /// This approach is inspired by rustc's [`List::empty()`][rustc-list-empty] implementation.
    ///
    /// [rustc-list-empty]: https://github.com/rust-lang/rust/blob/master/compiler/rustc_middle/src/ty/list.rs
    ///
    /// # Examples
    ///
    /// ```
    /// # use hashql_core::intern::Interned;
    /// use core::ptr;
    ///
    /// let empty_u32: Interned<'_, [u32]> = Interned::empty();
    /// let empty_u64: Interned<'_, [u64]> = Interned::empty();
    ///
    /// // All empty slices share the same address
    /// assert!(ptr::addr_eq(empty_u32.as_ref(), empty_u64.as_ref()));
    ///
    /// // The slice is indeed empty
    /// assert!(empty_u32.is_empty());
    /// ```
    #[must_use]
    #[expect(unsafe_code)]
    pub const fn empty() -> Self {
        #[repr(align(64))]
        struct MaxAlign;

        static EMPTY: [MaxAlign; 0] = [];

        const {
            assert!(
                align_of::<T>() <= align_of::<MaxAlign>(),
                "Type alignment exceeds MaxAlign"
            );
        }

        // SAFETY: `EMPTY` is sufficiently aligned to be an empty list for all
        // types with `align_of(T) <= align_of(MaxAlign)`, which we checked above.
        let slice = unsafe { &*(ptr::from_ref::<[MaxAlign]>(&EMPTY) as *const [T]) };

        Self(slice, private::Marker)
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

impl<T: ?Sized> AsRef<T> for Interned<'_, T> {
    fn as_ref(&self) -> &T {
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

impl<'heap, T> IntoIterator for &Interned<'heap, [T]> {
    type IntoIter = core::slice::Iter<'heap, T>;
    type Item = &'heap T;

    fn into_iter(self) -> Self::IntoIter {
        self.0.iter()
    }
}

#[cfg(test)]
mod tests {
    #![expect(clippy::min_ident_chars)]
    use core::ptr;

    use super::Interned;

    #[test]
    fn stable_empty_slice() {
        let a: Interned<'_, [u16]> = Interned::empty();
        let b: Interned<'_, [u32]> = Interned::empty();
        let c: Interned<'_, [u128]> = Interned::empty();

        assert!(ptr::addr_eq(a.0, b.0));
        assert!(ptr::addr_eq(b.0, c.0));

        assert!(a.is_empty());
        assert!(b.is_empty());
        assert!(c.is_empty());
    }
}
