use core::{borrow::Borrow, hash::Hash};

use hashql_core::{
    collections::FastHashMap,
    id::{Id, IdVec},
};

use super::{
    DeltaRevision,
    history::{EntryKind, History, Versioned},
    id::DeltaRowId,
};
use crate::{
    file::identity::{Key, Row},
    salt::fit::prepare::IdentityProvider,
    serve2::codec::Universe,
};

#[cfg(test)]
mod tests;

/// Identity lookups with revision-dependent visibility and current payload values.
///
/// Decisions apply inclusively at their revision. Added rows are absent before birth. Without a
/// retained decision, fitted rows use the base provider and added rows are live.
///
/// # Warning
///
/// Evicting decisions can change answers to older revision queries.
pub(super) trait VersionedIdentityProvider<K, R>: IdentityProvider<K, R>
where
    R: Row,
    K: Key,
{
    fn universe(&self) -> Universe<R>;

    fn key_of_at(&self, row: R, revision: DeltaRevision) -> Option<K>;

    fn row_of_at(&self, key: K, revision: DeltaRevision) -> Option<R>;

    fn payload_of_key_at(&self, key: K, revision: DeltaRevision) -> Option<&K::Payload>;

    fn payload_of_row_at(&self, row: R, revision: DeltaRevision) -> Option<&K::Payload>;
}

impl<K, R, T: VersionedIdentityProvider<K, R> + ?Sized> VersionedIdentityProvider<K, R> for &T
where
    R: Row,
    K: Key,
{
    fn universe(&self) -> Universe<R> {
        T::universe(self)
    }

    fn key_of_at(&self, row: R, revision: DeltaRevision) -> Option<K> {
        T::key_of_at(self, row, revision)
    }

    fn row_of_at(&self, key: K, revision: DeltaRevision) -> Option<R> {
        T::row_of_at(self, key, revision)
    }

    fn payload_of_key_at(&self, key: K, revision: DeltaRevision) -> Option<&K::Payload> {
        T::payload_of_key_at(self, key, revision)
    }

    fn payload_of_row_at(&self, row: R, revision: DeltaRevision) -> Option<&K::Payload> {
        T::payload_of_row_at(self, row, revision)
    }
}

#[repr(transparent)]
pub(crate) struct NaiveIdentityProvider<T: ?Sized>(T);

impl<T: ?Sized> NaiveIdentityProvider<T> {
    #[inline]
    pub(crate) const fn new(value: T) -> Self
    where
        T: Sized,
    {
        Self(value)
    }

    #[inline]
    pub(crate) const fn from_ref(value: &T) -> &Self {
        let ptr = &raw const *value;
        // SAFETY: `Self` is transparent over `T` and adds no validity requirements. The cast
        // preserves pointer metadata and the shared borrow's lifetime.
        unsafe { &*(ptr as *const Self) }
    }

    #[inline]
    pub(crate) const fn from_mut(value: &mut T) -> &mut Self {
        let ptr = &raw mut *value;

        // SAFETY: `Self` is transparent over `T` and adds no validity requirements. The cast
        // preserves pointer metadata and the exclusive borrow's lifetime.
        unsafe { &mut *(ptr as *mut Self) }
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
    fn universe(&self) -> Universe<R> {
        Universe::from_length(self.count())
    }

    #[inline]
    fn key_of_at(&self, row: R, _: DeltaRevision) -> Option<K> {
        self.key_of(row)
    }

    #[inline]
    fn row_of_at(&self, key: K, _: DeltaRevision) -> Option<R> {
        self.row_of(key)
    }

    #[inline]
    fn payload_of_key_at(&self, key: K, _: DeltaRevision) -> Option<&K::Payload> {
        self.payload_of_key(key)
    }

    #[inline]
    fn payload_of_row_at(&self, row: R, _: DeltaRevision) -> Option<&K::Payload> {
        self.payload_of_row(row)
    }
}

#[derive(Debug)]
pub(crate) struct IdentityProviderResidual<K, R, P> {
    universe: Universe<R>,

    forward: FastHashMap<K, R>,
    inverse: IdVec<DeltaRowId<R>, Versioned<K>>,
    payload: FastHashMap<K, P>,

    history: FastHashMap<R, History>,
}

impl<K, R, P> IdentityProviderResidual<K, R, P> {
    #[inline]
    fn new(base: &(impl VersionedIdentityProvider<K, R> + ?Sized)) -> Self
    where
        K: Key<Payload: ToOwned<Owned = P>>,
        R: Row,
    {
        Self {
            universe: base.universe(),

            forward: FastHashMap::default(),
            inverse: IdVec::default(),
            payload: FastHashMap::default(),
            history: FastHashMap::default(),
        }
    }

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
            let Some(delta) = DeltaRowId::derive(base.universe(), row) else {
                tracing::warn!("todo");
                return false;
            };

            let inverse = &mut self.inverse[delta];
            inverse.push(EntryKind::Withdrawn, revision);
            true
        } else if let Some(row) = base.row_of(key) {
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
            universe: self.universe.clone(),
            forward: self.forward.clone(),
            inverse: self.inverse.clone(),
            payload: self.payload.clone(),
            history: self.history.clone(),
        }
    }

    #[inline]
    fn clone_from(&mut self, source: &Self) {
        let Self {
            universe,
            forward,
            inverse,
            payload,
            history,
        } = self;

        universe.clone_from(&source.universe);
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
    fn permits_row(&self, row: R, revision: Option<DeltaRevision>) -> bool {
        DeltaRowId::derive(self.base.universe(), row).map_or_else(
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
        DeltaRowId::derive(self.base.universe(), row).map_or_else(
            || {
                revision.map_or_else(
                    || self.base.key_of(row),
                    |revision| self.base.key_of_at(row, revision),
                )
            },
            |delta| self.data.inverse.get(delta).map(|entry| *entry.data()),
        )
    }

    fn lookup_row(&self, key: K, revision: Option<DeltaRevision>) -> Option<R> {
        let row = self.data.forward.get(&key).copied().or_else(|| {
            revision.map_or_else(
                || self.base.row_of(key),
                |revision| self.base.row_of_at(key, revision),
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
                |revision| self.base.payload_of_key_at(key, revision),
            )
        })
    }

    fn lookup_payload_of_row(
        &self,
        row: R,
        revision: Option<DeltaRevision>,
    ) -> Option<&K::Payload> {
        let key = self.lookup_key(row, revision)?;
        self.data.payload.get(&key).map(Borrow::borrow).or_else(|| {
            revision.map_or_else(
                || self.base.payload_of_row(row),
                |revision| self.base.payload_of_row_at(row, revision),
            )
        })
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
        self.data.universe.size()
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
    fn universe(&self) -> Universe<R> {
        self.data.universe
    }

    fn key_of_at(&self, row: R, revision: DeltaRevision) -> Option<K> {
        self.lookup_key(row, Some(revision))
    }

    fn row_of_at(&self, key: K, revision: DeltaRevision) -> Option<R> {
        self.lookup_row(key, Some(revision))
    }

    fn payload_of_key_at(&self, key: K, revision: DeltaRevision) -> Option<&K::Payload> {
        self.lookup_payload_of_key(key, Some(revision))
    }

    fn payload_of_row_at(&self, row: R, revision: DeltaRevision) -> Option<&K::Payload> {
        self.lookup_payload_of_row(row, Some(revision))
    }
}
