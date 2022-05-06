use std::fmt::{Debug, Formatter};

use tokio::sync::oneshot::{channel, Receiver, Sender};

use crate::task::{CancelTask, TaskResultOrCancelled};

/// Used in an [`ActiveTask`] to allow the owning Package to wait for results from the `WorkerPool`
/// about the associated [`Task`], or to send a [`CancelTask`] signal to the WorkerPool.
///
/// [`ActiveTask`]: crate::task::ActiveTask
/// [`Task`]: crate::task::Task
pub struct ActiveTaskOwnerComms {
    pub result_recv: Option<Receiver<TaskResultOrCancelled>>,
    pub cancel_send: Option<Sender<CancelTask>>,
}

/// Used by the WorkerPool to communicate with the owner (Package) of an [`ActiveTask`] to
/// forward results of the associated [`Task`] or to receive a [`CancelTask`] signal.
///
/// [`ActiveTask`]: crate::task::ActiveTask
/// [`Task`]: crate::task::Task
pub struct ActiveTaskExecutorComms {
    pub result_send: Option<Sender<TaskResultOrCancelled>>,
    pub cancel_recv: Receiver<CancelTask>,
}

impl Debug for ActiveTaskExecutorComms {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        f.write_str("ActiveTaskExecutorComms(...)")
    }
}

/// Creates a new pair of comms for communicating with an [`ActiveTask`].
///
/// [`ActiveTask`]: crate::task::ActiveTask
pub fn comms() -> (ActiveTaskOwnerComms, ActiveTaskExecutorComms) {
    let (result_send, result_recv) = channel::<TaskResultOrCancelled>();
    let (cancel_send, cancel_recv) = channel::<CancelTask>();
    (
        ActiveTaskOwnerComms {
            result_recv: Some(result_recv),
            cancel_send: Some(cancel_send),
        },
        ActiveTaskExecutorComms {
            result_send: Some(result_send),
            cancel_recv,
        },
    )
}
