//! TODO: DOC
use std::sync::Arc;

use experiment_structure::SimulationRunConfig;
use memory::arrow::record_batch::RecordBatch;
use stateful::{
    agent::{AgentBatch, AgentSchema},
    proxy::PoolReadProxy,
    state::StateReadProxy,
};

use crate::command::{
    create_remove::{
        action::{CreateActions, ExistingGroupBufferActions},
        batch::PendingBatch,
        command::ProcessedCommands,
        distribution::BatchDistribution,
        migration::{BufferActions, IndexRange, RangeActions},
        MigrationPlan,
    },
    CreateRemoveCommands, Result,
};

pub struct CreateRemovePlanner {
    commands: ProcessedCommands,
    config: Arc<SimulationRunConfig>,
}

impl CreateRemovePlanner {
    pub fn new(
        commands: CreateRemoveCommands,
        config: Arc<SimulationRunConfig>,
    ) -> Result<CreateRemovePlanner> {
        Ok(CreateRemovePlanner {
            commands: ProcessedCommands::new(
                commands,
                &config.simulation_config().schema.agent_schema,
            )?,
            config,
        })
    }

    pub fn run(&mut self, state_proxy: &StateReadProxy) -> Result<MigrationPlan> {
        let mut pending = self.pending_plan(state_proxy.agent_pool())?;

        let number_inbound = self.commands.get_number_inbound();
        pending.distribute_inbound(number_inbound)?;
        pending.complete(state_proxy, self.commands.new_agents.as_ref(), &self.config)
    }

    fn pending_plan(&mut self, agent_pool: &PoolReadProxy<AgentBatch>) -> Result<PendingPlan> {
        let pending_batches: Vec<PendingBatch> = agent_pool
            .batches_iter()
            .enumerate()
            .map(|(batch_index, batch)| {
                PendingBatch::from_batch(batch_index, batch, &mut self.commands.remove_ids)
            })
            .collect::<Result<_>>()?;

        let distribution = BatchDistribution::new(
            self.config.experiment_config().worker_pool.num_workers,
            pending_batches,
            self.config.experiment_config().target_max_group_size,
        );

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
        state_proxy: &StateReadProxy,
        new_agents: Option<&'b RecordBatch>,
        config: &Arc<SimulationRunConfig>,
    ) -> Result<MigrationPlan<'b>> {
        let dynamic_pool = state_proxy.agent_pool();
        let mut existing_mutations = (0..dynamic_pool.len())
            .map(|_| ExistingGroupBufferActions::Undefined)
            .collect::<Vec<_>>();
        let mut create_commands = Vec::new();
        let mut num_inbound_agents_allocated = 0;
        let mut num_agents_after_execution = 0;
        for (worker_index, batch) in self.distribution.iter() {
            let planned_num_agents = batch.num_agents();
            num_agents_after_execution += planned_num_agents;
            if batch.wraps_batch() {
                // This is an existing batch, modify `existing_mutations`
                let batch_index = batch.old_batch_index_unchecked();

                existing_mutations[batch_index] = if planned_num_agents == 0 {
                    ExistingGroupBufferActions::Remove
                } else if batch.num_delete_unchecked() == 0 && batch.num_inbound() == 0 {
                    // No outbound nor inbound agents
                    ExistingGroupBufferActions::Persist { worker_index }
                } else {
                    let actions = buffer_actions_from_pending_batch(
                        state_proxy,
                        batch,
                        &new_agents,
                        &config.simulation_config().schema.agent_schema,
                        &mut num_inbound_agents_allocated,
                    )?;
                    ExistingGroupBufferActions::Update {
                        actions,
                        worker_index,
                    }
                }
            } else {
                let actions = buffer_actions_from_pending_batch(
                    state_proxy,
                    batch,
                    &new_agents,
                    &config.simulation_config().schema.agent_schema,
                    &mut num_inbound_agents_allocated,
                )?;
                let create_command = CreateActions {
                    actions,
                    worker_index,
                };

                create_commands.push(create_command)
            }
        }

        Ok(MigrationPlan {
            existing_mutations,
            create_commands,
            num_agents_after_execution,
        })
    }
}

fn buffer_actions_from_pending_batch<'a>(
    state_proxy: &StateReadProxy,
    pending_batch: &PendingBatch,
    inbound_agents: &Option<&'a RecordBatch>,
    schema: &Arc<AgentSchema>,
    inbound_taken_count: &mut usize,
) -> Result<BufferActions<'a>> {
    let remove = RangeActions::collect_indices(pending_batch.get_remove_actions());
    // We don't copy agents between batches anymore
    let copy = (0, vec![]);
    let create = {
        (pending_batch.num_inbound(), vec![IndexRange::new(
            *inbound_taken_count,
            pending_batch.num_inbound(),
        )])
    };

    *inbound_taken_count += create.0;

    let range_actions = RangeActions::new(remove, copy, create);

    let agent_batches = state_proxy.agent_pool().batches_iter().collect::<Vec<_>>();
    BufferActions::from(
        &agent_batches,
        pending_batch.old_batch_index(),
        range_actions,
        &schema.static_meta,
        *inbound_agents,
    )
}
