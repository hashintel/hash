use crate::{
    agent::{AgentBatch, AgentBatchPool},
    message::{MessageBatch, MessageBatchPool, MessageMap},
    state::{StateReadProxy, StateWriteProxy},
    Result,
};

/// Unification of [`AgentBatchPool`]s and [`MessageBatchPool`]s for simultaneous access.
#[derive(Clone)]
pub struct StateBatchPools {
    pub agent_pool: AgentBatchPool,
    pub message_pool: MessageBatchPool,
}

impl StateBatchPools {
    pub fn read(&self) -> Result<StateReadProxy> {
        StateReadProxy::new(self)
    }

    pub fn write(&mut self) -> Result<StateWriteProxy> {
        StateWriteProxy::new(self)
    }
}

impl Extend<(AgentBatch, MessageBatch)> for StateBatchPools {
    fn extend<T: IntoIterator<Item = (AgentBatch, MessageBatch)>>(&mut self, iter: T) {
        let iter = iter.into_iter();
        let n = iter.size_hint().0;

        self.agent_pool.reserve(n);
        self.message_pool.reserve(n);

        for (agent_batch, message_batch) in iter {
            self.agent_pool.push(agent_batch);
            self.message_pool.push(message_batch);
        }
    }
}

/// Associates the [`StateBatchPools`] with a [`MessageMap`].
pub struct StateSnapshot {
    pub state: StateBatchPools,
    pub message_map: MessageMap,
}
