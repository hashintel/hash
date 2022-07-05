use tokio::sync::mpsc::{self, UnboundedReceiver, UnboundedSender};

use crate::{
    package::simulation::SimulationId, worker_pool::comms::message::EngineToWorkerPoolMsg, Result,
};

// TODO: move span out of msg?
pub struct MainMsgRecv {
    inner: UnboundedReceiver<EngineToWorkerPoolMsg>,
}

pub struct MainMsgSendBase {
    inner: UnboundedSender<EngineToWorkerPoolMsg>,
}

#[derive(Clone)]
pub struct MainMsgSend {
    _sim_id: SimulationId, // TODO: field never read, delete?
    inner: UnboundedSender<EngineToWorkerPoolMsg>,
}

pub fn new_no_sim() -> (MainMsgSendBase, MainMsgRecv) {
    let (send, recv) = mpsc::unbounded_channel();
    (MainMsgSendBase { inner: send }, MainMsgRecv { inner: recv })
}

impl MainMsgSend {
    pub fn send(&self, msg: EngineToWorkerPoolMsg) -> Result<()> {
        tracing::trace!("Sending msg to worker pool: {:?}", &msg);
        self.inner.send(msg)?;
        Ok(())
    }
}

impl MainMsgSendBase {
    pub fn sender_with_sim_id(&self, sim_id: SimulationId) -> MainMsgSend {
        MainMsgSend {
            _sim_id: sim_id,
            inner: self.inner.clone(),
        }
    }
}

impl MainMsgRecv {
    pub async fn recv(&mut self) -> Option<EngineToWorkerPoolMsg> {
        self.inner.recv().await
    }
}
