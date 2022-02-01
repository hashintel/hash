//! TODO: DOC
use std::{ops::Deref, sync::Arc};

use super::{
    super::*,
    action::{CreateActions, ExistingGroupBufferActions},
    batch::PendingBatch,
    command::ProcessedCommands,
    distribution::BatchDistribution,
    MigrationPlan,
};
use crate::{
    datastore::{
        batch::migration::{BufferActions, IndexRange, RangeActions},
        error::Result,
        prelude::*,
        table::{
            pool::{agent::AgentPool, BatchPool},
            state::ReadState,
        },
    },
    simulation::command::CreateRemoveCommands,
    SimRunConfig,
};

pub struct CreateRemovePlanner {
    commands: ProcessedCommands,
    config: Arc<SimRunConfig>,
}

impl CreateRemovePlanner {
    pub fn new(
        commands: CreateRemoveCommands,
        config: Arc<SimRunConfig>,
    ) -> Result<CreateRemovePlanner> {
        Ok(CreateRemovePlanner {
            commands: ProcessedCommands::new(commands, &config.sim.store.agent_schema)?,
            config,
        })
    }

    pub fn run(&mut self, state: &impl ReadState) -> Result<MigrationPlan<'_>> {
        let mut pending = self.pending_plan(state.agent_pool())?;

        let number_inbound = self.commands.get_number_inbound();
        pending.distribute_inbound(number_inbound)?;
        pending.complete(state, self.commands.new_agents.as_ref(), &self.config)
    }

    fn pending_plan(&mut self, agent_pool: &AgentPool) -> Result<PendingPlan> {
        let pending_batches: Vec<PendingBatch> = agent_pool
            .batches()
            .iter()
            .enumerate()
            .map(|(batch_index, batch)| {
                PendingBatch::from_batch(
                    batch_index,
                    batch
                        .try_read()
                        .ok_or_else(|| Error::from("Failed to acquire read lock"))?
                        .deref(),
                    &mut self.commands.remove_ids,
                )
            })
            .collect::<Result<_>>()?;

        let distribution =
            BatchDistribution::new(self.config.exp.worker_pool.num_workers, pending_batches);

        Ok(PendingPlan { distribution })
    }
}

struct PendingPlan {
    distribution: BatchDistribution,
}

impl PendingPlan {
    /// Distribution of agents across all workers and their batches
    fn distribute_inbound(&mut self, num_inbound: usize) -> Result<()> {
        // Number of inbound agents per worker (to-be-deleted agents are taken into account here)
        let worker_inbound_distribution = self
            .distribution
            .get_worker_level_distribution(num_inbound)?;
        self.distribution
            .set_batch_level_inbounds(worker_inbound_distribution)
    }

    fn complete<'b>(
        &mut self,
        state: &impl ReadState,
        new_agents: Option<&'b RecordBatch>,
        config: &Arc<SimRunConfig>,
    ) -> Result<MigrationPlan<'b>> {
        let dynamic_pool = state.agent_pool().try_read_batches()?;
        let mut existing_mutations = (0..dynamic_pool.len())
            .map(|_| ExistingGroupBufferActions::Undefined)
            .collect::<Vec<_>>();
        let mut create_commands = Vec::new();
        let mut num_inbound_agents_allocated = 0;
        let mut num_agents_after_execution = 0;
        self.distribution
            .iter()
            .try_for_each::<_, Result<()>>(|(worker_index, batch)| {
                let affinity = worker_index;
                let planned_num_agents = batch.num_agents();
                num_agents_after_execution += planned_num_agents;
                if batch.wraps_batch() {
                    // This is an existing batch, modify `existing_mutations`
                    let batch_index = batch.old_batch_index_unchecked();

                    existing_mutations[batch_index] = if planned_num_agents == 0 {
                        ExistingGroupBufferActions::Remove
                    } else if batch.num_delete_unchecked() == 0 && batch.num_inbound() == 0 {
                        // No outbound nor inbound agents
                        ExistingGroupBufferActions::Persist { affinity }
                    } else {
                        let actions = buffer_actions_from_pending_batch(
                            state,
                            batch,
                            &new_agents,
                            &config.sim.store.agent_schema,
                            &mut num_inbound_agents_allocated,
                        )?;
                        ExistingGroupBufferActions::Update { actions, affinity }
                    }
                } else {
                    let actions = buffer_actions_from_pending_batch(
                        state,
                        batch,
                        &new_agents,
                        &config.sim.store.agent_schema,
                        &mut num_inbound_agents_allocated,
                    )?;
                    let create_command = CreateActions { actions, affinity };

                    create_commands.push(create_command)
                }
                Ok(())
            })?;

        Ok(MigrationPlan {
            existing_mutations,
            create_commands,
            num_agents_after_execution,
        })
    }
}

fn buffer_actions_from_pending_batch<'a>(
    state: &impl ReadState,
    batch: &PendingBatch,
    inbound_agents: &Option<&'a RecordBatch>,
    schema: &Arc<AgentSchema>,
    inbound_taken_count: &mut usize,
) -> Result<BufferActions<'a>> {
    let remove = RangeActions::collect_indices(batch.get_remove_actions());
    // We don't copy agents between batches anymore
    let copy = (0, vec![]);
    let create = {
        (batch.num_inbound(), vec![IndexRange::new(
            *inbound_taken_count,
            batch.num_inbound(),
        )])
    };

    *inbound_taken_count += create.0;

    let range_actions = RangeActions::new(remove, copy, create);

    let batches = state.agent_pool().try_read_batches()?;
    BufferActions::from(
        &batches,
        batch.old_batch_index(),
        range_actions,
        &schema.static_meta,
        *inbound_agents,
    )
}
