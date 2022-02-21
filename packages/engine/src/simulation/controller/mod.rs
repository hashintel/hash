pub mod error;
pub mod run;
pub mod runs;
pub mod sim_control;

use std::sync::Arc;

use tokio::task::JoinHandle;
use tracing::Instrument;

pub use self::{
    error::{Error, Result},
    sim_control::SimControl,
};
use super::comms::Comms;
use crate::{
    experiment::controller::comms::{
        sim_status::SimStatusSend,
        simulation::{new_pair, SimCtlRecv, SimCtlSend},
    },
    output::SimulationOutputPersistenceRepr,
    proto::SimulationShortId,
    simulation::package::run::Packages,
    SimRunConfig,
};

pub struct SimulationController {
    pub sender: SimCtlSend,
    pub task_handle: JoinHandle<Result<SimulationShortId>>,
}

impl SimulationController {
    pub fn new<P: SimulationOutputPersistenceRepr>(
        config: Arc<SimRunConfig>,
        comms: Comms,
        packages: Packages,
        persistence_service: P,
        status_sender: SimStatusSend,
    ) -> Result<SimulationController> {
        let (ctl_sender, ctl_receiver) = new_pair();

        let task_handle = new_task_handle(
            config,
            ctl_receiver,
            status_sender,
            comms,
            packages,
            persistence_service,
        )?;
        Ok(SimulationController {
            sender: ctl_sender,
            task_handle,
        })
    }
}

fn new_task_handle<P: SimulationOutputPersistenceRepr>(
    config: Arc<SimRunConfig>,
    receiver: SimCtlRecv,
    sender: SimStatusSend,
    comms: Comms,
    packages: Packages,
    persistence_service: P,
) -> Result<JoinHandle<Result<SimulationShortId>>> {
    let task = Box::pin(run::sim_run(
        config,
        comms,
        packages,
        receiver,
        sender,
        persistence_service,
    ))
    .in_current_span();

    Ok(tokio::task::spawn_blocking(move || {
        tokio::runtime::Handle::current().block_on(task)
    }))
}
