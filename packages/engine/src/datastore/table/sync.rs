use std::{fmt, sync::Arc};

use parking_lot::RwLock;

use crate::{
    datastore::{
        prelude::ContextBatch,
        table::pool::{agent::AgentPool, message::MessagePool},
    },
    simulation::comms::message::{SyncCompletionReceiver, SyncCompletionSender},
    worker::{
        error::{Error as WorkerError, Result as WorkerResult},
        runner::comms::inbound::InboundToRunnerMsgPayload,
    },
};

#[derive(derive_new::new)]
pub struct WaitableStateSync {
    pub completion_sender: SyncCompletionSender,
    pub agent_pool: AgentPool,
    pub message_pool: MessagePool,
}

impl fmt::Debug for WaitableStateSync {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> Result<(), fmt::Error> {
        f.write_str("WaitableStateSync(...)")
    }
}

impl WaitableStateSync {
    /// Wait for all child messages to be handled before sending that this message was handled.
    pub fn children(&self, n_children: usize) -> (Vec<Self>, Vec<SyncCompletionReceiver>) {
        let mut child_msgs = Vec::new();
        let mut child_receivers = Vec::new();
        for _ in 0..n_children {
            let (sender, receiver) = tokio::sync::oneshot::channel();
            child_receivers.push(receiver);
            child_msgs.push(Self {
                completion_sender: sender,
                agent_pool: self.agent_pool.clone(),
                message_pool: self.message_pool.clone(),
            });
        }
        (child_msgs, child_receivers)
    }
}

#[derive(derive_new::new, Clone)]
pub struct StateSync {
    pub agent_pool: AgentPool,
    pub message_pool: MessagePool,
}

impl fmt::Debug for StateSync {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> Result<(), fmt::Error> {
        f.write_str("StateSync(...)")
    }
}

#[derive(derive_new::new, Clone)]
pub struct ContextBatchSync {
    pub context_batch: Arc<RwLock<ContextBatch>>,
    pub state_group_start_indices: Arc<Vec<usize>>,
}

impl fmt::Debug for ContextBatchSync {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> Result<(), fmt::Error> {
        f.write_str("ContextBatchSync(...)")
    }
}

#[derive(Debug)]
pub enum SyncPayload {
    // Agent state which is to be mutated within a step
    State(WaitableStateSync),
    // Snapshot of agent state from the beginning of the
    // step, which the context refers to
    StateSnapshot(StateSync),
    // Context batch, which the context also refers to
    ContextBatch(ContextBatchSync),
}

impl SyncPayload {
    pub fn try_clone(&self) -> WorkerResult<Self> {
        match self {
            Self::State(_) => Err(WorkerError::from("Waitable sync message can't be cloned")),
            Self::StateSnapshot(s) => Ok(Self::StateSnapshot(s.clone())),
            Self::ContextBatch(s) => Ok(Self::ContextBatch(s.clone())),
        }
    }
}

impl From<SyncPayload> for InboundToRunnerMsgPayload {
    fn from(payload: SyncPayload) -> Self {
        match payload {
            SyncPayload::State(s) => Self::StateSync(s),
            SyncPayload::StateSnapshot(s) => Self::StateSnapshotSync(s),
            SyncPayload::ContextBatch(c) => Self::ContextBatchSync(c),
        }
    }
}
