use tokio::sync::mpsc::{unbounded_channel, UnboundedReceiver, UnboundedSender};

use crate::{controller::SimControl, Result};

pub struct SimCtlSend {
    inner: UnboundedSender<SimControl>,
}

impl SimCtlSend {
    pub async fn send(&mut self, msg: SimControl) -> Result<()> {
        Ok(self.inner.send(msg)?)
    }
}

pub struct SimCtlRecv {
    inner: UnboundedReceiver<SimControl>,
}

impl SimCtlRecv {
    pub async fn recv(&mut self) -> Option<SimControl> {
        self.inner.recv().await
    }
}

pub fn new_pair() -> (SimCtlSend, SimCtlRecv) {
    let (send, recv) = unbounded_channel();
    (SimCtlSend { inner: send }, SimCtlRecv { inner: recv })
}
