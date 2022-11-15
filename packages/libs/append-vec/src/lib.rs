//! Concurrent Read Optimized Vector
//!
//! Vector which allows concurrent read access, simultaneous to writing.
//! The vector can only be manipulated through pushing of items, once an item is pushed it can no
//! longer be accessed mutably.
//!
//! While reading is concurrent and can happen while values are being written,
//! values can only be written synchronously and are guarded by a spinlock.
//! This means that [`AppendOnlyVec`] works best when contention is low and values are mostly being
//! read.
//!
//! ## How it works
//!
//! [`AppendOnlyVec`] is based on two parts: length (through an atomic) and an intrusive list of
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
    clippy::missing_safety_doc
)]
// TODO: once more stable introduce: warning missing_docs, clippy::missing_errors_doc
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

pub struct AppendOnlyVec<T, const N: usize = 16> {
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
    //
    // In theory items could be modified through interior mutability, but that is the case with
    // "normal" Iterators too.
    head: UnsafeCell<Bucket<T, N>>,
}

impl<T, const N: usize> Default for AppendOnlyVec<T, N> {
    fn default() -> Self {
        Self::new()
    }
}

impl<T, const N: usize> Drop for AppendOnlyVec<T, N> {
    fn drop(&mut self) {
        let length = self.length.load(Ordering::Acquire);
        let (node, offset) = Self::indices(length);

        let head = self.head.get_mut();
        unsafe { head.uninit(node, offset) };
    }
}

unsafe impl<T: Send, const N: usize> Send for AppendOnlyVec<T, N> {}
unsafe impl<T: Send + Sync, const N: usize> Sync for AppendOnlyVec<T, N> {}

impl<T, const N: usize> AppendOnlyVec<T, N> {
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

    pub fn push(&self, value: T) {
        let _guard = self.lock.lock();

        // We need to use `Acquire` as this is paired with the `fetch_add` at the end, it ensures
        // that the atomic is the same across all threads.
        // We *might* be able to relax this requirement.
        // TODO: note(bmahmoud): @td - do you think we can relax the ordering here?
        let length = self.length.load(Ordering::Acquire);
        let (node, offset) = Self::indices(length);

        unsafe {
            let head = &mut *self.head.get();

            head.set(node, offset, value);
        }

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
            // this is the same as MaybeUninit::uninit_array()
            store: unsafe { MaybeUninit::<[MaybeUninit<T>; N]>::uninit().assume_init() },
            next: None,
        }
    }

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

    // SAFETY: The following invariants must be upheld:
    // 1) keys are only set sequentially
    // 2) offset < N
    unsafe fn set(&mut self, node: usize, offset: usize, value: T) {
        if node == 1 && offset == 0 {
            // the next node is empty, and therefore needs to be allocated before we can use it
            self.next = Some(Box::new(Bucket::new()));
        }

        if node == 0 {
            // we need to set our specific entry
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
    fn new(vec: &'a AppendOnlyVec<T, N>) -> Self {
        Self {
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

            self.node = unsafe { self.node.next.as_ref().unwrap_unchecked() };
        }

        let item = unsafe { self.node.store[self.offset].assume_init_ref() };
        self.offset += 1;

        Some(item)
    }
}

#[cfg(test)]
mod tests {
    use alloc::{sync::Arc, vec, vec::Vec};

    use super::AppendOnlyVec;

    #[test]
    fn push_single() {
        let vec = AppendOnlyVec::<u8, 4>::new();
        vec.push(1);

        let vec: Vec<_> = vec.iter().copied().collect();
        assert_eq!(vec, vec![1]);
    }

    #[test]
    fn push_many() {
        let vec = AppendOnlyVec::<u8, 4>::new();
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
            let v = Arc::new(AppendOnlyVec::<u64>::new());

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
            let v = Arc::new(AppendOnlyVec::<u64, 1>::new());

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
    fn push_iter_loom() {
        loom::model(|| {
            let v = Arc::new(AppendOnlyVec::<usize>::new());
            let mut threads = Vec::new();

            const N: usize = 4;

            let v1 = Arc::clone(&v);
            threads.push(loom::thread::spawn(move || {
                for i in 0..N {
                    v1.push(i);
                }
            }));

            let v1 = Arc::clone(&v);
            threads.push(loom::thread::spawn(move || {
                for _ in 0..N {
                    let _items: Vec<_> = v1.iter().copied().collect();
                }
            }));

            for t in threads {
                t.join().expect("all threads could join")
            }

            assert_eq!(N, v.iter().count());
        })
    }
}
