//! The read contract over one row domain's identity table.

use crate::file::identity::{Key, Row};

/// A two-way row-to-source-key map with each key's display payload.
///
/// [`count`](Self::count) bounds the row domain. A lookup answers [`None`] for a row at or beyond
/// that bound. It also answers [`None`] when the provider holds no row for a given key, or no key
/// for a given row.
pub(crate) trait IdentityProvider<K, R>
where
    R: Row,
    K: Key,
{
    /// Returns the number of rows in the domain.
    fn count(&self) -> usize;

    /// Returns the key assigned to `row`, or [`None`] when the provider holds no key for it.
    fn key_of(&self, row: R) -> Option<K>;

    /// Returns the row `key` was assigned, or [`None`] when the domain holds no such key.
    fn row_of(&self, key: K) -> Option<R>;

    /// Returns the display payload stored for `key`.
    ///
    /// [`None`] when the domain holds no such key.
    fn payload_of_key(&self, key: K) -> Option<&K::Payload>;

    /// Returns the display payload stored for `row`.
    ///
    /// [`None`] when the provider holds no key for it.
    ///
    /// The default resolves the row's key and then its payload.
    #[inline]
    fn payload_of_row(&self, row: R) -> Option<&K::Payload> {
        let key = self.key_of(row)?;
        self.payload_of_key(key)
    }
}

impl<K, R, T: IdentityProvider<K, R> + ?Sized> IdentityProvider<K, R> for &T
where
    R: Row,
    K: Key,
{
    #[inline]
    fn count(&self) -> usize {
        T::count(self)
    }

    #[inline]
    fn key_of(&self, row: R) -> Option<K> {
        T::key_of(self, row)
    }

    #[inline]
    fn row_of(&self, key: K) -> Option<R> {
        T::row_of(self, key)
    }

    #[inline]
    fn payload_of_key(&self, key: K) -> Option<&K::Payload> {
        T::payload_of_key(self, key)
    }

    #[inline]
    fn payload_of_row(&self, row: R) -> Option<&K::Payload> {
        T::payload_of_row(self, row)
    }
}
