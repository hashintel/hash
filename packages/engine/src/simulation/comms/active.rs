use tokio::sync::oneshot::{channel, Receiver, Sender};

use crate::simulation::task::{
    cancel::CancelTask,
    result::{TaskResult, TaskResultOrCancelled},
};

pub struct ActiveTaskOwnerComms {
    pub result_recv: Receiver<TaskResultOrCancelled>,
    pub cancel_send: Sender<CancelTask>,
}

pub struct ActiveTaskExecutorComms {
    pub result_send: Sender<TaskResultOrCancelled>,
    pub cancel_recv: Receiver<CancelTask>,
}

// TODO OS[36] - COMPILE BLOCK - ActiveTaskOwnerComms expects a TaskResultOrCancelled but is getting a TaskResult
pub fn comms() -> (ActiveTaskOwnerComms, ActiveTaskExecutorComms) {
    let (result_send, result_recv) = channel::<TaskResult>();
    let (cancel_send, cancel_recv) = channel::<CancelTask>();
    (
        ActiveTaskOwnerComms {
            result_recv,
            cancel_send,
        },
        ActiveTaskExecutorComms {
            result_send,
            cancel_recv,
        },
    )
}
