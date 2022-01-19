use super::WorkerConfig;

#[derive(Clone)]
pub struct Config {
    pub worker_base_config: WorkerConfig,
    /// Note that it is possible that this number is not the same as the number of workers for an
    /// instance of a simulation run.
    pub num_workers: usize,
}

impl Config {
    #[tracing::instrument(skip_all)]
    pub fn new(worker_base_config: WorkerConfig, max_num_workers: usize) -> Config {
        let _num_workers = std::cmp::min(num_cpus::get(), max_num_workers);
        let num_workers = 1; // TODO: remove this
        Config {
            worker_base_config,
            num_workers,
        }
    }
}
