use crate::datastore::{
    table::{
        pool::{agent::AgentPool, message::MessagePool, BatchPool},
        proxy::{StateReadProxy, StateWriteProxy},
        references::MessageMap,
    },
    Result,
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
}

pub struct StateSnapshot {
    pub state: StatePools,
    pub message_map: MessageMap,
}
