use stateful::proxy::BatchPool;

use crate::datastore::{
    batch::{AgentBatch, MessageBatch},
    error::Result,
    table::{
        pool::{agent::AgentPool, message::MessagePool},
        proxy::{StateReadProxy, StateWriteProxy},
        references::MessageMap,
    },
};

#[derive(Clone)]
pub struct StatePools {
    pub agent_pool: AgentPool,
    pub message_pool: MessagePool,
}

impl StatePools {
    pub fn empty() -> Self {
        Self {
            agent_pool: AgentPool::empty(),
            message_pool: MessagePool::empty(),
        }
    }

    pub fn read(&self) -> Result<StateReadProxy> {
        StateReadProxy::new(self)
    }

    pub fn write(&mut self) -> Result<StateWriteProxy> {
        StateWriteProxy::new(self)
    }

    pub fn len(&self) -> usize {
        debug_assert_eq!(self.agent_pool.len(), self.message_pool.len());
        self.agent_pool.len()
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }
}

impl Extend<(AgentBatch, MessageBatch)> for StatePools {
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

pub struct StateSnapshot {
    pub state: StatePools,
    pub message_map: MessageMap,
}
