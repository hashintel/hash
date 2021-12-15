use std::{fmt, sync::Arc};

use futures::future::join_all;
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

/// A state sync message with a tokio channel, so that
/// the sender of the message can wait for the state
/// sync to complete and find out whether the state
/// sync succeeded.
///
/// Fields:
/// `completion_sender`: After finishing or failing to sync state,
///                      used by the receiver/handler of the message
///                      to notify the sender of the message that the
///                      state sync completed.
/// `agent_pool`: Agent batches to load state from
/// `message_pool`: Message batches to load state from
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
    /// Create child messages with the same payload as `self`, which must complete
    /// for `self` to be complete.
    pub fn create_children(&self, n_children: usize) -> (Vec<Self>, Vec<SyncCompletionReceiver>) {
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

    /// Wait for all child messages to be handled and then send that
    /// `self` was handled. If any errors occurred while handling a
    /// child message, send that an error occurred while handling `self`.
    /// TODO: Return Result (instead of `expect`) and
    ///       handle where this function is awaited.
    ///
    /// Usage:
    /// let (child_msgs, child_receivers) = self.create_children(2);
    /// // Send `child_msgs` to appropriate message handlers.
    /// self.forward_children(child_receivers).await;
    pub async fn forward_children(self, child_receivers: Vec<SyncCompletionReceiver>) {
        log::trace!("Getting state sync completions");
        let child_results: Vec<_> = join_all(child_receivers).await;
        log::trace!("Got all state sync completions");
        let result = child_results
            .into_iter()
            .map(|recv_result| {
                recv_result.expect("Couldn't receive waitable sync result from child")
            })
            .collect::<WorkerResult<Vec<()>>>()
            .map(|_| ());
        self.completion_sender
            .send(result)
            .expect("Couldn't send waitable sync result to engine");
        log::trace!("Sent main state sync completion");
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
