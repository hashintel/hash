//! Communications between the [`WorkerPool`] and the simulation top-level controller.
//!
//! This is mainly used only for passing errors and warnings.
//!
//! [`WorkerPool`]: crate::worker_pool::WorkerPool

use tokio::sync::mpsc::{unbounded_channel, UnboundedReceiver, UnboundedSender};

use crate::{
    package::simulation::SimulationId,
    runner::comms::{PackageError, RunnerError, UserError, UserWarning},
};

pub struct WorkerPoolMsgRecv {
    pub inner: UnboundedReceiver<(SimulationId, WorkerPoolToExpCtlMsg)>,
}

impl WorkerPoolMsgRecv {
    pub async fn recv(&mut self) -> Option<(SimulationId, WorkerPoolToExpCtlMsg)> {
        self.inner.recv().await
    }
}

pub struct WorkerPoolMsgSend {
    pub inner: UnboundedSender<(SimulationId, WorkerPoolToExpCtlMsg)>,
}

#[derive(Debug)]
pub enum WorkerPoolToExpCtlMsg {
    RunnerErrors(Vec<RunnerError>),
    RunnerWarnings(Vec<RunnerError>),
    Logs(Vec<String>),
    UserErrors(Vec<UserError>),
    UserWarnings(Vec<UserWarning>),
    PackageError(PackageError),
}

pub fn new_pair() -> (WorkerPoolMsgSend, WorkerPoolMsgRecv) {
    let (send, recv) = unbounded_channel();
    (WorkerPoolMsgSend { inner: send }, WorkerPoolMsgRecv {
        inner: recv,
    })
}
