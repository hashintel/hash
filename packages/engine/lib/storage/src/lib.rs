//! Defines how data is stored in shared memory and provides an (optional) Apache Arrow interface to it.
//!
//! This crates consists of two main parts:
//!   - [`memory`] contains structures and functions to store and load data to/from shared memory.
//!     Each memory [`Segment`] consisting of four optional parts:
//!
//!       1) Arrow Schema
//!       2) Header
//!       3) Arrow Batch [`meta`]data
//!       4) [`ArrowBatch`] data
//!
//!     See the [`Memory`] documentation for further information.
//!
//!   - [`batch`] contains arrow-data to be stored in a memory [`Segment`]. Each [`ArrowBatch`] is
//!     associated with one [`Segment`] and several other data. For further information please see
//!     the [`ArrowBatch`] API.
//!
//! Furthermore, there is a [`meta`] module used for metadata in an [`ArrowBatch`] and an
//! [`ffi`] module exposing basic functionality to interact with memory and batches.
//!
//! [`Segment`]: crate::memory::Segment
//! [`memory`]: crate::memory
//! [`Memory`]: crate::memory::Memory
//! [`ArrowBatch`]: crate::batch::ArrowBatch

mod error;

pub mod batch;
pub mod ffi;
pub mod memory;
pub mod meta;

pub use self::error::{Error, Result};
