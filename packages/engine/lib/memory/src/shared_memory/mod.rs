//! Provides structures and methods to work with shared memory.
//!
//! This module mainly provides [`Segment`], which holds a shared-memory segment. See its
//! documentation for further information. [`MemoryId`] is used to identify a [`Segment`] using a
//! UUID and a random number appended to it.
//!
//! This module provides an FFI interface containing `CSegment` as a representation of `Segment`
//! and the `load_shmem` and `free_memory` functions.

pub mod padding;

mod buffer_change;
mod continuation;
mod ffi;
mod markers;
mod metaversion;
mod ptr;
mod segment;
mod visitor;

pub(in crate) use self::ffi::CSegment;
pub use self::{
    buffer_change::BufferChange,
    continuation::arrow_continuation,
    metaversion::Metaversion,
    segment::{MemoryId, Segment},
};
