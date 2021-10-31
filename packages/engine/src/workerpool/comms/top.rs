use crate::proto::SimulationShortID;
use tokio::sync::mpsc::{unbounded_channel, UnboundedReceiver, UnboundedSender};

use crate::worker::runner::comms::outbound::RunnerError;
// This is for communications between the worker pool and the simulation top-level controller.
// Mainly used only for passing errors and warnings.

pub struct WorkerPoolMsgRecv {
    pub inner: UnboundedReceiver<(Option<SimulationShortID>, WorkerPoolToExpCtlMsg)>,
}

pub struct WorkerPoolMsgSend {
    pub inner: UnboundedSender<(Option<SimulationShortID>, WorkerPoolToExpCtlMsg)>,
}

pub enum WorkerPoolToExpCtlMsg {
    Errors(Vec<RunnerError>),
    Warnings(Vec<RunnerError>),
}

pub fn new_pair() -> (WorkerPoolMsgSend, WorkerPoolMsgRecv) {
    let (send, recv) = unbounded_channel();
    (
        WorkerPoolMsgSend { inner: send },
        WorkerPoolMsgRecv { inner: recv },
    )
}
