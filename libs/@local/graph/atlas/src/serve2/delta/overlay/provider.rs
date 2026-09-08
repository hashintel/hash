use crate::{
    file::identity::{Key, Row},
    salt::fit::prepare::IdentityProvider,
    serve2::{codec::Universe, delta::DeltaRevision},
};

/// Identity lookups with revision-dependent visibility and current payload values.
///
/// Decisions apply inclusively at their revision. Added rows are absent before birth. Without a
/// retained decision, fitted rows use the base provider and added rows are live.
///
/// # Warning
///
/// Evicting decisions can change answers to older revision queries.
pub(crate) trait VersionedIdentityProvider<K, R>: IdentityProvider<K, R>
where
    R: Row,
    K: Key,
{
    fn provide_universe(&self) -> Universe<R>;

    /// Resolves an allocated row regardless of visibility.
    fn provide_allocated_row_of(&self, key: K) -> Option<R>;

    /// Resolves an allocated key regardless of visibility.
    fn provide_allocated_key_of(&self, row: R) -> Option<K>;

    fn provide_key_of_at(&self, row: R, revision: DeltaRevision) -> Option<K>;

    fn provide_row_of_at(&self, key: K, revision: DeltaRevision) -> Option<R>;

    fn provide_payload_of_key_at(&self, key: K, revision: DeltaRevision) -> Option<&K::Payload>;

    fn provide_payload_of_row_at(&self, row: R, revision: DeltaRevision) -> Option<&K::Payload>;
}

impl<K, R, T: VersionedIdentityProvider<K, R> + ?Sized> VersionedIdentityProvider<K, R> for &T
where
    R: Row,
    K: Key,
{
    fn provide_universe(&self) -> Universe<R> {
        T::provide_universe(self)
    }

    fn provide_allocated_row_of(&self, key: K) -> Option<R> {
        T::provide_allocated_row_of(self, key)
    }

    fn provide_allocated_key_of(&self, row: R) -> Option<K> {
        T::provide_allocated_key_of(self, row)
    }

    fn provide_key_of_at(&self, row: R, revision: DeltaRevision) -> Option<K> {
        T::provide_key_of_at(self, row, revision)
    }

    fn provide_row_of_at(&self, key: K, revision: DeltaRevision) -> Option<R> {
        T::provide_row_of_at(self, key, revision)
    }

    fn provide_payload_of_key_at(&self, key: K, revision: DeltaRevision) -> Option<&K::Payload> {
        T::provide_payload_of_key_at(self, key, revision)
    }

    fn provide_payload_of_row_at(&self, row: R, revision: DeltaRevision) -> Option<&K::Payload> {
        T::provide_payload_of_row_at(self, row, revision)
    }
}
