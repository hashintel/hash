//! # Workers, language runners and the hEngine Package System
//!
//! This crate contains the Package System defined in the [`package`] module, the [`task`]s used
//! to drive this, and the language [`runner`]s to run a [`Package`](package::Package). To organize
//! the [`runner`]s, [`worker`]s and [`worker_pool`]s are provided.
//!
//! For more information please consult the corresponding modules.

#![feature(map_try_insert, is_sorted)]

mod error;
pub mod package;
pub mod runner;
pub mod task;
pub mod worker;
pub mod worker_pool;

pub use self::error::{Error, Result};
