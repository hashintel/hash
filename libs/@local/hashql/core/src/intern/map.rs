use core::{
    hash::Hash,
    hint::cold_path,
    sync::atomic::{AtomicU32, Ordering},
};

use super::Interned;
use crate::{
    collection::ConcurrentHashMap,
    heap::Heap,
    id::{HasId, Id},
};

pub trait Decompose<'heap>: HasId {
    type Partial;

    fn from_parts(id: Self::Id, partial: Interned<'heap, Self::Partial>) -> Self;
}

// An ID that has been provisioned, due note that this ID has not yet been interned, but has been
// allocated a unique identifier. The returned value from `intern` may have a different ID than the
// one provided, if the type is already interned. This is acceptable, as e.g. recursive types won't
// will automatically use the provisioned id and therefore create a new type, which then trickles up
// to create the type using the new id.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Provisioned<T>(T);

impl<T> Provisioned<T>
where
    T: Id,
{
    pub const fn value(self) -> T {
        self.0
    }
}

#[derive(derive_more::Debug)]
#[debug(bound(T::Partial: Eq))]
pub struct InternMap<'heap, T: Decompose<'heap>> {
    heap: &'heap Heap,

    // For more information about the tradeoff and decision on the use of `ConcurrentHashMap`, see
    // the documentation on `InternSet`.
    inner: ConcurrentHashMap<&'heap T::Partial, T::Id>,

    // In theory, this isn't as efficient as it could be, but it makes the implementation simpler.
    // What we could do instead is have e.g. an atomic counter with the current maximum
    // id provisioned and a roaring bitmap of ids that are currently free, then when we provision a
    // new id, we can check if there are any free ids available and use them instead.
    // We could then pair this with a `Vec` (or `ConcurrentVec`) and then efficiently manage the
    // forward map with `O(1)` access. The problem with this approach is that it is simply just
    // more complex, for a performance gain we haven't even benchmarked yet.
    lookup: ConcurrentHashMap<T::Id, &'heap T::Partial>,

    next: AtomicU32,
}

impl<'heap, T> InternMap<'heap, T>
where
    T: Decompose<'heap>,
{
    pub fn new(heap: &'heap Heap) -> Self {
        Self {
            heap,
            inner: ConcurrentHashMap::default(),

            lookup: ConcurrentHashMap::default(),

            next: AtomicU32::new(0),
        }
    }

    fn next_id(&self) -> T::Id {
        // Relaxed ordering is sufficient for this use case as this is the only place where the
        // atomic is accessed and no ordering constraints are required.
        let id = self.next.fetch_add(1, Ordering::Relaxed);

        T::Id::from_u32(id)
    }
}

impl<'heap, T> InternMap<'heap, T>
where
    T: Decompose<'heap, Partial: Eq + Hash>,
{
    fn insert(&self, id: T::Id, partial: &'heap T::Partial) -> Interned<'heap, T::Partial> {
        // When this is called, we expect that the partial is unique and hasn't been inserted
        // before.
        let interned = if self.inner.insert(partial, id) == Ok(()) {
            Interned::new_unchecked(partial)
        } else {
            // Due to the fact that this is essentially single-threaded, the concurrent insertion is
            // unlikely to *ever* occur.
            cold_path();

            tracing::debug!(%id, "concurrent insertion detected, using existing partial");

            // We never remove so we know this is going to work
            let partial = self
                .inner
                .read(partial, |&key, _| key)
                .unwrap_or_else(|| unreachable!());

            Interned::new_unchecked(partial)
        };

        // Result indicated that a value of the same key already exists
        if let Err((key, _)) = self.lookup.insert(id, partial) {
            tracing::warn!(
                %key,
                "Attempted to insert a duplicate key into the intern map"
            );
        }

        interned
    }

    fn intern_value(&self, id: Option<T::Id>, partial: T::Partial) -> T {
        const {
            assert!(
                !core::mem::needs_drop::<T::Partial>(),
                "Cannot intern a type that needs drop"
            );
        };
        const {
            assert!(
                core::mem::size_of::<T::Partial>() != 0,
                "Cannot intern a zero-sized type"
            );
        };

        if let Some((id, partial)) = self.inner.read(&partial, |&partial, &id| (id, partial)) {
            T::from_parts(id, Interned::new_unchecked(partial))
        } else {
            let id = id.unwrap_or_else(|| self.next_id());

            let partial = self.heap.alloc(partial);
            let partial = self.insert(id, partial);

            T::from_parts(id, partial)
        }
    }

    pub fn intern_partial(&self, partial: T::Partial) -> T {
        self.intern_value(None, partial)
    }

    pub fn provision(&self) -> Provisioned<T::Id> {
        Provisioned(self.next_id())
    }

    pub fn intern_provisioned(&self, id: Provisioned<T::Id>, partial: T::Partial) -> T {
        self.intern_value(Some(id.0), partial)
    }

    pub fn intern(&self, closure: impl FnOnce(Provisioned<T::Id>) -> T::Partial) -> T {
        let id = self.provision();
        let partial = closure(id);

        self.intern_provisioned(id, partial)
    }

    pub fn get(&self, id: T::Id) -> Option<T> {
        let partial = self.lookup.read(&id, |_, &partial| partial)?;

        Some(T::from_parts(id, Interned::new_unchecked(partial)))
    }

    /// Returns the interned value for the given id
    ///
    /// # Panics
    ///
    /// Panics if no item with the given id exists
    pub fn index(&self, id: T::Id) -> T {
        let partial = self
            .lookup
            .read(&id, |_, &partial| partial)
            .expect("id should exist in map");

        T::from_parts(id, Interned::new_unchecked(partial))
    }
}
