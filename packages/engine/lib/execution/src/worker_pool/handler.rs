use crate::{
    package::simulation::PackageTask, task::TaskMessage, worker_pool::SplitConfig, Error, Result,
};

pub trait WorkerPoolHandler {
    /// When a Chunked/Parallel task is initialized
    /// the init message will have to be split
    /// depending on the provided split configuration
    #[allow(unused_variables)]
    fn split_task(&self, split_config: &SplitConfig) -> Result<Vec<PackageTask>> {
        Err(Error::DistributionNodeHandlerNotImplemented)
    }

    /// When work is done in multiple worker nodes, this function is called to compute the single
    /// message that is returned to the package
    #[allow(unused_variables)]
    fn combine_messages(&self, _split_messages: Vec<TaskMessage>) -> Result<TaskMessage> {
        Err(Error::DistributionNodeHandlerNotImplemented)
    }
}
