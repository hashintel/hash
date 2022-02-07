use crate::datastore::table::{
    pool::{agent::AgentPool, message::MessagePool},
    references::MessageMap,
};

#[derive(Clone)]
pub struct StateView {
    pub agent_pool: AgentPool,
    pub message_pool: MessagePool,
}

pub struct StateSnapshot {
    pub state: StateView,
    pub message_map: MessageMap,
}
