use crate::file::identity::{Key, Row};

pub(crate) trait IdentityProvider<K, R>
where
    R: Row,
    K: Key,
{
    fn count(&self) -> usize;

    fn key_of(&self, row: R) -> Option<K>;

    fn row_of(&self, key: K) -> Option<R>;

    fn payload_of_key(&self, key: K) -> Option<&K::Payload>;

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
