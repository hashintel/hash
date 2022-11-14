#[cfg(not(loom))]
pub(crate) use alloc::alloc::alloc;
#[cfg(not(loom))]
pub(crate) use core::{
    alloc::Layout,
    hint::spin_loop,
    sync::atomic::{AtomicBool, AtomicUsize, Ordering},
};

#[cfg(loom)]
pub(crate) use loom::{
    alloc::{alloc, Layout},
    hint::spin_loop,
    sync::atomic::{AtomicBool, AtomicUsize, Ordering},
};
