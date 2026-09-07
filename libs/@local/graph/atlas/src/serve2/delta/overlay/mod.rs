use core::{borrow::Borrow, hash::Hash};

use hashql_core::{
    collections::FastHashMap,
    id::{Id, IdVec},
};

use crate::{
    file::identity::{Key, Row},
    salt::fit::prepare::IdentityProvider,
    serve2::codec::Universe,
};

#[cfg(test)]
mod tests;

trait UniverseIdentityProvider<K, R>: IdentityProvider<K, R>
where
    R: Row,
    K: Key,
{
    fn universe(&self) -> Universe<R>;
}

impl<K, R, T: IdentityProvider<K, R> + ?Sized> UniverseIdentityProvider<K, R> for T
where
    R: Row,
    K: Key,
{
    fn universe(&self) -> Universe<R> {
        Universe::from_length(self.count())
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

pub(crate) struct IdentityProviderResidual<K, R, P> {
    universe: Universe<R>,

    forward: FastHashMap<K, R>,
    inverse: IdVec<DeltaRowId<R>, K>,
    payload: FastHashMap<K, P>,
}

impl<K, R, P> IdentityProviderResidual<K, R, P> {
    fn new(base: impl UniverseIdentityProvider<K, R>) -> Self
    where
        K: Key<Payload: ToOwned<Owned = P>>,
        R: Row,
    {
        Self {
            universe: base.universe(),
            forward: FastHashMap::default(),
            inverse: IdVec::default(),
            payload: FastHashMap::default(),
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
    B: IdentityProvider<K, R>,
{
    #[inline]
    fn count(&self) -> usize {
        self.data.universe.size()
    }

    #[inline]
    fn key_of(&self, row: R) -> Option<K> {
        DeltaRowId::derive(self.base.universe(), row).map_or_else(
            || self.base.key_of(row),
            |delta| self.data.inverse.get(delta).copied(),
        )
    }

    #[inline]
    fn row_of(&self, key: K) -> Option<R> {
        self.data
            .forward
            .get(&key)
            .copied()
            .or_else(|| self.base.row_of(key))
    }

    #[inline]
    fn payload_of_key(&self, key: K) -> Option<&<K as Key>::Payload> {
        self.data
            .payload
            .get(&key)
            .map(Borrow::borrow)
            .or_else(|| self.base.payload_of_key(key))
    }

    #[inline]
    fn payload_of_row(&self, row: R) -> Option<&<K as Key>::Payload> {
        self.key_of(row)
            .and_then(|key| self.data.payload.get(&key))
            .map(Borrow::borrow)
            .or_else(|| self.base.payload_of_row(row))
    }
}
