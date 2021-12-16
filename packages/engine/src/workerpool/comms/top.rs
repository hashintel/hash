use tokio::sync::mpsc::{unbounded_channel, UnboundedReceiver, UnboundedSender};

use crate::{proto::SimulationShortId, worker::runner::comms::outbound::RunnerError};
// This is for communications between the worker pool and the simulation top-level controller.
// Mainly used only for passing errors and warnings.

pub struct WorkerPoolMsgRecv {
    pub inner: UnboundedReceiver<(Option<SimulationShortId>, WorkerPoolToExpCtlMsg)>,
}

impl WorkerPoolMsgRecv {
    pub async fn recv(&mut self) -> Option<(Option<SimulationShortId>, WorkerPoolToExpCtlMsg)> {
        self.inner.recv().await
    }
}

pub struct WorkerPoolMsgSend {
    pub inner: UnboundedSender<(Option<SimulationShortId>, WorkerPoolToExpCtlMsg)>,
}

#[derive(Debug)]
pub enum WorkerPoolToExpCtlMsg {
    Errors(Vec<RunnerError>),
    Warnings(Vec<RunnerError>),
    Logs(Vec<String>),
}

pub fn new_pair() -> (WorkerPoolMsgSend, WorkerPoolMsgRecv) {
    let (send, recv) = unbounded_channel();
    (WorkerPoolMsgSend { inner: send }, WorkerPoolMsgRecv {
        inner: recv,
    })
}
