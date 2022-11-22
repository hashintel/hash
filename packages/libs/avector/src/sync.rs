#[cfg(not(loom))]
pub(crate) use core::sync::atomic::{AtomicUsize, Ordering};

#[cfg(loom)]
pub(crate) use loom::sync::atomic::{AtomicUsize, Ordering};
