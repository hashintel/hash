mod error;
pub mod run;
pub mod runs;
pub mod sim_control;

use std::sync::Arc;

use execution::package::simulation::{
    output::persistence::SimulationOutputPersistence, SimulationId,
};
use tokio::task::JoinHandle;
use tracing::Instrument;

pub use self::{
    error::{Error, Result},
    sim_control::SimControl,
};
use crate::{
    config::SimRunConfig,
    experiment::controller::comms::{
        sim_status::SimStatusSend,
        simulation::{new_pair, SimCtlRecv, SimCtlSend},
    },
    simulation::{comms::Comms, package::run::Packages},
};

pub struct SimulationController {
    pub sender: SimCtlSend,
    pub task_handle: JoinHandle<Result<SimulationId>>,
}

impl SimulationController {
    pub fn new<P: SimulationOutputPersistence>(
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

fn new_task_handle<P: SimulationOutputPersistence>(
    config: Arc<SimRunConfig>,
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
