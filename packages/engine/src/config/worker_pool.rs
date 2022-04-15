use crate::config::WorkerConfig;

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
