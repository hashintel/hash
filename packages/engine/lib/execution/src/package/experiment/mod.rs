//! # Experiment packages
//!
//! [`ExperimentPackage`]s are aware of the metadata of a simulation run, e.g. the number of steps
//! to run a simulation. They are able to start/stop/pause a simulation.
//!
//! They are created with the [`ExperimentPackageConfig`] and can be controlled by sending
//! [`StepUpdate`] messages through [`ExperimentPackageComms`] and handling its
//! [`ExperimentControl`] messages.
//!
//! [`StepUpdate`]: comms::StepUpdate
//! [`ExperimentControl`]: comms::ExperimentControl

pub mod comms;

mod config;
mod name;
mod simple;
mod single;

use tokio::task::JoinHandle;
use tracing::Instrument;

pub use self::{
    config::{ExperimentPackageConfig, SimpleExperimentConfig, SingleRunExperimentConfig},
    name::ExperimentName,
};
use crate::{
    package::experiment::{
        comms::{control::ExpPkgCtlSend, update::ExpPkgUpdateRecv, ExperimentPackageComms},
        simple::SimpleExperiment,
        single::SingleRunExperiment,
    },
    Result,
};

pub struct ExperimentPackage {
    pub join_handle: JoinHandle<Result<()>>,
    pub comms: ExperimentPackageComms,
}

impl ExperimentPackage {
    pub async fn new(config: ExperimentPackageConfig) -> Result<ExperimentPackage> {
        let (ctl_send, ctl_recv) = comms::control::new_pair();
        let (step_update_sender, exp_pkg_update_recv) = comms::update::new_pair();
        let join_handle = Self::create_join_handle(config, ctl_send, exp_pkg_update_recv)?;
        let comms = ExperimentPackageComms {
            step_update_sender,
            ctl_recv,
        };

        Ok(ExperimentPackage { join_handle, comms })
    }

    fn create_join_handle(
        exp_package_config: ExperimentPackageConfig,
        pkg_to_exp: ExpPkgCtlSend,
        exp_pkg_update_recv: ExpPkgUpdateRecv,
    ) -> Result<JoinHandle<Result<()>>> {
        let future = match exp_package_config {
            ExperimentPackageConfig::Simple(config) => {
                let pkg = SimpleExperiment::new(config)?;
                tokio::spawn(
                    async move { pkg.run(pkg_to_exp, exp_pkg_update_recv).await }.in_current_span(),
                )
            }
            ExperimentPackageConfig::SingleRun(config) => {
                let pkg = SingleRunExperiment::new(config)?;
                tokio::spawn(
                    async move { pkg.run(pkg_to_exp, exp_pkg_update_recv).await }.in_current_span(),
                )
            }
        };
        Ok(future)
    }
}
