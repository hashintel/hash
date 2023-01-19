use tokio::sync::mpsc::{unbounded_channel, UnboundedReceiver, UnboundedSender};

use crate::{package::experiment::comms::ExperimentControl, Result};

pub struct ExpPkgCtlSend {
    inner: UnboundedSender<ExperimentControl>,
}

impl ExpPkgCtlSend {
    pub async fn send(&mut self, msg: ExperimentControl) -> Result<()> {
        Ok(self.inner.send(msg)?)
    }
}

pub struct ExpPkgCtlRecv {
    inner: UnboundedReceiver<ExperimentControl>,
}

impl ExpPkgCtlRecv {
    pub async fn recv(&mut self) -> Option<ExperimentControl> {
        self.inner.recv().await
    }
}

pub fn new_pair() -> (ExpPkgCtlSend, ExpPkgCtlRecv) {
    let (send, recv) = unbounded_channel();
    (ExpPkgCtlSend { inner: send }, ExpPkgCtlRecv { inner: recv })
}
