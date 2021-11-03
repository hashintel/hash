pub mod simple;
pub mod single;

use std::sync::Arc;

use tokio::task::JoinHandle;

use crate::{
    config::ExperimentConfig,
    init_exp_package,
    proto::{ExperimentRun, SimulationShortID},
};

use super::controller::comms::{exp_pkg_ctl::ExpPkgCtlRecv, exp_pkg_update::ExpPkgUpdateSend};
use super::Result;

pub struct ExperimentPackageComms {
    pub output_request: Option<UpdateRequest>,
    pub output_sender: ExpPkgUpdateSend,
    pub ctl_recv: ExpPkgCtlRecv,
}

pub struct ExperimentPackage {
    pub join_handle: JoinHandle<Result<()>>,
    pub comms: ExperimentPackageComms,
}

impl ExperimentPackage {
    pub async fn new(
        exp_config: Arc<ExperimentConfig<ExperimentRun>>,
    ) -> Result<ExperimentPackage> {
        let (ctl_send, ctl_recv) = super::controller::comms::exp_pkg_ctl::new_pair();
        let package_config = &exp_config.run.package_config;
        let (output_sender, exp_pkg_output_recv) =
            super::controller::comms::exp_pkg_update::new_pair();
        let (join_handle, output_request) = init_exp_package(
            exp_config.clone(),
            package_config.clone(),
            ctl_send,
            exp_pkg_output_recv,
        )?;
        let comms = ExperimentPackageComms {
            output_request,
            output_sender,
            ctl_recv,
        };

        Ok(ExperimentPackage { join_handle, comms })
    }
}

// A OutputRequest specifies what outputs an experiment package wants
// simulation runners to stream to it each step.
#[derive(Default, Debug, Clone)]
pub struct UpdateRequest {
    pub analysis_output: Option<String>,
}

impl UpdateRequest {
    pub fn none() -> UpdateRequest {
        UpdateRequest {
            analysis_output: None,
        }
    }
}

#[derive(Default, Debug)]
pub struct StepOutputResponsePayload {
    pub analysis_output: Option<Option<f64>>,
}

#[derive(Debug)]
pub struct StepUpdate {
    pub sim_id: SimulationShortID,
    pub payload: StepOutputResponsePayload,
    pub was_error: bool,
    pub stop_signal: bool,
}
