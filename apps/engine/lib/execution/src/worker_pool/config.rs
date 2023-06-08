use core::fmt;

use crate::worker::WorkerConfig;

pub type WorkerAllocation = Vec<WorkerIndex>;

#[derive(Clone, Copy, Debug, Eq, PartialEq, PartialOrd, Ord)]
pub struct WorkerIndex(usize);

impl WorkerIndex {
    pub fn new(index: usize) -> WorkerIndex {
        WorkerIndex(index)
    }

    pub fn index(&self) -> usize {
        self.0
    }
}

impl fmt::Display for WorkerIndex {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, fmt)
    }
}

#[derive(Clone)]
pub struct WorkerPoolConfig {
    pub worker_config: WorkerConfig,
    /// Note that it is possible that this number is not the same as the number of workers for an
    /// instance of a simulation run.
    pub num_workers: usize,
}

impl WorkerPoolConfig {
    pub fn new(worker_config: WorkerConfig, num_workers: usize) -> Self {
        Self {
            worker_config,
            num_workers,
        }
    }
}

/// Describes how agent groups are split between workers.
/// If the task uses distributed execution, `agent_distribution`
/// contains the number of agents allocated to each worker.
pub struct SplitConfig {
    pub num_workers: usize,
    pub agent_distribution: Option<Vec<usize>>, // TODO: make sure we don't leak Worker here
}
