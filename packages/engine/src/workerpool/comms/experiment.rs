use tokio::sync::mpsc::{unbounded_channel, UnboundedReceiver, UnboundedSender};

use crate::worker::runner::comms::NewSimulationRun;

use super::super::{Error, Result};

pub enum ExperimentToWorkerPoolMsg {
    NewSimulationRun(NewSimulationRun),
}

pub struct ExpMsgSend {
    inner: UnboundedSender<ExperimentToWorkerPoolMsg>,
}

impl ExpMsgSend {
    pub(crate) async fn send(&mut self, msg: ExperimentToWorkerPoolMsg) -> Result<()> {
        self.inner.send(msg)?;
        Ok(())
    }
}

pub struct ExpMsgRecv {
    inner: UnboundedReceiver<ExperimentToWorkerPoolMsg>,
}

impl ExpMsgRecv {
    async fn recv(&mut self) -> Option<ExperimentToWorkerPoolMsg> {
        self.inner.recv().await
    }
}

pub fn new_pair() -> (ExpMsgSend, ExpMsgRecv) {
    let (send, recv) = unbounded_channel();
    (ExpMsgSend { inner: send }, ExpMsgRecv { inner: recv })
}
