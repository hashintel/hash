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

pub mod exp_pkg_ctl {
    use tokio::sync::mpsc::{unbounded_channel, UnboundedReceiver, UnboundedSender};

    use crate::experiment::{controller::Result, ExperimentControl};

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
}

/// Handles communication between the Experiment Controller and the Experiment Packages for updates
/// at each simulation step
pub mod exp_pkg_update {
    use tokio::sync::mpsc::{unbounded_channel, UnboundedReceiver, UnboundedSender};

    use crate::experiment::{controller::Result, package::StepUpdate};

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
}
