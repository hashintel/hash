use tokio::sync::mpsc::{unbounded_channel, UnboundedReceiver, UnboundedSender};

use crate::{status::SimStatus, Result};

#[derive(Clone)]
pub struct SimStatusSend {
    inner: UnboundedSender<SimStatus>,
}

impl SimStatusSend {
    pub async fn send(&mut self, msg: SimStatus) -> Result<()> {
        Ok(self.inner.send(msg)?)
    }
}

pub struct SimStatusRecv {
    inner: UnboundedReceiver<SimStatus>,
}

impl SimStatusRecv {
    pub async fn recv(&mut self) -> Option<SimStatus> {
        self.inner.recv().await
    }
}

pub fn new_pair() -> (SimStatusSend, SimStatusRecv) {
    let (send, recv) = unbounded_channel();
    (SimStatusSend { inner: send }, SimStatusRecv { inner: recv })
}
