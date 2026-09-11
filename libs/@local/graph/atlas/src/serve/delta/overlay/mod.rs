use core::{borrow::Borrow, hash::Hash};

use hashql_core::{collections::FastHashMap, id::IdVec};

use super::{
    DeltaRevision,
    history::{EntryKind, History, Versioned},
    id::DeltaRowId,
};
use crate::{
    file::identity::{Key, Row},
    salt::fit::prepare::IdentityProvider,
    serve::codec::RowDomain,
};

#[cfg(test)]
mod tests;

mod provider;

pub(crate) use self::provider::VersionedIdentityProvider;

#[repr(transparent)]
pub(crate) struct NaiveIdentityProvider<T: ?Sized>(T);

impl<T: ?Sized> NaiveIdentityProvider<T> {
    #[inline]
    pub(crate) const fn from_ref(value: &T) -> &Self {
        let ptr = &raw const *value;
        // SAFETY: `Self` is transparent over `T` and adds no validity requirements. The cast
        // preserves pointer metadata and the shared borrow's lifetime.
        unsafe { &*(ptr as *const Self) }
    }
}

impl<K, R, T: IdentityProvider<K, R> + ?Sized> IdentityProvider<K, R> for NaiveIdentityProvider<T>
where
    R: Row,
    K: Key,
{
    #[inline]
    fn count(&self) -> usize {
        self.0.count()
    }

    #[inline]
    fn key_of(&self, row: R) -> Option<K> {
        self.0.key_of(row)
    }

    #[inline]
    fn row_of(&self, key: K) -> Option<R> {
        self.0.row_of(key)
    }

    #[inline]
    fn payload_of_key(&self, key: K) -> Option<&<K as Key>::Payload> {
        self.0.payload_of_key(key)
    }

    #[inline]
    fn payload_of_row(&self, row: R) -> Option<&K::Payload> {
        self.0.payload_of_row(row)
    }
}

impl<K, R, T: IdentityProvider<K, R> + ?Sized> VersionedIdentityProvider<K, R>
    for NaiveIdentityProvider<T>
where
    R: Row,
    K: Key,
{
    #[inline]
    fn provide_domain(&self) -> RowDomain<R> {
        RowDomain::from_length(self.count())
    }

    #[inline]
    fn provide_allocated_row_of(&self, key: K) -> Option<R> {
        self.row_of(key)
    }

    #[inline]
    fn provide_allocated_key_of(&self, row: R) -> Option<K> {
        self.key_of(row)
    }

    #[inline]
    fn provide_key_of_at(&self, row: R, _: DeltaRevision) -> Option<K> {
        self.key_of(row)
    }

    #[inline]
    fn provide_row_of_at(&self, key: K, _: DeltaRevision) -> Option<R> {
        self.row_of(key)
    }

    #[inline]
    fn provide_payload_of_key_at(&self, key: K, _: DeltaRevision) -> Option<&K::Payload> {
        self.payload_of_key(key)
    }

    #[inline]
    fn provide_payload_of_row_at(&self, row: R, _: DeltaRevision) -> Option<&K::Payload> {
        self.payload_of_row(row)
    }
}

/// Identity rows added, withdrawn and relabelled over an immutable base provider.
///
/// The residual snapshots the base's [`RowDomain`] at construction and allocates added rows past
/// it, in order. An added row's [`DeltaRowId`] is its offset from that snapshot, and every method
/// taking a `base` requires one reporting the snapshotted domain: the archive-backed
/// [`NaiveIdentityProvider`] over a read-only table reports a constant domain, and a provider
/// whose domain grows after the snapshot violates the requirement.
#[derive(Debug)]
pub(crate) struct IdentityProviderResidual<K, R, P> {
    domain: RowDomain<R>,

    forward: FastHashMap<K, R>,
    inverse: IdVec<DeltaRowId<R>, Versioned<K>>,
    payload: FastHashMap<K, P>,

    history: FastHashMap<R, History>,
}

impl<K, R, P> IdentityProviderResidual<K, R, P> {
    #[inline]
    pub(crate) fn new(base: &(impl VersionedIdentityProvider<K, R> + ?Sized)) -> Self
    where
        K: Key<Payload: ToOwned<Owned = P>>,
        R: Row,
    {
        Self {
            domain: base.provide_domain(),

            forward: FastHashMap::default(),
            inverse: IdVec::default(),
            payload: FastHashMap::default(),
            history: FastHashMap::default(),
        }
    }

    #[inline]
    pub(crate) const fn bind<B>(&self, base: B) -> DeltaIdentityProvider<'_, B, K, R, P> {
        DeltaIdentityProvider::from_parts(self, base)
    }

    pub(crate) fn withdrawn<'this, I: VersionedIdentityProvider<K, R> + ?Sized>(
        &'this self,
        base: &I,
    ) -> impl IntoIterator<Item = R> + use<'this, I, K, R, P>
    where
        K: Key<Payload: ToOwned<Owned = P>>,
        R: Row,
    {
        let base = base.provide_domain();

        self.history
            .iter()
            .filter_map(|(&row, history)| history.now().is_withdrawn().then_some(row))
            .chain(
                self.inverse
                    .iter_enumerated()
                    .filter(move |(_, versioned)| versioned.is_withdrawn(None))
                    .map(move |(delta, _)| R::from_u64(delta.get()).plus(base.size())),
            )
    }

    /// Records local activation and a current payload without changing an allocated row.
    ///
    /// Returns the row and whether visibility or payload changed. `None` leaves the residual
    /// unchanged when no row remains available.
    ///
    /// # Panics
    ///
    /// Panics if `revision` precedes the key's latest recorded visibility transition, or if `base`
    /// reports a domain past an added row of this residual.
    pub(crate) fn insert(
        &mut self,
        base: &impl VersionedIdentityProvider<K, R>,
        revision: DeltaRevision,
        key: K,
        payload: P,
    ) -> Option<(R, bool)>
    where
        K: Key<Payload: PartialEq> + Hash + Eq,
        R: Row,
        P: Borrow<K::Payload>,
    {
        let (row, mut changed) = if let Some(&row) = self.forward.get(&key) {
            let delta = DeltaRowId::derive(base.provide_domain(), row)
                .expect("an added identity row must follow the fitted rows");
            (row, self.inverse[delta].push(EntryKind::Live, revision))
        } else if let Some(row) = base.provide_allocated_row_of(key) {
            let changed = self
                .history
                .get_mut(&row)
                .is_some_and(|history| history.push(EntryKind::Live, revision));
            (row, changed)
        } else {
            let (universe, row) = self.domain.grow()?;
            self.domain = universe;
            self.forward.insert(key, row);
            self.inverse.push(Versioned::new(key, revision));
            (row, true)
        };

        let previous = self
            .payload
            .get(&key)
            .map(Borrow::borrow)
            .or_else(|| base.payload_of_key(key));
        if previous != Some(payload.borrow()) {
            self.payload.insert(key, payload);
            changed = true;
        }

        Some((row, changed))
    }

    /// Hides a key while preserving its row and payload for revival.
    ///
    /// Returns whether visibility changed.
    ///
    /// # Panics
    ///
    /// Panics if `revision` precedes the key's latest recorded visibility transition, or if `base`
    /// reports a domain past an added row of this residual.
    pub(crate) fn withdraw(
        &mut self,
        base: &impl VersionedIdentityProvider<K, R>,
        revision: DeltaRevision,
        key: K,
    ) -> bool
    where
        K: Key + Hash + Eq,
        R: Row,
    {
        if let Some(&row) = self.forward.get(&key) {
            let delta = DeltaRowId::derive(base.provide_domain(), row)
                .expect("an added identity row must follow the fitted rows");

            self.inverse[delta].push(EntryKind::Withdrawn, revision)
        } else if let Some(row) = base.provide_allocated_row_of(key) {
            let mut has_changed = false;

            let entry = self.history.entry(row).or_insert_with(|| {
                has_changed = true;
                History::new(EntryKind::Withdrawn, revision)
            });

            has_changed | entry.push(EntryKind::Withdrawn, revision)
        } else {
            false
        }
    }
}

impl<K: Clone, R: Clone, P: Clone> Clone for IdentityProviderResidual<K, R, P> {
    #[inline]
    fn clone(&self) -> Self {
        Self {
            domain: self.domain.clone(),
            forward: self.forward.clone(),
            inverse: self.inverse.clone(),
            payload: self.payload.clone(),
            history: self.history.clone(),
        }
    }

    #[inline]
    fn clone_from(&mut self, source: &Self) {
        let Self {
            domain,
            forward,
            inverse,
            payload,
            history,
        } = self;

        domain.clone_from(&source.domain);
        forward.clone_from(&source.forward);
        inverse.clone_from(&source.inverse);
        payload.clone_from(&source.payload);
        history.clone_from(&source.history);
    }
}

pub(crate) struct DeltaIdentityProvider<'ctx, B, K, R, P> {
    data: &'ctx IdentityProviderResidual<K, R, P>,
    base: B,
}

impl<'ctx, B, K, R, P> DeltaIdentityProvider<'ctx, B, K, R, P> {
    pub(crate) const fn from_parts(data: &'ctx IdentityProviderResidual<K, R, P>, base: B) -> Self {
        Self { data, base }
    }
}

impl<K, R, B> DeltaIdentityProvider<'_, B, K, R, <K::Payload as ToOwned>::Owned>
where
    R: Row,
    K: Key + Hash + Eq,
    B: VersionedIdentityProvider<K, R>,
{
    pub(crate) fn permits_row(&self, row: R, revision: Option<DeltaRevision>) -> bool {
        DeltaRowId::derive(self.base.provide_domain(), row).map_or_else(
            || {
                self.data
                    .history
                    .get(&row)
                    .and_then(|history| {
                        revision
                            .map_or_else(|| Some(history.now()), |revision| history.at(revision))
                    })
                    .is_none_or(|kind| kind == EntryKind::Live)
            },
            |delta| {
                self.data
                    .inverse
                    .get(delta)
                    .is_some_and(|entry| entry.is_live(revision))
            },
        )
    }

    fn lookup_key(&self, row: R, revision: Option<DeltaRevision>) -> Option<K> {
        if !self.permits_row(row, revision) {
            return None;
        }

        DeltaRowId::derive(self.base.provide_domain(), row).map_or_else(
            || {
                revision.map_or_else(
                    || self.base.key_of(row),
                    |revision| self.base.provide_key_of_at(row, revision),
                )
            },
            |delta| self.data.inverse.get(delta).map(|entry| *entry.data()),
        )
    }

    fn lookup_row(&self, key: K, revision: Option<DeltaRevision>) -> Option<R> {
        let row = self.data.forward.get(&key).copied().or_else(|| {
            revision.map_or_else(
                || self.base.row_of(key),
                |revision| self.base.provide_row_of_at(key, revision),
            )
        })?;

        self.permits_row(row, revision).then_some(row)
    }

    fn lookup_payload_of_key(
        &self,
        key: K,
        revision: Option<DeltaRevision>,
    ) -> Option<&K::Payload> {
        self.lookup_row(key, revision)?;
        self.data.payload.get(&key).map(Borrow::borrow).or_else(|| {
            revision.map_or_else(
                || self.base.payload_of_key(key),
                |revision| self.base.provide_payload_of_key_at(key, revision),
            )
        })
    }

    fn lookup_payload_of_row(
        &self,
        row: R,
        revision: Option<DeltaRevision>,
    ) -> Option<&K::Payload> {
        DeltaIdentityProvider::from_parts(self.data, &self.base)
            .into_lookup_payload_of_row(row, revision)
    }
}

impl<'payload, K, R, B>
    DeltaIdentityProvider<'payload, &'payload B, K, R, <K::Payload as ToOwned>::Owned>
where
    R: Row,
    K: Key + Hash + Eq,
    B: VersionedIdentityProvider<K, R> + ?Sized,
{
    fn into_lookup_payload_of_row(
        self,
        row: R,
        revision: Option<DeltaRevision>,
    ) -> Option<&'payload K::Payload> {
        let key = self.lookup_key(row, revision)?;
        self.data.payload.get(&key).map(Borrow::borrow).or_else(|| {
            revision.map_or_else(
                || self.base.payload_of_row(row),
                |revision| self.base.provide_payload_of_row_at(row, revision),
            )
        })
    }

    /// Borrows the visible row's current payload beyond this provider's lifetime.
    pub(crate) fn into_payload_of_row_at(
        self,
        row: R,
        revision: DeltaRevision,
    ) -> Option<&'payload K::Payload> {
        self.into_lookup_payload_of_row(row, Some(revision))
    }
}

impl<K, R, B> IdentityProvider<K, R>
    for DeltaIdentityProvider<'_, B, K, R, <K::Payload as ToOwned>::Owned>
where
    R: Row,
    K: Key + Hash + Eq,
    B: VersionedIdentityProvider<K, R>,
{
    #[inline]
    fn count(&self) -> usize {
        self.data.domain.size()
    }

    #[inline]
    fn key_of(&self, row: R) -> Option<K> {
        self.lookup_key(row, None)
    }

    #[inline]
    fn row_of(&self, key: K) -> Option<R> {
        self.lookup_row(key, None)
    }

    #[inline]
    fn payload_of_key(&self, key: K) -> Option<&K::Payload> {
        self.lookup_payload_of_key(key, None)
    }

    #[inline]
    fn payload_of_row(&self, row: R) -> Option<&K::Payload> {
        self.lookup_payload_of_row(row, None)
    }
}

impl<K, R, B> VersionedIdentityProvider<K, R>
    for DeltaIdentityProvider<'_, B, K, R, <K::Payload as ToOwned>::Owned>
where
    R: Row,
    K: Key + Hash + Eq,
    B: VersionedIdentityProvider<K, R>,
{
    fn provide_domain(&self) -> RowDomain<R> {
        self.data.domain
    }

    fn provide_allocated_row_of(&self, key: K) -> Option<R> {
        self.data
            .forward
            .get(&key)
            .copied()
            .or_else(|| self.base.provide_allocated_row_of(key))
    }

    fn provide_allocated_key_of(&self, row: R) -> Option<K> {
        DeltaRowId::derive(self.base.provide_domain(), row).map_or_else(
            || self.base.provide_allocated_key_of(row),
            |delta| self.data.inverse.get(delta).map(|entry| *entry.data()),
        )
    }

    fn provide_key_of_at(&self, row: R, revision: DeltaRevision) -> Option<K> {
        self.lookup_key(row, Some(revision))
    }

    fn provide_row_of_at(&self, key: K, revision: DeltaRevision) -> Option<R> {
        self.lookup_row(key, Some(revision))
    }

    fn provide_payload_of_key_at(&self, key: K, revision: DeltaRevision) -> Option<&K::Payload> {
        self.lookup_payload_of_key(key, Some(revision))
    }

    fn provide_payload_of_row_at(&self, row: R, revision: DeltaRevision) -> Option<&K::Payload> {
        self.lookup_payload_of_row(row, Some(revision))
    }
}
