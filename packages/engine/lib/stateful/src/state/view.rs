use crate::{
    agent::{AgentBatch, AgentPool},
    message::{MessageBatch, MessageMap, MessagePool},
    state::{StateReadProxy, StateWriteProxy},
    Result,
};

/// Unification of [`AgentPool`]s and [`MessagePool`]s for simultaneous access.
#[derive(Clone)]
pub struct StatePools {
    pub agent_pool: AgentPool,
    pub message_pool: MessagePool,
}

impl StatePools {
    pub fn read(&self) -> Result<StateReadProxy> {
        StateReadProxy::new(self)
    }

    pub fn write(&mut self) -> Result<StateWriteProxy> {
        StateWriteProxy::new(self)
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

/// Associates the [`StatePools`] with a [`MessageMap`].
pub struct StateSnapshot {
    pub state: StatePools,
    pub message_map: MessageMap,
}
