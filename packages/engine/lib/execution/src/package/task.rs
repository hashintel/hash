use crate::{
    package::{context::ContextTask, init::InitTask, output::OutputTask, state::StateTask},
    task::{SharedStore, Task, TaskDistributionConfig},
    Result,
};

// All traits applied here apply to the enum.
// Also we have automatically derived all
// From<init::Task>, ..., From<output::Task> for this enum.
// Additionally we have TryInto<init::Task>, (and others)
// implemented for this enum.
#[derive(Clone, Debug)]
pub enum PackageTask {
    InitTask(InitTask),
    ContextTask(ContextTask),
    StateTask(StateTask),
    OutputTask(OutputTask),
}

impl Task for PackageTask {
    fn name(&self) -> &'static str {
        match self {
            Self::InitTask(inner) => inner.name(),
            Self::ContextTask(inner) => inner.name(),
            Self::StateTask(inner) => inner.name(),
            Self::OutputTask(inner) => inner.name(),
        }
    }

    fn distribution(&self) -> TaskDistributionConfig {
        match self {
            Self::InitTask(inner) => inner.distribution(),
            Self::ContextTask(inner) => inner.distribution(),
            Self::StateTask(inner) => inner.distribution(),
            Self::OutputTask(inner) => inner.distribution(),
        }
    }

    fn verify_store_access(&self, access: &SharedStore) -> Result<()> {
        match self {
            Self::InitTask(inner) => inner.verify_store_access(access),
            Self::ContextTask(inner) => inner.verify_store_access(access),
            Self::StateTask(inner) => inner.verify_store_access(access),
            Self::OutputTask(inner) => inner.verify_store_access(access),
        }
    }
}
