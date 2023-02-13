use experiment_structure::SimulationRunConfig;
use memory::shared_memory::MemoryId;
use rayon::prelude::*;
use stateful::{proxy::BatchPool, state::StateBatchPools};

use crate::command::{
    create_remove::action::{CreateActions, ExistingGroupBufferActions},
    Error, Result,
};

#[derive(Debug)]
pub struct MigrationPlan<'a> {
    // Same order as dynamic pool
    pub existing_mutations: Vec<ExistingGroupBufferActions<'a>>,
    pub create_commands: Vec<CreateActions<'a>>,
    pub num_agents_after_execution: usize,
}

impl<'a> MigrationPlan<'a> {
    pub fn execute(
        self,
        state: &mut StateBatchPools,
        config: &SimulationRunConfig,
    ) -> Result<Vec<String>> {
        // tracing::debug!("Updating");
        self.existing_mutations
            .par_iter()
            .zip_eq(
                state
                    .agent_pool
                    .write_proxies()?
                    .batches_iter_mut()
                    .collect::<Vec<_>>()
                    .par_iter_mut(),
            )
            .try_for_each::<_, Result<()>>(|(action, batch)| {
                match action {
                    ExistingGroupBufferActions::Persist { worker_index } => {
                        batch.set_worker_index(*worker_index);
                    }
                    ExistingGroupBufferActions::Remove => {
                        // Do nothing yet
                    }
                    ExistingGroupBufferActions::Update {
                        actions,
                        worker_index,
                    } => {
                        actions.flush(batch)?;
                        batch.set_worker_index(*worker_index);
                    }
                    ExistingGroupBufferActions::Undefined => {
                        return Err(Error::UnexpectedUndefinedCommand);
                    }
                }
                Ok(())
            })?;

        let mut removed_ids = vec![];
        // tracing::debug!("Deleting");
        for (batch_index, action) in self.existing_mutations.iter().enumerate().rev() {
            if let ExistingGroupBufferActions::Remove = action {
                // Removing in tandem to keep similarly sized batches together
                removed_ids.push(
                    state
                        .agent_pool
                        .swap_remove(batch_index)
                        .batch
                        .segment()
                        .id()
                        .to_string(),
                );
                removed_ids.push(
                    state
                        .message_pool
                        .swap_remove(batch_index)
                        .batch
                        .segment()
                        .id()
                        .to_string(),
                );
            }
        }

        // tracing::debug!("Creating {} ", self.create_commands.len());
        let created_dynamic_batches = self
            .create_commands
            .into_par_iter()
            .map(|action| {
                action.actions.new_batch(
                    &config.simulation_config().schema.agent_schema,
                    &config.simulation_config().schema.message_schema,
                    MemoryId::new(config.experiment_config().experiment_run.id().as_uuid()),
                    MemoryId::new(config.experiment_config().experiment_run.id().as_uuid()),
                    action.worker_index,
                )
            })
            .collect::<Result<Vec<_>>>()?;
        state.extend(created_dynamic_batches);

        // tracing::debug!("Finished");
        Ok(removed_ids)
    }
}
