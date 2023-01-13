//! Execution logic to run experiments and simulations.
//!
//! This crate is split into two main parts:
//! - the HASH Engine Package System, and
//! - the execution of [simulation packages].
//!
//! The Package System is defined in the [`package`] module. For running the simulation
//! [`Package`](crate::package::simulation::Package)s, a [`runner`] for each supported [`Language`]
//! is provided. [`task`] defines an interface to communicate between those.
//!
//! All types of language [`runner`]s are stored in one [`Worker`], so for three languages, the
//! [`Worker`] contains three runners, one per language. To handle multiple [`Worker`]s, the
//! [`WorkerPool`] acts as an interface for driving the [`Worker`]s.
//!
//! For more information please consult the corresponding modules.
//!
//! [simulation packages]: crate::package::simulation
//! [`Worker`]: crate::worker::Worker
//! [`WorkerPool`]: crate::worker_pool::WorkerPool
//! [`Language`]: crate::runner::Language

#![feature(map_try_insert, is_sorted, once_cell)]

mod error;
pub mod package;
pub mod runner;
pub mod task;
pub mod worker;
pub mod worker_pool;

pub use self::error::{Error, Result};
