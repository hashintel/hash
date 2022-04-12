use std::{fmt, sync::Arc};

use futures::future::join_all;
use stateful::{context::ContextBatch, state::StateReadProxy};

use crate::{
    simulation::comms::message::{SyncCompletionReceiver, SyncCompletionSender},
    worker::{
        runner::comms::inbound::InboundToRunnerMsgPayload, Error as WorkerError,
        Result as WorkerResult,
    },
};

/// A state sync message with a tokio channel, so that
/// the sender of the message can wait for the state
/// sync to complete and find out whether the state
/// sync succeeded.
///
/// Fields:
/// `completion_sender`: Used by the receiver/handler of the
///                                        message after finishing or failing to
///                                        sync state, to notify the sender of the
///                                        message that the state sync completed.
/// `agent_pool`: Agent batches to load state from
/// `message_pool`: Message batches to load state from
// TODO: remove derive_new from structs with all pub fields
#[derive(derive_new::new)]
pub struct WaitableStateSync {
    pub completion_sender: SyncCompletionSender,
    pub state_proxy: StateReadProxy,
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
        (0..n_children)
            .map(|_| {
                let (sender, receiver) = tokio::sync::oneshot::channel();
                (
                    Self {
                        completion_sender: sender,
                        state_proxy: self.state_proxy.clone(),
                    },
                    receiver,
                )
            })
            .unzip()
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
        tracing::trace!("Getting state sync completions");
        let child_results: Vec<_> = join_all(child_receivers).await;
        tracing::trace!("Got all state sync completions");
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
        tracing::trace!("Sent main state sync completion");
    }
}

#[derive(derive_new::new, Clone)]
pub struct StateSync {
    pub state_proxy: StateReadProxy,
}

impl fmt::Debug for StateSync {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> Result<(), fmt::Error> {
        f.write_str("StateSync(...)")
    }
}

#[derive(derive_new::new, Clone)]
pub struct ContextBatchSync {
    pub context_batch: Arc<ContextBatch>,
    pub current_step: usize,
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
