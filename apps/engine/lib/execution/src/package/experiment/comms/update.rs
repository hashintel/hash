//! Communication for update the experiment packages at each simulation step.

use tokio::sync::mpsc::{unbounded_channel, UnboundedReceiver, UnboundedSender};

use crate::{package::experiment::comms::StepUpdate, Result};

#[derive(Clone)]
pub struct ExpPkgUpdateSend {
    inner: UnboundedSender<StepUpdate>,
}

impl ExpPkgUpdateSend {
    pub async fn send(&self, msg: StepUpdate) -> Result<()> {
        Ok(self.inner.send(msg)?)
    }
}

pub struct ExpPkgUpdateRecv {
    inner: UnboundedReceiver<StepUpdate>,
}

impl ExpPkgUpdateRecv {
    pub async fn recv(&mut self) -> Option<StepUpdate> {
        self.inner.recv().await
    }
}

pub fn new_pair() -> (ExpPkgUpdateSend, ExpPkgUpdateRecv) {
    let (send, recv) = unbounded_channel();
    (ExpPkgUpdateSend { inner: send }, ExpPkgUpdateRecv {
        inner: recv,
    })
}
