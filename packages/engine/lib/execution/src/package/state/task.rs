use crate::{
    package::state::behavior_execution::ExecuteBehaviorsTask,
    task::{SharedStore, StateBatchDistribution, Task, TaskDistributionConfig},
    Error, Result,
};

/// All state package tasks are registered in this enum
#[derive(Clone, Debug)]
pub enum StateTask {
    ExecuteBehaviorsTask(ExecuteBehaviorsTask),
}

impl Task for StateTask {
    fn name(&self) -> &'static str {
        match self {
            Self::ExecuteBehaviorsTask(_) => "BehaviorExecution",
        }
    }

    fn distribution(&self) -> TaskDistributionConfig {
        match self {
            Self::ExecuteBehaviorsTask(_) => {
                TaskDistributionConfig::Distributed(StateBatchDistribution {
                    partitioned_batches: true,
                })
            }
        }
    }

    fn verify_store_access(&self, access: &SharedStore) -> Result<()> {
        let state = &access.state;
        let context = access.context();
        // All combinations (as of now) are allowed (but still being explicit)
        if (state.is_readwrite() || state.is_readonly() || state.is_disabled())
            && (context.is_readonly() || context.is_disabled())
        {
            Ok(())
        } else {
            Err(Error::access_not_allowed(state, context, "State".into()))
        }
    }
}
