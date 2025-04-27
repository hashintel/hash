use core::{
    hash::Hash,
    sync::atomic::{AtomicU32, Ordering},
};

use super::{InternSet, Interned};
use crate::{
    collection::ConcurrentHashMap,
    heap::Heap,
    id::{HasId, Id as _},
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
    T: Copy,
{
    pub fn value(self) -> T {
        self.0
    }
}

#[derive(derive_more::Debug)]
#[debug(bound(T::Partial: Eq))]
pub struct InternMap<'heap, T: Decompose<'heap>> {
    inner: InternSet<'heap, T::Partial>,

    forward: ConcurrentHashMap<T::Id, Interned<'heap, T::Partial>>,
    reverse: ConcurrentHashMap<Interned<'heap, T::Partial>, T::Id>,

    next: AtomicU32,
}

impl<'heap, T> InternMap<'heap, T>
where
    T: Decompose<'heap>,
{
    pub fn new(heap: &'heap Heap) -> Self {
        Self {
            inner: InternSet::new(heap),

            forward: ConcurrentHashMap::default(),
            reverse: ConcurrentHashMap::default(),

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
    pub fn insert(&self, id: T::Id, partial: Interned<'heap, T::Partial>) {
        let _ = self.forward.insert(id, partial);
        let _ = self.reverse.insert(partial, id);
    }

    pub fn intern_partial(&self, partial: T::Partial) -> T {
        let partial = self.inner.intern(partial);

        // Check if the partial is already interned
        if let Some((id, partial)) = self.reverse.read(&partial, |&partial, &id| (id, partial)) {
            T::from_parts(id, partial)
        } else {
            let id = self.next_id();
            self.insert(id, partial);

            T::from_parts(id, partial)
        }
    }

    pub fn provision(&self) -> Provisioned<T::Id> {
        Provisioned(self.next_id())
    }

    pub fn intern_provisioned(&self, id: Provisioned<T::Id>, partial: T::Partial) -> T {
        let id = id.0;
        let partial = self.inner.intern(partial);

        // we first check if that partial is already interned, if not we take our new id and insert
        // it into the map
        if let Some((id, partial)) = self.reverse.read(&partial, |&partial, &id| (id, partial)) {
            T::from_parts(id, partial)
        } else {
            self.insert(id, partial);

            T::from_parts(id, partial)
        }
    }

    pub fn intern(&self, closure: impl Fn(Provisioned<T::Id>) -> T::Partial) -> T {
        let id = self.provision();
        let partial = closure(id);

        self.intern_provisioned(id, partial)
    }

    pub fn get(&self, id: T::Id) -> Option<T> {
        let partial = self.forward.read(&id, |_, &partial| partial)?;

        Some(T::from_parts(id, partial))
    }

    pub fn index(&self, id: T::Id) -> T {
        let partial = self
            .forward
            .read(&id, |_, &partial| partial)
            .expect("id should exist in map");

        T::from_parts(id, partial)
    }
}
