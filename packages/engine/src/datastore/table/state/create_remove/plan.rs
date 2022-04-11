use memory::shared_memory::MemoryId;
use rayon::prelude::*;

use crate::{
    config::SimRunConfig,
    datastore::{
        error::{Error, Result},
        table::{
            pool::BatchPool,
            state::{
                create_remove::action::{CreateActions, ExistingGroupBufferActions},
                view::StatePools,
            },
        },
    },
    proto::ExperimentRunTrait,
};

#[derive(Debug)]
pub struct MigrationPlan<'a> {
    // Same order as dynamic pool
    pub existing_mutations: Vec<ExistingGroupBufferActions<'a>>,
    pub create_commands: Vec<CreateActions<'a>>,
    pub num_agents_after_execution: usize,
}

impl<'a> MigrationPlan<'a> {
    pub fn execute(self, state: &mut StatePools, config: &SimRunConfig) -> Result<Vec<String>> {
        // tracing::debug!("Updating");
        self.existing_mutations
            .par_iter()
            .zip_eq(
                state
                    .agent_pool
                    .write_proxies()?
                    .batches_mut()
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
                    &config.sim.store.agent_schema,
                    &config.sim.store.message_schema,
                    MemoryId::new(config.exp.run.base().id),
                    MemoryId::new(config.exp.run.base().id),
                    action.worker_index,
                )
            })
            .collect::<Result<Vec<_>>>()?;
        state.extend(created_dynamic_batches);

        // tracing::debug!("Finished");
        Ok(removed_ids)
    }
}
