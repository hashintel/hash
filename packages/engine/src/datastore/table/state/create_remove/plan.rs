use std::sync::Arc;

use parking_lot::RwLock;
use rayon::prelude::*;

use super::action::{CreateActions, ExistingGroupBufferActions};
use crate::{
    datastore::{
        error::{Error, Result},
        prelude::*,
        table::pool::{agent::AgentPool, BatchPool},
    },
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
    #[tracing::instrument(skip_all)]
    pub fn delete_all(num_batches: usize) -> MigrationPlan<'a> {
        MigrationPlan {
            existing_mutations: (0..num_batches)
                .map(|_| ExistingGroupBufferActions::Remove)
                .collect(),
            create_commands: Vec::new(),
            num_agents_after_execution: 0,
        }
    }

    #[tracing::instrument(skip_all)]
    pub fn execute(self, state: &mut AgentPool, config: &SimRunConfig) -> Result<Vec<String>> {
        // tracing::debug!("Updating");
        let mut_batches = state.mut_batches();
        self.existing_mutations
            .par_iter()
            .zip_eq(mut_batches.par_iter_mut())
            .try_for_each::<_, Result<()>>(|(action, batch)| {
                let mut write_batch = batch
                    .try_write()
                    .ok_or_else(|| Error::from("Failed to acquire write lock"))?;
                match action {
                    ExistingGroupBufferActions::Persist { affinity } => {
                        write_batch.set_affinity(*affinity);
                    }
                    ExistingGroupBufferActions::Remove => {
                        // Do nothing yet
                    }
                    ExistingGroupBufferActions::Update { actions, affinity } => {
                        actions.flush(&mut write_batch)?;
                        write_batch.set_affinity(*affinity);
                    }
                    ExistingGroupBufferActions::Undefined => {
                        return Err(Error::UnexpectedUndefinedCommand);
                    }
                }
                Ok(())
            })?;

        let mut removed_ids = vec![];
        // tracing::debug!("Deleting");
        self.existing_mutations
            .iter()
            .enumerate()
            .rev()
            .try_for_each::<_, Result<()>>(|(batch_index, action)| {
                if let ExistingGroupBufferActions::Remove = action {
                    // Removing in tandem to keep similarly sized batches together
                    removed_ids.push(
                        mut_batches
                            .swap_remove(batch_index)
                            .try_read()
                            .ok_or_else(|| Error::from("failed to get read lock for batch"))?
                            .get_batch_id()
                            .to_string(),
                    );
                }
                Ok(())
            })?;

        // tracing::debug!("Creating {} ", self.create_commands.len());
        let mut created_dynamic_batches = self
            .create_commands
            .into_par_iter()
            .map(|action| {
                let buffer_actions = action.actions;
                let new_batch = buffer_actions
                    .new_batch(
                        &config.sim.store.agent_schema,
                        &config.exp.run_id,
                        action.affinity,
                    )
                    .map_err(Error::from)?;
                Ok(Arc::new(RwLock::new(new_batch)))
            })
            .collect::<Result<_>>()?;
        mut_batches.append(&mut created_dynamic_batches);

        // tracing::debug!("Finished");
        Ok(removed_ids)
    }
}
