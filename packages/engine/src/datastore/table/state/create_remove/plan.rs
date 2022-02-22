use rayon::prelude::*;

use super::action::{CreateActions, ExistingGroupBufferActions};
use crate::{
    datastore::{
        error::{Error, Result},
        table::pool::{agent::AgentPool, BatchPool},
    },
    proto::ExperimentRunTrait,
    SimRunConfig,
};

#[derive(Debug)]
pub struct MigrationPlan<'a> {
    // Same order as dynamic pool
    pub existing_mutations: Vec<ExistingGroupBufferActions<'a>>,
    pub create_commands: Vec<CreateActions<'a>>,
    pub num_agents_after_execution: usize,
}

impl<'a> MigrationPlan<'a> {
    // TODO: UNUSED: Needs triage
    pub fn delete_all(num_batches: usize) -> MigrationPlan<'a> {
        MigrationPlan {
            existing_mutations: (0..num_batches)
                .map(|_| ExistingGroupBufferActions::Remove)
                .collect(),
            create_commands: Vec::new(),
            num_agents_after_execution: 0,
        }
    }

    pub fn execute(
        self,
        state_agent_pool: &mut AgentPool,
        config: &SimRunConfig,
    ) -> Result<Vec<String>> {
        // tracing::debug!("Updating");
        self.existing_mutations
            .par_iter()
            .zip_eq(
                state_agent_pool
                    .write_proxies()?
                    .batches_mut()
                    .par_iter_mut(),
            )
            .try_for_each::<_, Result<()>>(|(action, batch)| {
                match action {
                    ExistingGroupBufferActions::Persist { affinity } => {
                        batch.affinity = *affinity;
                    }
                    ExistingGroupBufferActions::Remove => {
                        // Do nothing yet
                    }
                    ExistingGroupBufferActions::Update { actions, affinity } => {
                        actions.flush(batch)?;
                        batch.affinity = *affinity;
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
                removed_ids.push(state_agent_pool.swap_remove(batch_index));
            }
        }

        // tracing::debug!("Creating {} ", self.create_commands.len());
        let created_dynamic_batches = self
            .create_commands
            .into_par_iter()
            .map(|action| {
                let buffer_actions = action.actions;
                let new_batch = buffer_actions
                    .new_batch(
                        &config.sim.store.agent_schema,
                        &config.exp.run.base().id,
                        action.affinity,
                    )
                    .map_err(Error::from)?;
                Ok(new_batch)
            })
            .collect::<Result<Vec<_>>>()?;
        state_agent_pool.extend(created_dynamic_batches);

        // tracing::debug!("Finished");
        Ok(removed_ids)
    }
}
