mod error;
mod packages;
mod run;
mod runs;
mod sim_control;

use std::sync::Arc;

use execution::package::simulation::{
    output::persistence::SimulationOutputPersistence, SimulationId,
};
use experiment_structure::SimulationRunConfig;
use tokio::task::JoinHandle;
use tracing::Instrument;

pub use self::{
    error::{Error, Result},
    packages::Packages,
    runs::SimulationRuns,
    sim_control::SimControl,
};
use crate::{
    comms,
    comms::{
        control::{SimCtlRecv, SimCtlSend},
        status::SimStatusSend,
        Comms,
    },
};

pub struct SimulationController {
    pub sender: SimCtlSend,
    pub task_handle: JoinHandle<Result<SimulationId>>,
}

impl SimulationController {
    pub fn new<P: SimulationOutputPersistence>(
        config: Arc<SimulationRunConfig>,
        comms: Comms,
        packages: Packages,
        persistence_service: P,
        status_sender: SimStatusSend,
    ) -> Result<SimulationController> {
        let (ctl_sender, ctl_receiver) = comms::control::new_pair();

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

fn new_task_handle<P: SimulationOutputPersistence>(
    config: Arc<SimulationRunConfig>,
    receiver: SimCtlRecv,
    sender: SimStatusSend,
    comms: Comms,
    packages: Packages,
    persistence_service: P,
) -> Result<JoinHandle<Result<SimulationId>>> {
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
