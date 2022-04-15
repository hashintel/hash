use worker::task::TaskDistributionConfig;

pub trait GetTaskArgs {
    /// Defines if a [`Task`] has a distributed (split across [`worker`]s) execution.
    ///
    /// [`Task`]: crate::simulation::task::Task
    /// [`worker`]: crate::worker
    fn distribution(&self) -> TaskDistributionConfig {
        TaskDistributionConfig::None
    }
}
