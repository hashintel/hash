pub mod error;
pub mod run;
pub mod runs;
pub mod sim_control;

use std::sync::Arc;

pub use error::{Error, Result};
pub use sim_control::SimControl;
use tokio::task::JoinHandle;

use super::comms::Comms;
use crate::{
    datastore::prelude::SharedStore,
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
        shared_store: Arc<SharedStore>,
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
            shared_store,
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
    shared_store: Arc<SharedStore>,
    persistence_service: P,
) -> Result<JoinHandle<Result<SimulationShortId>>> {
    let task = Box::pin(run::sim_run(
        config,
        shared_store,
        comms,
        packages,
        receiver,
        sender,
        persistence_service,
    ));

    Ok(tokio::task::spawn_blocking(move || {
        tokio::runtime::Handle::current().block_on(task)
    }))
}
