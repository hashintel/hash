pub mod create_remove;
pub mod hash_message;
pub mod message;
pub mod view;

use std::sync::Arc;

use self::create_remove::CreateRemovePlanner;
use super::{
    context::Context,
    meta::Meta,
    pool::{agent::AgentPool, message::MessagePool},
    references::MessageMap,
};
use crate::{
    datastore::{
        batch::DynamicBatch, prelude::*, schema::state::AgentSchema, table::pool::BatchPool,
    },
    proto::{ExperimentId, ExperimentRunTrait},
    simulation::{command::CreateRemoveCommands, package::state::StateColumn},
    SimRunConfig,
};

pub struct State {
    /// Pool which contains all batches for the current step's Agent state.
    agent_pool: AgentPool,

    /// Pool which contains all batches for the message pool of the current step, i.e. the
    /// 'outbox'.
    message_pool: MessagePool,

    /// Cumulative number of agents in the first `i` batches of the pools, i.e. index of first
    /// agent of each group in combined pool.
    group_start_indices: Arc<Vec<usize>>,

    // TODO: remove Meta, just move in removed_ids
    /// The IDs of the batches that were removed between this step and the last.
    local_meta: Meta,

    num_agents: usize,

    sim_config: Arc<SimRunConfig>,
}

impl State {
    /// Creates a new State object from an array of groups of [`AgentState`]s.
    ///
    /// Uses the schemas in the provided `sim_config` to validate the provided state, and to create
    /// the agent and message batches. The agent batches use the data provided in
    /// `agent_state_groups`, where each element is a group, and the total elements (i.e.
    /// [`AgentState`]s) within those groups is `num_agents`.
    ///
    /// Effectively converts the `agent_state_groups` from Array-of-Structs into a
    /// Struct-of-Arrays.
    pub fn from_agent_groups(
        agent_state_groups: &[&[AgentState]],
        num_agents: usize,
        sim_config: Arc<SimRunConfig>,
    ) -> Result<Self> {
        let mut agent_batches = Vec::with_capacity(agent_state_groups.len());
        let mut message_batches = Vec::with_capacity(agent_state_groups.len());

        let agent_schema = &sim_config.sim.store.agent_schema;
        let message_schema = &sim_config.sim.store.message_schema;
        let experiment_id = &sim_config.exp.run.base().id;

        let mut group_start_indices = Vec::new();
        let mut start = 0;

        // converts the `agent_state_groups` from Array-of-Structs into a Struct-of-Arrays.
        for agent_state_group in agent_state_groups {
            group_start_indices.push(start);
            start += agent_state_group.len();

            agent_batches.push(Arc::new(parking_lot::RwLock::new(
                AgentBatch::from_agent_states(*agent_state_group, agent_schema, experiment_id)?,
            )));
            message_batches.push(Arc::new(parking_lot::RwLock::new(
                MessageBatch::from_agent_states(*agent_state_group, message_schema, experiment_id)?,
            )));
        }
        let agent_pool = AgentPool::new(agent_batches);
        let message_pool = MessagePool::new(message_batches);

        Ok(Self {
            agent_pool,
            message_pool,
            local_meta: Meta::default(),
            num_agents,
            group_start_indices: Arc::new(group_start_indices),
            sim_config,
        })
    }

    /// Creates a new State object from a provided array of [`AgentState`]s.
    ///
    /// Uses the schemas in the provided `sim_config` to validate the provided state, and to create
    /// the agent and message batches. The agent batches are created by splitting up the
    /// `agent_states` into groups based on the number of workers specified in `sim_config`.
    pub fn from_agent_states(
        agent_states: &[AgentState],
        sim_config: Arc<SimRunConfig>,
    ) -> Result<State> {
        let num_workers = sim_config.sim.engine.num_workers;
        let num_agents = agent_states.len();

        // Split agents into groups that can be distributed across workers
        const MIN_PER_WORKER: usize = 10;
        let num_agents_per_worker =
            ((num_agents as f64 / num_workers as f64).ceil() as usize).max(MIN_PER_WORKER);
        let mut agent_state_groups = vec![];
        let mut next_index = 0;
        while next_index != num_agents {
            let this_index = next_index;
            next_index = (next_index + num_agents_per_worker).min(num_agents);
            agent_state_groups.push(&agent_states[this_index..next_index]);
        }

        Self::from_agent_groups(&agent_state_groups, num_agents, sim_config)
    }

    pub fn local_meta(&mut self) -> &mut Meta {
        &mut self.local_meta
    }

    // TODO can this be moved into Context
    /// Copies the current agent state into the `Context` before running state packages, which
    /// stores a snapshot of state at the end of the last step.
    ///
    /// This can result in a change in the number of groups and batches within the `Context`,
    /// and thus it updates the group start indices registered in self.
    pub fn finalize_context_agent_pool(
        &mut self,
        context: &mut Context,
        agent_schema: &AgentSchema,
        experiment_id: &ExperimentId,
    ) -> Result<()> {
        let mut static_pool = context.agent_pool_mut().try_write_batches()?;
        let dynamic_pool = self.agent_pool().try_read_batches()?;

        (0..dynamic_pool.len().min(static_pool.len())).try_for_each::<_, Result<()>>(
            |batch_index| {
                let dynamic_batch = &dynamic_pool[batch_index];
                let static_batch = &mut static_pool[batch_index];
                static_batch.sync(dynamic_batch)?;
                Ok(())
            },
        )?;

        // TODO search everywhere and replace static_pool and dynamic_pool to more descriptively
        //  refer to context/state (respectively)
        drop(static_pool); // Release RwLock write access.
        let static_pool = context.agent_pool_mut().mut_batches();

        #[allow(clippy::comparison_chain)]
        if dynamic_pool.len() > static_pool.len() {
            // Add more static batches
            dynamic_pool[static_pool.len()..dynamic_pool.len()]
                .iter()
                .try_for_each::<_, Result<()>>(|batch| {
                    let r#static = AgentBatch::duplicate_from(batch, agent_schema, experiment_id)?;
                    static_pool.push(Arc::new(parking_lot::RwLock::new(r#static)));
                    Ok(())
                })?;
        } else if dynamic_pool.len() < static_pool.len() {
            // Remove unneeded static batches
            let mut removed_ids = Vec::with_capacity(static_pool.len() - dynamic_pool.len());
            (dynamic_pool.len()..static_pool.len())
                .rev()
                .try_for_each::<_, Result<()>>(|remove_index| {
                    let removed = static_pool.remove(remove_index);
                    removed_ids.push(
                        removed
                            .try_read()
                            .ok_or_else(|| {
                                Error::from(format!(
                                    "failed to acquire read lock for removed batch at index: {}",
                                    remove_index
                                ))
                            })?
                            .get_batch_id()
                            .to_string(),
                    );
                    Ok(())
                })?;
            removed_ids
                .into_iter()
                .for_each(|id| context.local_meta().removed_batch(id));
        }

        // State group start indices need to be updated, because we
        // might have added/removed agents to/from groups.
        let mut cumulative_num_agents = 0;
        let group_start_indices = Arc::new(
            dynamic_pool
                .iter()
                .map(|batch| {
                    let n = cumulative_num_agents;
                    cumulative_num_agents += batch.num_agents();
                    n
                })
                .collect(),
        );
        drop(dynamic_pool);
        self.group_start_indices = group_start_indices;
        Ok(())
    }

    pub fn create_remove(
        &mut self,
        commands: CreateRemoveCommands,
        config: &Arc<SimRunConfig>,
    ) -> Result<()> {
        let mut planner = CreateRemovePlanner::new(commands, config.clone())?;
        let plan = planner.run(self)?;
        *self.num_agents_mut() = plan.num_agents_after_execution;
        let removed_ids = plan.execute(self.agent_pool_mut(), config)?;

        // Register all batches that were removed
        removed_ids
            .into_iter()
            .for_each(|id| self.local_meta().removed_batch(id));
        Ok(())
    }

    // TODO: enable writing into the message batch too
    pub fn set_pending_column(&mut self, column: StateColumn) -> Result<()> {
        self.agent_pool_mut().set_pending_column(column)
    }

    pub fn flush_pending_columns(&mut self) -> Result<()> {
        self.agent_pool_mut().flush_pending_columns()
    }

    pub fn sim_config(&self) -> &Arc<SimRunConfig> {
        &self.sim_config
    }

    pub fn message_pool(&self) -> &MessagePool {
        &self.message_pool
    }

    pub fn message_pool_mut(&mut self) -> &mut MessagePool {
        &mut self.message_pool
    }

    pub fn message_map(&self) -> Result<MessageMap> {
        let read = self.message_pool().read()?;
        MessageMap::new(&read)
    }

    pub fn agent_pool(&self) -> &AgentPool {
        &self.agent_pool
    }

    pub fn agent_pool_mut(&mut self) -> &mut AgentPool {
        &mut self.agent_pool
    }

    pub fn num_agents(&self) -> usize {
        self.num_agents
    }

    pub fn num_agents_mut(&mut self) -> &mut usize {
        &mut self.num_agents
    }

    pub fn group_start_indices(&self) -> &Arc<Vec<usize>> {
        &self.group_start_indices
    }

    /// Reset the messages of the State
    ///
    /// Uses the Context message pool shared memories as the base for the new message pool for
    /// State.
    ///
    /// Returns the old messages so they can be used later for reference.
    ///
    /// ### Performance
    ///
    /// This creates a new empty messages column for each old column to replace, which
    /// requires creating a null bit buffer with all bits set to 1 (i.e. all valid), i.e. one bit
    /// per each agent in each group. Everything else is O(m), where `m` is the number of batches,
    /// so this function shouldn't take very long to run.
    pub fn reset_messages(
        &mut self,
        mut old_context_message_pool: MessagePool,
        sim_config: &SimRunConfig,
    ) -> Result<MessagePool> {
        old_context_message_pool.reset(&self.agent_pool, sim_config)?;
        Ok(std::mem::replace(
            &mut self.message_pool,
            old_context_message_pool,
        ))
    }
}
