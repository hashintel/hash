//! Defines how data is stored in shared memory and provides an (optional) Apache Arrow interface to
//! it.
//!
//! This crates consists of two parts:
//!   - [`shared_memory`] contains structures and functions to store and load data to/from shared
//!     memory. See the [`Segment`] documentation for further information.
//!
//!   - [`arrow`] contains the memory format used for Arrow data stored in a [`Segment`]. Each
//!     [`ArrowBatch`] is associated with one [`Segment`] and several other data. For further
//!     information please see the [`ArrowBatch`] API.
//!
//! Each top-level module has an `ffi` module for interfacing. This is exposed through a shared
//! library that's generated from this crate.
//!
//! [`Segment`]: crate::shared_memory::Segment
//! [`ArrowBatch`]: crate::arrow::ArrowBatch

#![feature(once_cell)]

mod error;

pub mod arrow;
pub mod shared_memory;

pub use self::error::{Error, Result};
