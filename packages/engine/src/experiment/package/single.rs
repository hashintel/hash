use crate::experiment::controller::comms::exp_pkg_ctl::ExpPkgCtlSend;
use crate::experiment::controller::comms::exp_pkg_update::ExpPkgUpdateRecv;
use std::sync::Arc;

use super::super::{Error, ExperimentControl, Result};
use crate::config::ExperimentConfig;
use crate::proto::{
    ExperimentRun, ExperimentRunBase, SimulationShortID, SingleRunExperimentConfig,
};

pub struct SingleRunExperiment {
    experiment_config: Arc<ExperimentConfig<ExperimentRunBase>>,
    config: SingleRunExperimentConfig,
}

impl SingleRunExperiment {
    pub fn new(
        experiment_config: &Arc<ExperimentConfig<ExperimentRunBase>>,
        config: SingleRunExperimentConfig,
    ) -> Result<SingleRunExperiment> {
        Ok(SingleRunExperiment {
            experiment_config: experiment_config.clone(),
            config,
        })
    }

    pub async fn run(
        self,
        mut pkg_to_exp: ExpPkgCtlSend,
        mut pkg_from_exp: ExpPkgUpdateRecv,
    ) -> Result<()> {
        let msg = ExperimentControl::StartSim {
            sim_id: 0 as SimulationShortID,
            properties: self.experiment_config.base_globals.clone(),
            max_num_steps: self.config.num_steps,
        };
        pkg_to_exp.send(msg)?;

        loop {
            let response = pkg_from_exp.recv().await.ok_or_else(|| {
                Error::ExperimentRecv(
                    "Experiment main loop closed when experiment package was still running".into(),
                )
            })?;

            if response.stop_signal || response.was_error {
                break;
            }
        }
        log::info!("Experiment package exiting");
        Ok(())
    }
}
