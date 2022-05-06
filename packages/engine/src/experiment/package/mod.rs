pub mod simple;
pub mod single;

use std::sync::Arc;

use simulation_structure::SimulationShortId;
use tokio::task::JoinHandle;

use crate::{
    config::ExperimentConfig,
    experiment::{
        controller::comms::{exp_pkg_ctl::ExpPkgCtlRecv, exp_pkg_update::ExpPkgUpdateSend},
        error::Result,
        init_exp_package,
    },
    proto::{ExperimentRunTrait, PackageConfig},
};

pub struct ExperimentPackageComms {
    pub step_update_sender: ExpPkgUpdateSend,
    pub ctl_recv: ExpPkgCtlRecv,
}

pub struct ExperimentPackage {
    pub join_handle: JoinHandle<Result<()>>,
    pub comms: ExperimentPackageComms,
}

impl ExperimentPackage {
    pub async fn new(exp_config: Arc<ExperimentConfig>) -> Result<ExperimentPackage> {
        let (ctl_send, ctl_recv) = super::controller::comms::exp_pkg_ctl::new_pair();
        let package_config = match exp_config.run.package_config() {
            PackageConfig::ExperimentPackageConfig(package_config) => package_config,
            _ => unreachable!(),
        };
        let (step_update_sender, exp_pkg_update_recv) =
            super::controller::comms::exp_pkg_update::new_pair();
        let join_handle = init_exp_package(
            exp_config.clone(),
            package_config.clone(),
            ctl_send,
            exp_pkg_update_recv,
        )?;
        let comms = ExperimentPackageComms {
            step_update_sender,
            ctl_recv,
        };

        Ok(ExperimentPackage { join_handle, comms })
    }
}

#[derive(Debug)]
pub struct StepUpdate {
    pub sim_id: SimulationShortId,
    pub was_error: bool,
    pub stop_signal: bool,
}
