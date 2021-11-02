use std::{convert::TryInto, fmt, sync::Arc};

use super::pool::BatchPool;
use crate::{
    datastore::prelude::{AgentBatch, ContextBatch, MessageBatch},
    worker::runner::comms::inbound::InboundToRunnerMsgPayload,
};

#[derive(new, Clone)]
pub struct StateSync {
    pub agent_pool: Box<dyn BatchPool<AgentBatch>>,
    pub message_pool: Box<dyn BatchPool<MessageBatch>>,
}

impl fmt::Debug for StateSync {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> Result<(), fmt::Error> {
        f.write_str("StateSync(...)")
    }
}

#[derive(new, Clone)]
pub struct ContextBatchSync {
    pub context_batch: Arc<ContextBatch>,
}

impl fmt::Debug for ContextBatchSync {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> Result<(), fmt::Error> {
        f.write_str("ContextBatchSync(...)")
    }
}

#[derive(Clone)]
pub enum SyncPayload {
    // Agent state which is to be mutated within a step
    State(StateSync),
    // Snapshot of agent state from the beginning of the
    // step, which the context refers to
    StateSnapshot(StateSync),
    // Context batch, which the context also refers to
    ContextBatch(ContextBatchSync),
}

impl TryInto<InboundToRunnerMsgPayload> for SyncPayload {
    type Error = crate::error::Error;

    fn try_into(self) -> Result<InboundToRunnerMsgPayload, Self::Error> {
        Ok(match self {
            SyncPayload::State(s) => InboundToRunnerMsgPayload::StateSync(s),
            SyncPayload::StateSnapshot(s) => InboundToRunnerMsgPayload::StateSnapshotSync(s),
            SyncPayload::ContextBatch(c) => InboundToRunnerMsgPayload::ContextBatchSync(c),
        })
    }
}
