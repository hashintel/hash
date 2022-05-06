pub mod comms;

mod config;
mod handler;

pub use self::{
    config::{SplitConfig, WorkerAllocation, WorkerIndex, WorkerPoolConfig},
    handler::WorkerPoolHandler,
};
