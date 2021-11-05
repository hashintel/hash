use std::fmt::{Debug, Formatter};
use tokio::sync::oneshot::{channel, Receiver, Sender};

use crate::simulation::task::{
    cancel::CancelTask,
    result::{TaskResult, TaskResultOrCancelled},
};

pub struct ActiveTaskOwnerComms {
    pub result_recv: Option<Receiver<TaskResultOrCancelled>>,
    pub cancel_send: Option<Sender<CancelTask>>,
}

pub struct ActiveTaskExecutorComms {
    pub result_send: Sender<TaskResultOrCancelled>,
    pub cancel_recv: Receiver<CancelTask>,
}

impl Debug for ActiveTaskExecutorComms {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        f.write_str("ActiveTaskExecutorComms(...)")
    }
}

pub fn comms() -> (ActiveTaskOwnerComms, ActiveTaskExecutorComms) {
    let (result_send, result_recv) = channel::<TaskResultOrCancelled>();
    let (cancel_send, cancel_recv) = channel::<CancelTask>();
    (
        ActiveTaskOwnerComms {
            result_recv: Some(result_recv),
            cancel_send: Some(cancel_send),
        },
        ActiveTaskExecutorComms {
            result_send,
            cancel_recv,
        },
    )
}
