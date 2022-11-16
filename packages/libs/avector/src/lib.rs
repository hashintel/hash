//! Concurrent Read Optimized Vector
//!
//! Vector which allows concurrent read access, simultaneous to writing.
//! The vector can only be manipulated through pushing of items, once an item is pushed it can no
//! longer be accessed mutably.
//!
//! While reading is concurrent and can happen while values are being written,
//! values can only be written synchronously and are guarded by a spinlock.
//! This means that [`AVec`] works best when contention is low and values are mostly being
//! read.
//!
//! ## How it works
//!
//! [`AVec`] is based on two parts: length (through an atomic) and an intrusive list of
//! arrays which store items.
//! The size of a bucket can be controlled through the const generic `N`, allowing one to tradeoff
//! speed vs. allocated space.
//!
//! The inner workings are best explained through a demonstration:
//!
//! ```text
//! Step 1:
//!     Vec<u8, 4>: [_, _, _, _]
//!     A: Acquire Lock
//!     B: Read, Length: 0
//!
//! Step 2:
//!     Vec<u8, 4>: [_, _, _, _]
//!     A: Load Length (0)
//!     B: .next(): None
//!
//! Step 3:
//!     Vec<u8, 4>: [1, _, _, _]
//!     A: Push Value
//!     B: Read, Length: 0
//!
//! Step 4:
//!     Vec<u8, 4>: [1, _, _, _]
//!     A: Store Length + 1
//!     B: .next(): None
//!
//! Step 5:
//!     Vec<u8, 4>: [1, _, _, _]
//!     B: .iter(), Length: 1
//! ```
//!
//! As one can see, the length is only changed, once the push is done, this means that even though
//! we mutate and read the array at the same time we can guarantee, that never an uninitialized
//! **or** write on the same address, entry will take place.
//! Only once we can guarantee that writing to an entry has been done, and will never take place we
//! will increment the length.
//!
//! Once a bucket has filled up, the vec will allocate a new bucket on the heap and use that,
//! creating a linked list (into one direction).
//! This means that every `N`th insertion will be slightly slower, as an allocation needs to be
//! performed.
#![no_std]
#![warn(
    unreachable_pub,
    clippy::pedantic,
    clippy::nursery,
    clippy::undocumented_unsafe_blocks
)]
// TODO: once more stable introduce: warning missing_docs
#![allow(clippy::module_name_repetitions)]
#![allow(clippy::redundant_pub_crate)]

extern crate alloc;

use alloc::boxed::Box;
use core::{cell::UnsafeCell, mem::MaybeUninit, ptr};

use crate::{
    lock::AtomicLock,
    sync::{AtomicUsize, Ordering},
};

mod lock;
pub(crate) mod sync;

// note(bm): [PERFORMANCE] increase from 16 to 64
//  push (single/multi): ~10%-40%
//  iter (singe/multi): ~10%
pub struct AVec<T, const N: usize = 16> {
    length: AtomicUsize,
    lock: AtomicLock,

    // SAFETY: This `UnsafeCell` is not checked by loom, this might seem counterintuitive, but
    // there's a reason for this.
    //
    // The `UnsafeCell` can be accessed mutably and by reference at the same, this is okay, because
    // the only way to get contents is over `Iter` and `push()`, `push()` ensures through an
    // `AtomicLock`, that there is only ever a single mutable access at the same time and items
    // will only be modified at the end. `Iter` meanwhile takes a snapshot of the current length
    // (stored in an AtomicUsize) and then iterates through all items. `length` will never
    // decrement, and there is no way that items once pushed can be modified or are ever touched.
    // The length is only incremented once the push has completed, meaning that the pushed item
    // will not be accessed until `push()` has finished.
    //
    // In theory items could be modified through interior mutability, but that is the case with
    // "normal" Iterators too.
    head: UnsafeCell<Bucket<T, N>>,
}

impl<T, const N: usize> Default for AVec<T, N> {
    fn default() -> Self {
        Self::new()
    }
}

impl<T, const N: usize> Drop for AVec<T, N> {
    fn drop(&mut self) {
        let length = self.length.load(Ordering::Acquire);
        let (node, offset) = Self::indices(length);

        let head = self.head.get_mut();

        // SAFETY:
        // * `drop()` means that no one will access the value anymore
        // * node and offset are correctly computed from `Self::indices`
        unsafe { head.uninit(node, offset) };
    }
}

// SAFETY: We use `UnsafeCell`, the referred `Bucket` is `Send` if `T` is `Send`
unsafe impl<T: Send, const N: usize> Send for AVec<T, N> {}

// SAFETY: We use `UnsafeCell`, the referred `Bucket` is `Sync` if `T` is `Sync`
unsafe impl<T: Sync, const N: usize> Sync for AVec<T, N> {}

impl<T, const N: usize> AVec<T, N> {
    #[cfg(not(loom))]
    #[must_use]
    pub const fn new() -> Self {
        Self {
            length: AtomicUsize::new(0),
            lock: AtomicLock::new(),
            head: UnsafeCell::new(Bucket::new()),
        }
    }

    #[cfg(loom)]
    pub fn new() -> Self {
        Self {
            length: AtomicUsize::new(0),
            lock: AtomicLock::new(),
            head: UnsafeCell::new(Bucket::new()),
        }
    }

    const fn indices(length: usize) -> (usize, usize) {
        (length / N, length % N)
    }

    // note(bm):
    //  there's a potential concurrent writing method implementation possible,
    //  which uses 3 atomics instead:
    //      * open <- currently active pushes
    //      * length <- currently visible length
    //      * actual <- actual length
    //  on every bucket: `AtomicBool`/`AtomicU8`: `next_init`
    //      (this could potentially be replaced with another `AtomicUsize` on `AVec`,
    //       because allocation is linear, this would be more complex)
    //
    //  1) whenever a process enters `push()` he increments `open` (AcqRel).
    //  2) he immediately `fetch_add` `actual` (AcqRel), and calls set with the returned value
    //  3) once the push has been done, decrement `open` (AcqRel), if the value of `open` is `0`
    //     flush
    //  4) flush: store the value of `actual` in `length`
    //
    //  On a bucket boundary we would need to check `next_init` (or something similar), if the value
    //  already exists, only then we can proceed and would need to spin lock until then (or CondVar
    //  on std?)
    //
    // ^ What is outlined above is complete theory, should be taken with a grain of salt and might
    //   be experimented upon in a future release/PR.
    pub fn push(&self, value: T) {
        let _guard = self.lock.lock();

        // We need to use `Acquire` as this is paired with the `fetch_add` at the end, it ensures
        // that the atomic is the same across all threads.
        // We *might* be able to relax this requirement.
        // TODO: note(bm): @td - do you think we can relax the ordering here?
        // note(bm): [PERFORMANCE]
        //  switching from Ordering::Acquired to Ordering::Relaxed brought a
        //  performance boost of ~10%-30% in single threaded workloads, while there was no obvious
        //  change in multi-threaded workloads.
        let length = self.length.load(Ordering::Acquire);
        let (node, offset) = Self::indices(length);

        // SAFETY: Lock has been acquired, therefore, we're the only mutable access, but(!) at the
        // same time read access is possible, but these are only able to access elements not mutably
        // modified by this function.
        let head = unsafe { &mut *self.head.get() };

        // SAFETY: node, offset are guaranteed to be the next item as the next index is length, and
        // the value originates from `Self::indices`.
        unsafe { head.set(node, offset, value) };

        // we need to do this once we're done, otherwise there is a possibility that while pushing,
        // another thread would access the memory that we're currently working on
        self.length.store(length + 1, Ordering::Release);
    }

    pub fn iter(&self) -> Iter<'_, T, N> {
        Iter::new(self)
    }
}

struct Bucket<T, const N: usize> {
    store: [MaybeUninit<T>; N],

    next: Option<Box<Bucket<T, N>>>,
}

impl<T, const N: usize> Bucket<T, N> {
    const fn new() -> Self {
        Self {
            // SAFETY:
            // * this is the same as MaybeUninit::uninit_array()
            // * items will be initialized via `set()` from the vec
            store: unsafe { MaybeUninit::<[MaybeUninit<T>; N]>::uninit().assume_init() },
            next: None,
        }
    }

    /// # Safety
    ///
    /// If this function is not recursively called, the caller **must** verify that the node and
    /// offset, which can be created through [`AVec::indices`] are correct.
    ///
    /// This function expects to be called on the `head` property with the appropriate length
    /// supplied.
    ///
    /// Once called all items in this struct will be dropped and cannot be accessed, meaning that
    /// subsequent operations on them will act upon dropped memory!
    ///
    /// Do **not** use this value once this function has been called!
    unsafe fn uninit(&mut self, node: usize, offset: usize) {
        let length = if node == 0 { offset } else { N };

        for item in &mut self.store[..length] {
            ptr::drop_in_place(item);
        }

        if node != 0 {
            if let Some(next) = &mut self.next {
                next.uninit(node - 1, offset);
            }
        }
    }

    /// # Safety
    ///
    /// `set` can only be called sequentially, if a new node is allocated all previous nodes need to
    /// allocated before via `set` calls.
    ///
    /// `set` cannot be called twice with the same combination of `node` and `offset`.
    ///
    /// The `offset` must be smaller than `N`
    ///
    /// ## Do
    ///
    /// ```text
    /// (N = 2)
    /// set(0, 0);
    /// set(0, 1);
    /// set(1, 0);
    /// set(1, 1);
    /// ```
    ///
    /// ## Don't
    ///
    /// ```text
    /// (N = 2)
    /// set(0, 0);
    /// set(0, 0); // ERROR: repeated call
    /// set(1, 0); // ERROR: not sequential, will allocate new Bucket
    /// set(2, 1); // ERROR: not sequential, will *NOT* allocate new Bucket
    /// ```
    unsafe fn set(&mut self, node: usize, offset: usize, value: T) {
        if node == 1 && offset == 0 {
            // the next node is empty, and therefore needs to be allocated before we can use it
            self.next = Some(Box::new(Self::new()));
        }

        if node == 0 {
            // We're the requested node, therefore set the next item, the invariants guarantee that
            // the array will be sequentially initialized.
            let entry = &mut self.store[offset];
            entry.write(value);
        } else {
            // the invariants ensure that the next node **always** exists, and the previous
            // statement will allocate a new node if necessary, therefore this recursion into the
            // next node is "safe"
            self.next
                .as_mut()
                .unwrap_unchecked()
                .set(node - 1, offset, value);
        }
    }
}

pub struct Iter<'a, T, const N: usize> {
    node: &'a Bucket<T, N>,
    length: usize,
    offset: usize,
}

impl<'a, T, const N: usize> Iter<'a, T, N> {
    fn new(vec: &'a AVec<T, N>) -> Self {
        Self {
            // SAFETY: The vec guarantees that items are never mutably accessed and read, therefore
            // it is safe to get a reference without lock.
            node: unsafe { &*vec.head.get() },
            length: vec.length.load(Ordering::Relaxed),
            offset: 0,
        }
    }
}

impl<'a, T, const N: usize> Iterator for Iter<'a, T, N> {
    type Item = &'a T;

    fn next(&mut self) -> Option<Self::Item> {
        if self.offset >= self.length {
            return None;
        }

        if self.offset == N {
            // we reached a new node, therefore we need to switch our ptr to it and subtract N from
            // the length and offset
            self.offset -= N;
            self.length -= N;

            // SAFETY: length only increments and vec guarantees that all buckets exist
            self.node = unsafe { self.node.next.as_ref().unwrap_unchecked() };
        }

        // SAFETY: vec guarantees that all elements are initialized within length
        let item = unsafe { self.node.store[self.offset].assume_init_ref() };
        self.offset += 1;

        Some(item)
    }
}

#[cfg(test)]
mod tests {
    use alloc::{vec, vec::Vec};

    use super::AVec;

    #[test]
    #[cfg(not(loom))]
    fn push_single() {
        let vec = AVec::<u8, 4>::new();
        vec.push(1);

        let vec: Vec<_> = vec.iter().copied().collect();
        assert_eq!(vec, vec![1]);
    }

    #[test]
    #[cfg(not(loom))]
    fn push_many() {
        let vec = AVec::<u8, 4>::new();
        let range = u8::MIN..u8::MAX;

        for i in range.clone() {
            vec.push(i);
        }

        let vec: Vec<_> = vec.iter().copied().collect();
        assert_eq!(vec, range.collect::<Vec<_>>());
    }

    #[test]
    #[cfg(loom)]
    fn push_loom() {
        loom::model(|| {
            let v = loom::sync::Arc::new(AVec::<u64>::new());

            let mut threads = Vec::new();
            const N: u64 = 2;

            for thread_num in 0..N {
                let v = v.clone();

                threads.push(loom::thread::spawn(move || {
                    v.push(thread_num);
                    v.push(thread_num);
                }));
            }

            for t in threads {
                t.join().expect("all threads could join")
            }

            for thread_num in 0..N {
                assert_eq!(2, v.iter().copied().filter(|&x| x == thread_num).count());
            }
        })
    }

    // about the same code, but forces the creation of a new node on every single element
    #[test]
    #[cfg(loom)]
    fn push_many_loom() {
        loom::model(|| {
            let v = loom::sync::Arc::new(AVec::<u64, 1>::new());

            let mut threads = Vec::new();
            const N: u64 = 2;

            for thread_num in 0..N {
                let v = v.clone();

                threads.push(loom::thread::spawn(move || {
                    v.push(thread_num);
                    v.push(thread_num);
                }));
            }

            for t in threads {
                t.join().expect("all threads could join")
            }

            for thread_num in 0..N {
                assert_eq!(2, v.iter().copied().filter(|&x| x == thread_num).count());
            }
        })
    }

    #[test]
    #[cfg(loom)]
    fn push_iter_loom() {
        loom::model(|| {
            let v = loom::sync::Arc::new(AVec::<usize>::new());
            let mut threads = Vec::new();

            const N: usize = 4;

            let v1 = loom::sync::Arc::clone(&v);
            threads.push(loom::thread::spawn(move || {
                for i in 0..N {
                    v1.push(i);
                }
            }));

            let v1 = loom::sync::Arc::clone(&v);
            threads.push(loom::thread::spawn(move || {
                for _ in 0..N {
                    core::hint::black_box(|| {
                        let _items: Vec<_> = v1.iter().copied().collect();
                    })();
                }
            }));

            for t in threads {
                t.join().expect("all threads could join")
            }

            assert_eq!(N, v.iter().count());
        })
    }
}
