#![no_std]

extern crate alloc;

use alloc::{alloc::alloc, boxed::Box};
use core::{
    alloc::Layout,
    array,
    cell::UnsafeCell,
    marker::PhantomData,
    mem::MaybeUninit,
    sync::atomic::{AtomicUsize, Ordering},
};

use crate::lock::AtomicLock;

mod lock;
pub(crate) mod sync;

pub struct AppendOnlyVec<T, const N: usize> {
    length: AtomicUsize,
    lock: AtomicLock,

    head: UnsafeCell<Node<T, N>>,
}

impl<T, const N: usize> AppendOnlyVec<T, N> {
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

    next: Box<MaybeUninit<Node<T, N>>>,
}

fn uninit_box<T>() -> Box<MaybeUninit<T>> {
    let layout = Layout::new::<MaybeUninit<T>>();

    unsafe {
        let ptr = alloc(layout) as *mut MaybeUninit<T>;

        Box::from_raw(ptr)
    }
}

impl<T, const N: usize> Node<T, N> {
    fn new() -> Self {
        Self {
            // this is the same as MaybeUninit::uninit_array()
            store: unsafe { MaybeUninit::<[MaybeUninit<T>; N]>::uninit().assume_init() },
            // this is the same as Box::new_uninit()
            next: uninit_box(),
        }
    }

    // SAFETY: The following invariants must be upheld:
    // 1) keys are only set sequentially
    // 2) offset < N
    unsafe fn set(&mut self, node: usize, offset: usize, value: T) {
        if node == 1 && offset == 0 {
            // the next node is empty, and therefore needs to be allocated before we can use it
            self.next.write(Node::new());
        }

        if node == 0 {
            // we need to set our specific entry
            let entry = &mut self.store[offset];
            entry.write(value);
        } else {
            // the invariants ensure that the next node **always** exists, and the previous
            // statement will allocate a new node if necessary, therefore this recursion into the
            // next node is "safe"
            self.next.assume_init_mut().set(node - 1, offset, value);
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

            self.node = unsafe { self.node.next.assume_init_ref() };
        }

        let item = unsafe { self.node.store[self.offset].assume_init_ref() };
        self.offset += 1;

        Some(item)
    }
}
