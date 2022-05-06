use tokio::sync::mpsc::{unbounded_channel, UnboundedReceiver, UnboundedSender};
use tracing::Span;

use crate::{runner::comms::NewSimulationRun, Result};

#[derive(Debug)]
pub enum ExperimentToWorkerPoolMsg {
    NewSimulationRun(NewSimulationRun),
}

pub struct ExpMsgSend {
    inner: UnboundedSender<(Span, ExperimentToWorkerPoolMsg)>,
}

impl ExpMsgSend {
    pub async fn send(&mut self, msg: ExperimentToWorkerPoolMsg) -> Result<()> {
        self.inner.send((Span::current(), msg))?;
        Ok(())
    }
}

pub struct ExpMsgRecv {
    inner: UnboundedReceiver<(Span, ExperimentToWorkerPoolMsg)>,
}

impl ExpMsgRecv {
    pub async fn recv(&mut self) -> Option<(Span, ExperimentToWorkerPoolMsg)> {
        self.inner.recv().await
    }
}

pub fn new_pair() -> (ExpMsgSend, ExpMsgRecv) {
    let (send, recv) = unbounded_channel();
    (ExpMsgSend { inner: send }, ExpMsgRecv { inner: recv })
}
