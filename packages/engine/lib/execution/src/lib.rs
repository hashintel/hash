#![feature(map_try_insert, is_sorted)]

mod error;
pub mod package;
pub mod runner;
pub mod task;
pub mod worker;
pub mod worker_pool;

pub use self::error::{Error, Result};
