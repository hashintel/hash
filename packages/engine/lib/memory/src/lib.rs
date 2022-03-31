//! Defines how data is stored in shared memory and provides an (optional) Apache Arrow interface to
//! it.
//!
//! This crates consists of two parts:
//!   - [`shared_memory`] contains structures and functions to store and load data to/from shared
//!     memory. Each memory [`Segment`] consisting of four optional parts:
//!
//!       1) Arrow Schema
//!       2) Header
//!       3) Arrow Batch metadata
//!       4) [`ArrowBatch`] data
//!
//!     See the [`Memory`] documentation for further information.
//!
//!   - [`arrow`] contains the memory format used for Arrow data stored in a [`Segment`]. Each
//!     [`ArrowBatch`] is associated with one [`Segment`] and several other data. For further
//!     information please see the [`ArrowBatch`] API.
//!
//! Each top-level module has an `ffi` module for interfacing.
//!
//! [`Segment`]: crate::shared_memory::Segment
//! [`Memory`]: crate::shared_memory::Memory
//! [`ArrowBatch`]: crate::arrow::ArrowBatch

mod error;

pub mod arrow;
pub mod shared_memory;

pub use self::error::{Error, Result};
