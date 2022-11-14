#![no_std]

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
    head: UnsafeCell<Node<T, N>>,
}

impl<T, const N: usize> Default for AppendOnlyVec<T, N> {
    fn default() -> Self {
        Self::new()
    }
}

impl<T, const N: usize> Drop for AppendOnlyVec<T, N> {
    fn drop(&mut self) {
        let length = self.length.load(Ordering::Acquire);
        let (node, offset) = self.indices(length);

        let head = self.head.get_mut();
        unsafe { head.uninit(node, offset) };
    }
}

unsafe impl<T: Send, const N: usize> Send for AppendOnlyVec<T, N> {}
unsafe impl<T: Send + Sync, const N: usize> Sync for AppendOnlyVec<T, N> {}

impl<T, const N: usize> AppendOnlyVec<T, N> {
    pub fn new() -> Self {
        Self {
            length: AtomicUsize::new(0),
            lock: AtomicLock::new(),
            head: UnsafeCell::new(Node::new()),
        }
    }

    fn indices(&self, length: usize) -> (usize, usize) {
        (length / N, length % N)
    }

    pub fn push(&self, value: T) {
        let _guard = self.lock.lock();

        let length = self.length.fetch_add(1, Ordering::Relaxed);
        let (node, offset) = self.indices(length);

        unsafe {
            let head = &mut *self.head.get();

            head.set(node, offset, value);
        }
    }

    pub fn iter(&self) -> Iter<'_, T, N> {
        Iter::new(self)
    }
}

struct Node<T, const N: usize> {
    store: [MaybeUninit<T>; N],

    next: Option<Box<Node<T, N>>>,
}

impl<T, const N: usize> Node<T, N> {
    fn new() -> Self {
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
            self.next = Some(Box::new(Node::new()));
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
    node: &'a Node<T, N>,
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
            // we reached a new node, therefore we need to switch our ptr to it and substract N from
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
            const N: u64 = 3;

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
}
