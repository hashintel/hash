use crate::proto::SimulationShortID;
use tokio::sync::mpsc::{self, UnboundedReceiver, UnboundedSender};

use crate::simulation::comms::message::EngineToWorkerPoolMsg;

use super::Result;

pub struct MainMsgRecv {
    inner: UnboundedReceiver<EngineToWorkerPoolMsg>,
}

pub struct MainMsgSendBase {
    inner: UnboundedSender<(SimulationShortID, EngineToWorkerPoolMsg)>,
}

#[derive(Clone)]
pub struct MainMsgSend {
    sim_id: SimulationShortID,
    inner: UnboundedSender<(SimulationShortID, EngineToWorkerPoolMsg)>,
}

pub fn new_no_sim() -> (MainMsgSendBase, MainMsgRecv) {
    let (send, recv) = mpsc::unbounded_channel();
    (MainMsgSendBase { inner: send }, MainMsgRecv { inner: recv })
}

impl MainMsgSend {
    pub(crate) async fn send(&self, msg: EngineToWorkerPoolMsg) -> Result<()> {
        self.inner.send((self.sim_id, msg)).await?;
        Ok(())
    }
}

impl MainMsgSendBase {
    pub fn sender_with_sim_id(&self, sim_id: SimulationShortID) -> MainMsgSend {
        MainMsgSend {
            sim_id,
            inner: self.inner.clone(),
        }
    }
}

impl MainMsgRecv {
    async fn recv(&mut self) -> Option<EngineToWorkerPoolMsg> {
        self.inner.recv()
    }
}
