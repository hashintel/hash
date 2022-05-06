use std::{fmt, sync::Arc};

use futures::future::join_all;
use stateful::{context::ContextBatch, state::StateReadProxy};

use crate::{Error, Result};

pub type SyncCompletionReceiver = tokio::sync::oneshot::Receiver<Result<()>>;
pub type SyncCompletionSender = tokio::sync::oneshot::Sender<Result<()>>;

/// A state sync message with a tokio channel, so that the sender of the message can wait for the
/// state sync to complete and find out whether the state sync succeeded.
pub struct WaitableStateSync {
    /// Used by the receiver/handler of the message after finishing or failing to sync state, to
    /// notify the sender of the message that the state sync completed.
    pub completion_sender: SyncCompletionSender,
    /// Proxies to load state from
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
            .collect::<Result<Vec<()>>>()
            .map(|_| ());
        self.completion_sender
            .send(result)
            .expect("Couldn't send waitable sync result to engine");
        tracing::trace!("Sent main state sync completion");
    }
}

#[derive(Clone)]
pub struct StateSync {
    pub state_proxy: StateReadProxy,
}

impl fmt::Debug for StateSync {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> Result<(), fmt::Error> {
        f.write_str("StateSync(...)")
    }
}

#[derive(Clone)]
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
    pub fn try_clone(&self) -> Result<Self> {
        match self {
            Self::State(_) => Err(Error::from("Waitable sync message can't be cloned")),
            Self::StateSnapshot(s) => Ok(Self::StateSnapshot(s.clone())),
            Self::ContextBatch(s) => Ok(Self::ContextBatch(s.clone())),
        }
    }
}
