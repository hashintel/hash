use std::{fmt, sync::Arc};

use parking_lot::RwLock;

use crate::{
    datastore::{
        prelude::ContextBatch,
        table::pool::{agent::AgentPool, message::MessagePool},
    },
    worker::runner::comms::inbound::InboundToRunnerMsgPayload,
};

#[derive(new, Clone)]
pub struct StateSync {
    pub agent_pool: AgentPool,
    pub message_pool: MessagePool,
}

impl fmt::Debug for StateSync {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> Result<(), fmt::Error> {
        f.write_str("StateSync(...)")
    }
}

#[derive(new, Clone)]
pub struct ContextBatchSync {
    pub context_batch: Arc<RwLock<ContextBatch>>,
    pub state_group_start_indices: Arc<Vec<usize>>,
}

impl fmt::Debug for ContextBatchSync {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> Result<(), fmt::Error> {
        f.write_str("ContextBatchSync(...)")
    }
}

#[derive(Clone, Debug)]
pub enum SyncPayload {
    // Agent state which is to be mutated within a step
    State(StateSync),
    // Snapshot of agent state from the beginning of the
    // step, which the context refers to
    StateSnapshot(StateSync),
    // Context batch, which the context also refers to
    ContextBatch(ContextBatchSync),
}

impl Into<InboundToRunnerMsgPayload> for SyncPayload {
    fn into(self) -> InboundToRunnerMsgPayload {
        match self {
            SyncPayload::State(s) => InboundToRunnerMsgPayload::StateSync(s),
            SyncPayload::StateSnapshot(s) => InboundToRunnerMsgPayload::StateSnapshotSync(s),
            SyncPayload::ContextBatch(c) => InboundToRunnerMsgPayload::ContextBatchSync(c),
        }
    }
}
