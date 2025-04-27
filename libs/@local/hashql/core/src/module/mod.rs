// TODO: This might move into the HIR instead, if required
pub mod item;

use core::sync::atomic::{self, AtomicU32};
use std::sync::Mutex;

use self::item::Item;
use crate::{heap::Heap, newtype, symbol::InternedSymbol};

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

    tree: Mutex<Vec<&'heap Module<'heap>>>,
}

impl<'heap> ModuleRegistry<'heap> {
    pub const fn new(heap: &'heap Heap) -> Self {
        Self {
            heap,
            producer: ModuleIdProducer::new(),
            tree: Mutex::new(Vec::new()),
        }
    }

    pub fn alloc_module(
        &self,
        closure: impl FnOnce(ModuleId) -> Module<'heap>,
    ) -> &'heap Module<'heap> {
        let id = self.producer.next();
        let module = closure(id);

        self.heap.alloc(module)
    }

    pub fn alloc_items(&self, items: &[Item<'heap>]) -> &'heap [Item<'heap>] {
        self.heap.slice(items)
    }

    #[inline]
    fn lock_tree<T>(&self, closure: impl FnOnce(&mut Vec<&'heap Module<'heap>>) -> T) -> T {
        closure(&mut self.tree.lock().expect("lock should not be poisoned"))
    }

    pub fn register_module(&self, module: &'heap Module<'heap>) {
        self.lock_tree(|modules| modules.push(module));
    }

    pub fn find_by_name(&self, name: &str) -> Option<&'heap Module<'heap>> {
        self.lock_tree(|modules| modules.iter().find(|module| module.name == *name).copied())
    }

    pub fn find_by_id(&self, id: ModuleId) -> Option<&'heap Module<'heap>> {
        self.lock_tree(|modules| modules.iter().find(|module| module.id == id).copied())
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Module<'heap> {
    pub id: ModuleId,

    pub name: InternedSymbol<'heap>,
    pub items: &'heap [Item<'heap>],
}
