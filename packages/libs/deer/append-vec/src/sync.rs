#[cfg(not(loom))]
pub(crate) use core::{
    hint::spin_loop,
    sync::atomic::{AtomicBool, Ordering},
};

#[cfg(loom)]
pub(crate) use loom::{
    hint::spin_loop,
    sync::atomic::{AtomicBool, Ordering},
};
