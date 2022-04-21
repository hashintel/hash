use crate::simulation::{
    task::{msg::TaskMessage, Task},
    Error, Result,
};

/// Describes how agent groups are split between workers.
/// If the task uses distributed execution, `agent_distribution`
/// contains the number of agents allocated to each worker.
pub struct SplitConfig {
    pub num_workers: usize,
    pub agent_distribution: Option<Vec<usize>>, // TODO: make sure we don't leak Worker here
}

pub trait WorkerPoolHandler {
    /// When a Chunked/Parallel task is initialized
    /// the init message will have to be split
    /// depending on the provided split configuration
    fn split_task(&self, _split_config: &SplitConfig) -> Result<Vec<Task>> {
        Err(Error::DistributionNodeHandlerNotImplemented)
    }

    /// When work is done in multiple worker nodes, this function is called to compute the single
    /// message that is returned to the package
    fn combine_messages(&self, _split_messages: Vec<TaskMessage>) -> Result<TaskMessage> {
        Err(Error::DistributionNodeHandlerNotImplemented)
    }
}
