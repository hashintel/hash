pub mod simulation {
    use tokio::sync::mpsc::{unbounded_channel, UnboundedReceiver, UnboundedSender};

    use crate::{experiment::controller::Result, simulation::controller::SimControl};

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
}

pub mod sim_status {
    use tokio::sync::mpsc::{unbounded_channel, UnboundedReceiver, UnboundedSender};

    use crate::{experiment::controller::Result, simulation::status::SimStatus};

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
}
