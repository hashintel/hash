//! Provides structures and methods to work with shared memory.
//!
//! This module mainly provides [`Segment`], which holds a shared-memory segment. See it's
//! documentation for further information. [`MemoryId`] is used to identify a [`Segment`] using a
//! UUID and a random number appended to it.
//!
//! Also, this module provides an FFI interface containing `CSegment` as `Segment` representation
//! and the `load_shmem` and `free_memory` functions.

pub mod padding;

mod buffer_change;
mod continuation;
mod ffi;
mod markers;
mod metaversion;
mod ptr;
mod segment;
// reason: will be removed in a follow-up task
#[allow(clippy::module_inception)]
mod shared_memory;
mod visitor;

pub(in crate) use self::ffi::CMemory;
pub use self::{
    buffer_change::BufferChange,
    continuation::arrow_continuation,
    metaversion::Metaversion,
    segment::Segment,
    shared_memory::{Memory, MemoryId},
};
