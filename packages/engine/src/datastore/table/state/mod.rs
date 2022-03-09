pub mod create_remove;
// TODO: UNUSED: Needs triage
pub mod hash_message;
// TODO: UNUSED: Needs triage
pub mod message;
pub mod view;

use std::sync::Arc;

use self::create_remove::CreateRemovePlanner;
use super::{
    pool::{agent::AgentPool, message::MessagePool},
    references::MessageMap,
};
use crate::{
    datastore::{
        prelude::*,
        schema::state::AgentSchema,
        table::{
            pool::BatchPool,
            proxy::{StateReadProxy, StateWriteProxy},
            state::view::StatePools,
        },
    },
    proto::ExperimentRunTrait,
    simulation::command::CreateRemoveCommands,
    SimRunConfig,
};

pub const MIN_PER_WORKER: usize = 10;

pub struct State {
    /// View into the current step's Agent state.
    state: StatePools,

    /// Cumulative number of agents in the first `i` batches of the pools, i.e. index of first
    /// agent of each group in combined pool.
    group_start_indices: Arc<Vec<usize>>,

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

        Ok(Self {
            state: StatePools {
                agent_pool: AgentPool::new(agent_batches),
                message_pool: MessagePool::new(message_batches),
            },
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
        let num_agents_per_group = ((num_agents as f64 / num_workers as f64).ceil() as usize)
            .clamp(MIN_PER_WORKER, sim_config.exp.target_max_group_size);
        let mut agent_state_groups = vec![];
        let mut next_index = 0;
        while next_index != num_agents {
            let this_index = next_index;
            next_index = (next_index + num_agents_per_group).min(num_agents);
            agent_state_groups.push(&agent_states[this_index..next_index]);
        }

        Self::from_agent_groups(&agent_state_groups, num_agents, sim_config)
    }

    pub fn create_remove(
        &mut self,
        commands: CreateRemoveCommands,
        config: &Arc<SimRunConfig>,
    ) -> Result<()> {
        let mut planner = CreateRemovePlanner::new(commands, config.clone())?;
        let plan = planner.run(&self.read()?)?;
        self.num_agents = plan.num_agents_after_execution;
        plan.execute(self.state_mut(), config)?;

        Ok(())
    }

    pub fn sim_config(&self) -> &Arc<SimRunConfig> {
        &self.sim_config
    }

    pub fn message_map(&self) -> Result<MessageMap> {
        MessageMap::new(&self.message_pool().read_proxies()?)
    }

    pub fn agent_pool(&self) -> &AgentPool {
        &self.state.agent_pool
    }

    pub fn agent_pool_mut(&mut self) -> &mut AgentPool {
        &mut self.state.agent_pool
    }

    pub fn message_pool(&self) -> &MessagePool {
        &self.state.message_pool
    }

    // TODO: UNUSED: Needs triage
    pub fn message_pool_mut(&mut self) -> &mut MessagePool {
        &mut self.state.message_pool
    }

    pub fn state_mut(&mut self) -> &mut StatePools {
        &mut self.state
    }

    pub fn read(&self) -> Result<StateReadProxy> {
        self.state.read()
    }

    pub fn write(&mut self) -> Result<StateWriteProxy> {
        self.state.write()
    }

    pub fn num_agents(&self) -> usize {
        self.num_agents
    }

    pub fn group_start_indices(&self) -> &Arc<Vec<usize>> {
        &self.group_start_indices
    }

    pub fn set_group_start_indices(&mut self, group_start_indices: Arc<Vec<usize>>) {
        self.group_start_indices = group_start_indices;
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
        let mut message_proxies = old_context_message_pool.write_proxies()?;
        let agent_proxies = self.agent_pool().read_proxies()?;
        message_proxies.reset(&mut old_context_message_pool, &agent_proxies, sim_config)?;
        Ok(std::mem::replace(
            &mut self.state.message_pool,
            old_context_message_pool,
        ))
    }
}
