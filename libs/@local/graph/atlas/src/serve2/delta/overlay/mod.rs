use core::{borrow::Borrow, hash::Hash};

use hashql_core::{
    collections::FastHashMap,
    id::{Id, IdVec},
};

use super::{DeltaRevision, epoch::Epoch};
use crate::{
    file::identity::{Key, Row},
    salt::fit::prepare::IdentityProvider,
    serve2::codec::Universe,
};

#[cfg(test)]
mod tests;

trait VersionedIdentityProvider<K, R>: IdentityProvider<K, R>
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

#[repr(transparent)]
struct NaiveIdentityProvider<T: ?Sized>(T);

impl<T> NaiveIdentityProvider<T> {
    #[inline]
    pub fn new(value: T) -> Self {
        Self(value)
    }

    pub fn from_ref(value: &T) -> &Self {
        let ptr = &raw const *value;
        unsafe { &*(ptr as *const Self) }
    }

    pub fn from_mut(value: &mut T) -> &mut Self {
        let ptr = &raw mut *value;
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

hashql_core::id::newtype! {
    struct DeltaRowId<I>(u64)
}

impl<I> DeltaRowId<I> {
    fn derive(origin: Universe<I>, index: I) -> Option<Self>
    where
        I: Id,
    {
        let index = index.as_u64();
        let offset = origin.size();

        index.checked_sub(offset as u64).map(Self::new)
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
enum EntryKind {
    Live,
    Withdrawn,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
struct HistoryEntry {
    kind: EntryKind,
    revision: DeltaRevision,
}

type HistoryBitset = u8;
const HISTORY_SIZE: usize = HistoryBitset::BITS as usize;

struct History {
    revisions: [DeltaRevision; HISTORY_SIZE],
    alive: HistoryBitset,
}

impl History {
    fn new(kind: EntryKind, revision: DeltaRevision) -> Self {
        Self {
            revisions: [revision; HISTORY_SIZE],
            alive: match kind {
                EntryKind::Live => HistoryBitset::MAX,
                EntryKind::Withdrawn => HistoryBitset::MIN,
            },
        }
    }

    fn push(&mut self, kind: EntryKind, revision: DeltaRevision) {
        self.revisions.shift_left([revision]);
        self.alive <<= 1;
        self.alive |= match kind {
            EntryKind::Live => 1,
            EntryKind::Withdrawn => 0,
        };
    }

    fn now(&self) -> EntryKind {
        if self.alive & 1 != 0 {
            EntryKind::Live
        } else {
            EntryKind::Withdrawn
        }
    }

    fn at(&self, revision: DeltaRevision) -> EntryKind {
        if let Some(index) = self
            .revisions
            .iter()
            .rev()
            .position(|&history| history < revision)
        {
            if (self.alive >> index) & 1 != 0 {
                EntryKind::Live
            } else {
                EntryKind::Withdrawn
            }
        } else {
            tracing::warn!("revision not found in history, assuming oldest revision");

            if (self.alive >> (HISTORY_SIZE - 1)) & 1 != 0 {
                EntryKind::Live
            } else {
                EntryKind::Withdrawn
            }
        }
    }
}

struct Versioned<R> {
    data: R,
    history: History,
}

pub(crate) struct IdentityProviderResidual<K, R, P> {
    universe: Universe<R>,

    forward: FastHashMap<K, Versioned<R>>,
    inverse: IdVec<DeltaRowId<R>, Versioned<K>>,
    payload: FastHashMap<K, P>,

    history: FastHashMap<R, History>,
}

impl<K, R, P> IdentityProviderResidual<K, R, P> {
    fn new(base: &impl VersionedIdentityProvider<K, R>) -> Self
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
        DeltaRowId::derive(self.base.universe(), row).map_or_else(
            || {
                if let Some(history) = self.data.history.get(&row)
                    && history.now() == EntryKind::Withdrawn
                {
                    return None;
                }

                self.base.key_of(row)
            },
            |delta| {
                self.data
                    .inverse
                    .get(delta)
                    .filter(|key| key.history.now() == EntryKind::Live)
                    .map(|key| key.data)
            },
        )
    }

    #[inline]
    fn row_of(&self, key: K) -> Option<R> {
        self.data.forward.get(&key).map(|row| row.data).or_else(|| {
            let row = self.base.row_of(key)?;

            if let Some(history) = self.data.history.get(&row)
                && history.now() == EntryKind::Withdrawn
            {
                return None;
            }

            Some(row)
        })
    }

    #[inline]
    fn payload_of_key(&self, key: K) -> Option<&<K as Key>::Payload> {
        self.data.payload.get(&key).map(Borrow::borrow).or_else(|| {
            let row = self.base.row_of(key)?;

            if let Some(history) = self.data.history.get(&row)
                && history.now() == EntryKind::Withdrawn
            {
                return None;
            }

            self.base.payload_of_key(key)
        })
    }

    #[inline]
    fn payload_of_row(&self, row: R) -> Option<&<K as Key>::Payload> {
        self.key_of(row)
            .and_then(|key| self.data.payload.get(&key))
            .map(Borrow::borrow)
            .or_else(|| {
                if let Some(history) = self.data.history.get(&row)
                    && history.now() == EntryKind::Withdrawn
                {
                    return None;
                }

                self.base.payload_of_row(row)
            })
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
        DeltaRowId::derive(self.base.universe(), row).map_or_else(
            || {
                if let Some(history) = self.data.history.get(&row)
                    && history.at(revision) == EntryKind::Withdrawn
                {
                    return None;
                }

                self.base.key_of(row)
            },
            |delta| {
                self.data
                    .inverse
                    .get(delta)
                    .filter(|key| key.history.at(revision) == EntryKind::Live)
                    .map(|key| key.data)
            },
        )
    }

    fn row_of_at(&self, key: K, revision: DeltaRevision) -> Option<R> {
        self.data.forward.get(&key).map(|row| row.data).or_else(|| {
            let row = self.base.row_of(key)?;

            if let Some(history) = self.data.history.get(&row)
                && history.at(revision) == EntryKind::Withdrawn
            {
                return None;
            }

            Some(row)
        })
    }

    fn payload_of_key_at(&self, key: K, revision: DeltaRevision) -> Option<&<K as Key>::Payload> {
        self.data.payload.get(&key).map(Borrow::borrow).or_else(|| {
            let row = self.base.row_of(key)?;

            if let Some(history) = self.data.history.get(&row)
                && history.at(revision) == EntryKind::Withdrawn
            {
                return None;
            }

            self.base.payload_of_key(key)
        })
    }

    fn payload_of_row_at(&self, row: R, revision: DeltaRevision) -> Option<&<K as Key>::Payload> {
        self.key_of(row)
            .and_then(|key| self.data.payload.get(&key))
            .map(Borrow::borrow)
            .or_else(|| {
                if let Some(history) = self.data.history.get(&row)
                    && history.at(revision) == EntryKind::Withdrawn
                {
                    return None;
                }

                self.base.payload_of_row(row)
            })
    }
}
