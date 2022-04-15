extern crate core;

mod error;
pub mod runner;
pub mod task;
pub mod worker;
pub mod worker_pool;

pub use self::error::{Error, Result};
