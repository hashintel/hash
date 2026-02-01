use alloc::alloc::Global;
use core::{alloc::Allocator, hash::BuildHasher as _};

use foldhash::fast::RandomState;
use hashbrown::{HashTable, hash_table::Entry};

use super::repr::{Repr, RuntimeSymbol};
use crate::heap::BumpAllocator;

#[derive(Debug)]
struct SymbolTable<A: Allocator = Global> {
    inner: HashTable<Repr, A>,
    hasher: RandomState,
}

#[expect(unsafe_code)]
impl<A: Allocator> SymbolTable<A> {
    pub(crate) unsafe fn clear(&mut self) {
        self.inner.clear();
    }

    pub(crate) unsafe fn prime(&mut self) {
        self.inner.reserve(super::sym2::LOOKUP.len(), |_| {
            unreachable!("all entries have been cleared")
        });

        for &(name, value) in super::sym2::LOOKUP {
            let hash = self.hasher.hash_one(name);

            self.inner.insert_unique(hash, value, |_| {
                unreachable!("capacity has been reserved beforehand")
            });
        }
    }

    pub(crate) unsafe fn reset(&mut self) {
        unsafe {
            self.clear();
            self.prime();
        }
    }

    pub(crate) unsafe fn intern<B: BumpAllocator>(&mut self, alloc: &B, value: &str) -> Repr {
        let hash = self.hasher.hash_one(value);

        // We hash against the string, therefore we must pull out the string representation, instead
        // of hashing against the Repr directly, as that would lead to incorrect results.
        // We're mapping string -> repr. But the string representation is already stored in the
        // Repr.
        match self.inner.entry(
            hash,
            |repr| unsafe { repr.as_str() } == value,
            |repr| self.hasher.hash_one(unsafe { repr.as_str() }),
        ) {
            Entry::Occupied(entry) => *entry.get(),
            Entry::Vacant(entry) => {
                let repr = Repr::runtime(RuntimeSymbol::alloc(alloc, value));
                *entry.insert(repr).get()
            }
        }
    }
}
