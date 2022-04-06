use std::fmt::{Debug, Formatter};

use stateful::proxy::{BatchReadProxy, BatchWriteProxy, PoolReadProxy, PoolWriteProxy};

use crate::datastore::{
    batch::{AgentBatch, MessageBatch},
    error::Result,
    table::{pool::BatchPool, state::view::StatePools},
};

#[derive(Clone)]
pub struct StateReadProxy {
    pub agent_proxies: PoolReadProxy<AgentBatch>,
    pub message_proxies: PoolReadProxy<MessageBatch>,
}

impl
    From<(
        Vec<BatchReadProxy<AgentBatch>>,
        Vec<BatchReadProxy<MessageBatch>>,
    )> for StateReadProxy
{
    fn from(
        batches: (
            Vec<BatchReadProxy<AgentBatch>>,
            Vec<BatchReadProxy<MessageBatch>>,
        ),
    ) -> Self {
        Self {
            agent_proxies: PoolReadProxy::from(batches.0),
            message_proxies: PoolReadProxy::from(batches.1),
        }
    }
}

impl Debug for StateReadProxy {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        f.write_str("StateReadProxy(...)")
    }
}

impl StateReadProxy {
    pub fn new(state: &StatePools) -> Result<Self> {
        Ok(StateReadProxy {
            agent_proxies: state.agent_pool.read_proxies()?,
            message_proxies: state.message_pool.read_proxies()?,
        })
    }

    // TODO: UNUSED: Needs triage
    pub fn new_partial(state: &StatePools, group_indices: &[usize]) -> Result<Self> {
        Ok(StateReadProxy {
            agent_proxies: state.agent_pool.partial_read_proxies(group_indices)?,
            message_proxies: state.message_pool.partial_read_proxies(group_indices)?,
        })
    }

    pub fn deconstruct(
        self,
    ) -> (
        Vec<BatchReadProxy<AgentBatch>>,
        Vec<BatchReadProxy<MessageBatch>>,
    ) {
        (
            self.agent_proxies.deconstruct(),
            self.message_proxies.deconstruct(),
        )
    }

    pub fn agent_pool(&self) -> &PoolReadProxy<AgentBatch> {
        &self.agent_proxies
    }

    // TODO: UNUSED: Needs triage
    pub fn agent_pool_mut(&mut self) -> &mut PoolReadProxy<AgentBatch> {
        &mut self.agent_proxies
    }

    pub fn message_pool(&self) -> &PoolReadProxy<MessageBatch> {
        &self.message_proxies
    }

    // TODO: UNUSED: Needs triage
    pub fn message_pool_mut(&mut self) -> &mut PoolReadProxy<MessageBatch> {
        &mut self.message_proxies
    }

    pub fn n_accessible_agents(&self) -> usize {
        self.agent_proxies
            .batches()
            .into_iter()
            .map(|batch| batch.num_agents())
            .sum()
    }
}

pub struct StateWriteProxy {
    agent_proxies: PoolWriteProxy<AgentBatch>,
    message_proxies: PoolWriteProxy<MessageBatch>,
}

impl Debug for StateWriteProxy {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        f.write_str("StateWriteProxy(...)")
    }
}

impl
    From<(
        Vec<BatchWriteProxy<AgentBatch>>,
        Vec<BatchWriteProxy<MessageBatch>>,
    )> for StateWriteProxy
{
    fn from(
        batches: (
            Vec<BatchWriteProxy<AgentBatch>>,
            Vec<BatchWriteProxy<MessageBatch>>,
        ),
    ) -> Self {
        Self {
            agent_proxies: PoolWriteProxy::from(batches.0),
            message_proxies: PoolWriteProxy::from(batches.1),
        }
    }
}

impl StateWriteProxy {
    pub fn new(state: &mut StatePools) -> Result<Self> {
        Ok(StateWriteProxy {
            agent_proxies: state.agent_pool.write_proxies()?,
            message_proxies: state.message_pool.write_proxies()?,
        })
    }

    // TODO: UNUSED: Needs triage
    pub fn new_partial(state: &mut StatePools, group_indices: &[usize]) -> Result<Self> {
        Ok(StateWriteProxy {
            agent_proxies: state.agent_pool.partial_write_proxies(group_indices)?,
            message_proxies: state.message_pool.partial_write_proxies(group_indices)?,
        })
    }

    pub fn deconstruct(
        self,
    ) -> (
        Vec<BatchWriteProxy<AgentBatch>>,
        Vec<BatchWriteProxy<MessageBatch>>,
    ) {
        (
            self.agent_proxies.deconstruct(),
            self.message_proxies.deconstruct(),
        )
    }

    pub fn maybe_reload(&mut self) -> Result<()> {
        for message_batch in self.message_proxies.batches_iter_mut() {
            message_batch.batch.maybe_reload()?;
        }
        for agent_batch in self.agent_proxies.batches_iter_mut() {
            agent_batch.batch.maybe_reload()?;
        }
        Ok(())
    }

    pub fn agent_pool(&self) -> &PoolWriteProxy<AgentBatch> {
        &self.agent_proxies
    }

    pub fn agent_pool_mut(&mut self) -> &mut PoolWriteProxy<AgentBatch> {
        &mut self.agent_proxies
    }

    pub fn message_pool(&self) -> &PoolWriteProxy<MessageBatch> {
        &self.message_proxies
    }

    pub fn message_pool_mut(&mut self) -> &mut PoolWriteProxy<MessageBatch> {
        &mut self.message_proxies
    }

    pub fn n_accessible_agents(&self) -> usize {
        self.agent_proxies
            .batches_iter()
            .map(AgentBatch::num_agents)
            .sum()
    }
}
