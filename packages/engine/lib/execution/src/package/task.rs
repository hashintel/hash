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
    Init(InitTask),
    Context(ContextTask),
    State(StateTask),
    Output(OutputTask),
}

impl Task for PackageTask {
    fn name(&self) -> &'static str {
        match self {
            Self::Init(inner) => inner.name(),
            Self::Context(inner) => inner.name(),
            Self::State(inner) => inner.name(),
            Self::Output(inner) => inner.name(),
        }
    }

    fn distribution(&self) -> TaskDistributionConfig {
        match self {
            Self::Init(inner) => inner.distribution(),
            Self::Context(inner) => inner.distribution(),
            Self::State(inner) => inner.distribution(),
            Self::Output(inner) => inner.distribution(),
        }
    }

    fn verify_store_access(&self, access: &SharedStore) -> Result<()> {
        match self {
            Self::Init(inner) => inner.verify_store_access(access),
            Self::Context(inner) => inner.verify_store_access(access),
            Self::State(inner) => inner.verify_store_access(access),
            Self::Output(inner) => inner.verify_store_access(access),
        }
    }
}
