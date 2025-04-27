pub mod item;

use core::{
    ops::Index,
    sync::atomic::{self, AtomicU32},
};
use std::sync::Mutex;

use orx_concurrent_vec::ConcurrentVec;

// TODO: This might move into the HIR instead, if required
use self::item::Item;
use crate::{heap::Heap, id::Id, newtype, symbol::InternedSymbol};

newtype!(
    pub struct ModuleId(u32 is 0..=0xFFFF_FF00)
);

struct ModuleIdProducer {
    next_id: AtomicU32,
}

impl ModuleIdProducer {
    const fn new() -> Self {
        Self {
            next_id: AtomicU32::new(0),
        }
    }

    fn next(&self) -> ModuleId {
        // Relaxed ordering is sufficient, as this is the only place where interact with the atomic
        // counter and ordering is of no concern.
        ModuleId::new(self.next_id.fetch_add(1, atomic::Ordering::Relaxed))
    }
}

pub struct ModuleRegistry<'heap> {
    heap: &'heap Heap,

    producer: ModuleIdProducer,

    tree: ConcurrentVec<ModuleId>,
}

impl<'heap> ModuleRegistry<'heap> {
    pub fn new(heap: &'heap Heap) -> Self {
        Self {
            heap,
            producer: ModuleIdProducer::new(),
            tree: ConcurrentVec::new(),
        }
    }

    /// Returns the module with the given ID, if it exists.
    ///
    /// # Panics
    ///
    /// This function will panic if the modules mutex is poisoned.
    pub fn get(&self, id: ModuleId) -> Option<&'heap Module<'heap>> {
        self.modules
            .lock()
            .expect("failed to lock modules")
            .get(id.as_usize())
            .copied()
    }

    /// Returns the module with the given ID.
    ///
    /// # Panics
    ///
    /// This function will panic if the modules mutex is poisoned or if the module with the given ID
    /// does not exist.
    pub fn get_by_id(&self, id: ModuleId) -> &'heap Module<'heap> {
        self.modules.lock().expect("failed to lock modules")[id.as_usize()]
    }

    /// Creates a new module using the provided closure and returns a reference to it.
    ///
    /// # Panics
    ///
    /// This function will panic if the modules mutex is poisoned.
    pub fn intern_module(
        &self,
        closure: impl FnOnce(ModuleId) -> Module<'heap>,
    ) -> &'heap Module<'heap> {
        let id = self.producer.next();
        let module = closure(id);

        let module = &*self.heap.alloc(module);

        self.modules
            .lock()
            .expect("failed to lock modules")
            .push(module);

        module
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Module<'heap> {
    pub id: ModuleId,

    pub name: InternedSymbol<'heap>,
    pub items: &'heap [Item<'heap>],
}
