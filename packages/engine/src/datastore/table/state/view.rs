use crate::datastore::table::{
    pool::{agent::AgentPool, message::MessagePool},
    references::MessageMap,
};

pub struct StateSnapshot {
    agent_pool: AgentPool,
    message_pool: MessagePool,
    message_map: MessageMap,
}

impl StateSnapshot {
    #[tracing::instrument(skip_all)]
    pub fn new(
        agent_pool: AgentPool,
        message_pool: MessagePool,
        message_map: MessageMap,
    ) -> StateSnapshot {
        StateSnapshot {
            agent_pool,
            message_pool,
            message_map,
        }
    }

    #[tracing::instrument(skip_all)]
    pub fn agent_pool(&self) -> &AgentPool {
        &self.agent_pool
    }

    #[tracing::instrument(skip_all)]
    pub fn message_pool(&self) -> &MessagePool {
        &self.message_pool
    }

    #[tracing::instrument(skip_all)]
    pub fn message_map(&self) -> &MessageMap {
        &self.message_map
    }

    #[tracing::instrument(skip_all)]
    pub fn deconstruct(self) -> (AgentPool, MessagePool) {
        (self.agent_pool, self.message_pool)
    }
}
