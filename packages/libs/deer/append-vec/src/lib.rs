#![no_std]

extern crate alloc;

use alloc::boxed::Box;
use core::mem::{ManuallyDrop, MaybeUninit};

use crate::{
    lock::AtomicLock,
    sync::{alloc, AtomicBool, AtomicUsize, Layout, Ordering, UnsafeCell},
};

mod lock;
pub(crate) mod sync;

pub struct AppendOnlyVec<T, const N: usize = 16> {
    length: AtomicUsize,
    lock: AtomicLock,

    head: UnsafeCell<Node<T, N>>,
}

impl<T, const N: usize> Drop for AppendOnlyVec<T, N> {
    fn drop(&mut self) {
        let head = self.head.get_mut();
        unsafe { head.uninit() };
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

    has_next: AtomicBool,
    next: ManuallyDrop<Box<MaybeUninit<Node<T, N>>>>,
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
            next: ManuallyDrop::new(uninit_box()),
            has_next: AtomicBool::new(false),
        }
    }

    unsafe fn uninit(&mut self) {
        if self.has_next.load(Ordering::Relaxed) {
            self.next.assume_init_mut().uninit();
        }

        ManuallyDrop::drop(&mut self.next)
    }

    // SAFETY: The following invariants must be upheld:
    // 1) keys are only set sequentially
    // 2) offset < N
    unsafe fn set(&mut self, node: usize, offset: usize, value: T) {
        if node == 1 && offset == 0 {
            // the next node is empty, and therefore needs to be allocated before we can use it
            self.next.write(Node::new());
            self.has_next.store(true, Ordering::Relaxed);
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
}
