pub mod error;
pub mod run;
pub mod runs;
pub mod sim_control;

use std::sync::Arc;

use crate::datastore::prelude::SharedStore;
use crate::experiment::controller::comms::sim_status::SimStatusSend;
use crate::experiment::controller::comms::{
    exp_pkg_update::ExpPkgUpdateSend,
    simulation::{new_pair, SimCtlRecv, SimCtlSend},
};
use crate::experiment::package::UpdateRequest;
use crate::output::SimulationOutputPersistenceRepr;
use crate::proto::{ExperimentRunBase, SimulationShortID};
use crate::simulation::packages::run::Packages;
use crate::SimRunConfig;
use tokio::task::JoinHandle;

pub use error::{Error, Result};
pub use sim_control::SimControl;

use super::comms::Comms;

pub struct SimulationController {
    pub sender: SimCtlSend,
    pub task_handle: JoinHandle<Result<SimulationShortID>>,
}

impl SimulationController {
    pub fn new<P: SimulationOutputPersistenceRepr>(
        config: Arc<SimRunConfig<ExperimentRunBase>>,
        property_changes: serde_json::Value,
        comms: Comms,
        packages: Packages,
        shared_store: Arc<SharedStore>,
        persistence_service: P,
        exp_pkg_output_request: Option<UpdateRequest>,
        exp_pkg_output_send: ExpPkgUpdateSend,
        status_sender: SimStatusSend,
    ) -> Result<SimulationController> {
        let (ctl_sender, ctl_receiver) = new_pair();

        let task_handle = new_task_handle(
            config,
            property_changes,
            ctl_receiver,
            status_sender,
            comms,
            packages,
            shared_store,
            persistence_service,
            exp_pkg_output_request,
            exp_pkg_output_send,
        )?;
        Ok(SimulationController {
            sender: ctl_sender,
            task_handle,
        })
    }
}

fn new_task_handle<P: SimulationOutputPersistenceRepr>(
    config: Arc<SimRunConfig<ExperimentRunBase>>,
    property_changes: serde_json::Value,
    receiver: SimCtlRecv,
    sender: SimStatusSend,
    comms: Comms,
    packages: Packages,
    shared_store: Arc<SharedStore>,
    persistence_service: P,
    exp_pkg_output_request: Option<UpdateRequest>,
    exp_pkg_output_send: ExpPkgUpdateSend,
) -> Result<JoinHandle<Result<SimulationShortID>>> {
    let task = run::sim_run(
        config,
        shared_store,
        comms,
        packages,
        receiver,
        sender,
        persistence_service,
        exp_pkg_output_request,
        exp_pkg_output_send,
    );

    // TODO OS - COMPILE BLOCK - P may not live long enough
    Ok(tokio::task::spawn_blocking(move || {
        tokio::runtime::Handle::current().block_on(task)
    }))
}
