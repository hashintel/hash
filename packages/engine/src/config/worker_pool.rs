use crate::config::WorkerConfig;

#[derive(Clone)]
pub struct Config {
    pub worker_base_config: WorkerConfig,
    /// Note that it is possible that this number is not the same as the number of workers for an
    /// instance of a simulation run.
    pub num_workers: usize,
}

impl Config {
    pub fn new(worker_base_config: WorkerConfig, num_workers: usize) -> Config {
        Config {
            worker_base_config,
            num_workers,
        }
    }
}
