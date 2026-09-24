//! Identity-provider contracts for current and retained revisions.

use crate::{
    file::identity::{Key, Row},
    salt::fit::prepare::IdentityProvider,
    serve::{codec::RowDomain, delta::DeltaRevision},
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
    /// Returns the snapshotted row domain, including withdrawn and unbound rows.
    fn provide_domain(&self) -> RowDomain<R>;

    /// Resolves an allocated row regardless of visibility.
    fn provide_allocated_row_of(&self, key: K) -> Option<R>;

    /// Resolves an allocated key regardless of visibility.
    fn provide_allocated_key_of(&self, row: R) -> Option<K>;

    /// Resolves `row`'s key at `revision`, applying the retention policy on eviction.
    fn provide_key_of_at(&self, row: R, revision: DeltaRevision) -> Option<K>;

    /// Resolves `key`'s row at `revision`, applying the retention policy on eviction.
    fn provide_row_of_at(&self, key: K, revision: DeltaRevision) -> Option<R>;

    /// Resolves `key`'s current payload when visible at `revision`, applying the eviction fallback.
    fn provide_payload_of_key_at(&self, key: K, revision: DeltaRevision) -> Option<&K::Payload>;

    /// Resolves `row`'s current payload when visible at `revision`, applying the eviction fallback.
    fn provide_payload_of_row_at(&self, row: R, revision: DeltaRevision) -> Option<&K::Payload>;
}

impl<K, R, T: VersionedIdentityProvider<K, R> + ?Sized> VersionedIdentityProvider<K, R> for &T
where
    R: Row,
    K: Key,
{
    fn provide_domain(&self) -> RowDomain<R> {
        T::provide_domain(self)
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
