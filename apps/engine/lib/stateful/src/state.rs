//! Abstraction over [`agent`](crate::agent)s and [`message`](crate::message)s.
//!
//! For a high-level concept of the state, please see the [HASH documentation].
//!
//! A [`State`] associates [`Agent`]s and [`Message`]s. It stores [`StateBatchPools`] inside, which
//! itself is a wrapper for [`AgentBatchPool`] and [`MessageBatchPool`]. To provide a similar access
//! like provided by the [`proxy`] module, [`StateReadProxy`] and [`StateWriteProxy`] are provided.
//!
//! To reference to an [`Agent`] and to a [`Message`], [`AgentIndex`] and [`MessageReference`] is
//! used.
//!
//! [HASH documentation]: https://hash.ai/docs/simulation/creating-simulations/anatomy-of-an-agent/state
//! [`Message`]: crate::message::Message
//! [`proxy`]: crate::proxy

mod column;
mod proxy;
mod references;
mod view;

use std::{ops::Range, sync::Arc};

use memory::shared_memory::MemoryId;
use uuid::Uuid;

pub use self::{
    column::StateColumn,
    proxy::{StateReadProxy, StateWriteProxy},
    references::{AgentIndex, MessageReference},
    view::{StateBatchPools, StateSnapshot},
};
use crate::{
    agent::{Agent, AgentBatch, AgentBatchPool, AgentSchema},
    message::{MessageBatch, MessageBatchPool, MessageMap, MessageSchema},
    proxy::BatchPool,
    Result,
};

/// Used for creating a new [`State`].
pub struct StateCreateParameters {
    /// Minimum number of groups.
    ///
    /// This may get overwritten by `target_group_size`.
    pub target_min_groups: usize,
    /// Limits the number of agents per group.
    pub target_group_size: Range<usize>,
    /// Base id used for generating a [`MemoryId`] for new batches.
    pub memory_base_id: Uuid,
    pub agent_schema: Arc<AgentSchema>,
    pub message_schema: Arc<MessageSchema>,
}

/// Holds shared data for [`Agent`]s and [`Message`]s.
///
/// [`Message`]: crate::message::Message
pub struct State {
    /// View into the current step's Agent state.
    state: StateBatchPools,

    /// Cumulative number of agents in the first `i` batches of the pools, i.e. index of first
    /// agent of each group in combined pool.
    group_start_indices: Arc<Vec<usize>>,

    /// The IDs of the batches that were removed between this step and the last.
    removed_batches: Vec<String>,

    num_agents: usize,

    memory_base_id: Uuid,
    message_schema: Arc<MessageSchema>,
}

impl State {
    /// Creates a new State object from an array of groups of [`Agent`]s.
    ///
    /// Uses the schemas in the provided `sim_config` to validate the provided state, and to create
    /// the agent and message batches. The agent batches use the data provided in
    /// `agent_state_groups`, where each element is a group, and the total elements (i.e.
    /// [`Agent`]s) within those groups is `num_agents`.
    ///
    /// Effectively converts the `agent_state_groups` from Array-of-Structs into a
    /// Struct-of-Arrays.
    fn from_agent_groups(
        agent_state_groups: &[&[Agent]],
        num_agents: usize,
        create_parameters: StateCreateParameters,
    ) -> Result<Self> {
        let mut agent_batches = Vec::with_capacity(agent_state_groups.len());
        let mut message_batches = Vec::with_capacity(agent_state_groups.len());

        let mut group_start_indices = Vec::new();
        let mut start = 0;

        // converts the `agent_state_groups` from Array-of-Structs into a Struct-of-Arrays.
        for agent_state_group in agent_state_groups {
            group_start_indices.push(start);
            start += agent_state_group.len();

            agent_batches.push(Arc::new(parking_lot::RwLock::new(
                AgentBatch::from_agent_states(
                    *agent_state_group,
                    &create_parameters.agent_schema,
                    MemoryId::new(create_parameters.memory_base_id),
                )?,
            )));
            message_batches.push(Arc::new(parking_lot::RwLock::new(
                MessageBatch::from_agent_states(
                    *agent_state_group,
                    &create_parameters.message_schema,
                    MemoryId::new(create_parameters.memory_base_id),
                )?,
            )));
        }

        Ok(Self {
            state: StateBatchPools {
                agent_pool: AgentBatchPool::new(agent_batches),
                message_pool: MessageBatchPool::new(message_batches),
            },
            removed_batches: Vec::new(),
            num_agents,
            group_start_indices: Arc::new(group_start_indices),
            memory_base_id: create_parameters.memory_base_id,
            message_schema: create_parameters.message_schema,
        })
    }

    /// Creates a new State object from a provided array of [`Agent`]s.
    ///
    /// Uses the schemas in the provided `sim_config` to validate the provided state, and to create
    /// the agent and message batches. The agent batches are created by splitting up the
    /// `agent_states` into groups based on the number of workers specified in `sim_config`.
    pub fn from_agent_states(
        agent_states: &[Agent],
        create_parameters: StateCreateParameters,
    ) -> Result<State> {
        let num_agents = agent_states.len();

        // Distribute agents over the expected minimum number of groups
        let target_group_size =
            (num_agents as f64 / create_parameters.target_min_groups as f64).ceil() as usize;
        // We may have lower or upper bounds on the size of an individual group so adjust for that
        let target_group_size = target_group_size.clamp(
            create_parameters.target_group_size.start,
            create_parameters.target_group_size.end,
        );

        let mut agent_state_groups = vec![];
        let mut next_index = 0;
        while next_index != num_agents {
            let this_index = next_index;
            next_index = (next_index + target_group_size).min(num_agents);
            agent_state_groups.push(&agent_states[this_index..next_index]);
        }

        Self::from_agent_groups(&agent_state_groups, num_agents, create_parameters)
    }

    // TODO: OPTIM - We should be using these to release memory, this requires propagation to the
    //   runners, otherwise this is the cause of a possible memory leak
    pub fn removed_batches(&mut self) -> &mut Vec<String> {
        &mut self.removed_batches
    }

    pub fn set_num_agents(&mut self, num_agents: usize) {
        self.num_agents = num_agents;
    }

    pub fn message_map(&self) -> Result<MessageMap> {
        MessageMap::new(&self.message_pool().read_proxies()?)
    }

    pub fn agent_pool(&self) -> &AgentBatchPool {
        &self.state.agent_pool
    }

    pub fn agent_pool_mut(&mut self) -> &mut AgentBatchPool {
        &mut self.state.agent_pool
    }

    pub fn message_pool(&self) -> &MessageBatchPool {
        &self.state.message_pool
    }

    pub fn state_mut(&mut self) -> &mut StateBatchPools {
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

    pub(crate) fn set_group_start_indices(&mut self, group_start_indices: Arc<Vec<usize>>) {
        self.group_start_indices = group_start_indices;
    }

    /// Reset the messages of the [`State`].
    ///
    /// Uses the [`MessageBatchPool`] shared memories as the base for the new message pool for
    /// [`State`].
    ///
    /// Returns the old messages so they can be used later for reference.
    ///
    /// # Performance
    ///
    /// This creates a new empty [`Message`]s column for each old column to replace, which requires
    /// creating a null bit buffer with all bits set to 1 (i.e. all valid), i.e. one bit per each
    /// agent in each group. Everything else is O(m), where `m` is the number of batches, so this
    /// function shouldn't take very long to run.
    ///
    /// [`Message`]: crate::message::Message
    pub fn reset_messages(
        &mut self,
        mut old_context_message_pool: MessageBatchPool,
    ) -> Result<MessageBatchPool> {
        let agent_proxies = self.agent_pool().read_proxies()?;
        old_context_message_pool.reset(
            &agent_proxies,
            self.memory_base_id,
            &self.message_schema,
        )?;
        Ok(std::mem::replace(
            &mut self.state.message_pool,
            old_context_message_pool,
        ))
    }
}
