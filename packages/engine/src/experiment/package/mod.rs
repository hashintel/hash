pub mod simple;
pub mod single;

use execution::package::experiment::{comms::ExperimentPackageComms, ExperimentPackageConfig};
use tokio::task::JoinHandle;

use crate::experiment::{error::Result, init_exp_package};

pub struct ExperimentPackage {
    pub join_handle: JoinHandle<Result<()>>,
    pub comms: ExperimentPackageComms,
}

impl ExperimentPackage {
    pub async fn new(config: ExperimentPackageConfig) -> Result<ExperimentPackage> {
        let (ctl_send, ctl_recv) = execution::package::experiment::comms::control::new_pair();
        let (step_update_sender, exp_pkg_update_recv) =
            execution::package::experiment::comms::update::new_pair();
        let join_handle = init_exp_package(config, ctl_send, exp_pkg_update_recv)?;
        let comms = ExperimentPackageComms {
            step_update_sender,
            ctl_recv,
        };

        Ok(ExperimentPackage { join_handle, comms })
    }
}
