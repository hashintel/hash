use tokio::sync::mpsc::{unbounded_channel, UnboundedReceiver, UnboundedSender};

use crate::{proto::SimulationShortId, worker::runner::comms::outbound::RunnerError};
// This is for communications between the worker pool and the simulation top-level controller.
// Mainly used only for passing errors and warnings.

pub struct WorkerPoolMsgRecv {
    pub inner: UnboundedReceiver<(SimulationShortId, WorkerPoolToExpCtlMsg)>,
}

impl WorkerPoolMsgRecv {
    #[tracing::instrument(skip_all)]
    pub async fn recv(&mut self) -> Option<(SimulationShortId, WorkerPoolToExpCtlMsg)> {
        self.inner.recv().await
    }
}

pub struct WorkerPoolMsgSend {
    pub inner: UnboundedSender<(SimulationShortId, WorkerPoolToExpCtlMsg)>,
}

#[derive(Debug)]
pub enum WorkerPoolToExpCtlMsg {
    Errors(Vec<RunnerError>),
    Warnings(Vec<RunnerError>),
    Logs(Vec<String>),
}

#[tracing::instrument(skip_all)]
pub fn new_pair() -> (WorkerPoolMsgSend, WorkerPoolMsgRecv) {
    let (send, recv) = unbounded_channel();
    (WorkerPoolMsgSend { inner: send }, WorkerPoolMsgRecv {
        inner: recv,
    })
}
