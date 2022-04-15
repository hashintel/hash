use execution::worker_pool::WorkerAllocation;

// Configuration specific to a single simulation engine
#[derive(Debug, Clone)]
pub struct Config {
    pub worker_allocation: WorkerAllocation,
    pub num_workers: usize,
}
