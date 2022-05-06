use std::sync::Arc;

use simulation_structure::SimulationShortId;

use crate::{
    config::ExperimentConfig,
    experiment::{
        controller::comms::{exp_pkg_ctl::ExpPkgCtlSend, exp_pkg_update::ExpPkgUpdateRecv},
        error::{Error, Result},
        ExperimentControl,
    },
    proto::SingleRunExperimentConfig,
};

pub struct SingleRunExperiment {
    _experiment_config: Arc<ExperimentConfig>,
    // TODO: unused, remove?
    config: SingleRunExperimentConfig,
}

impl SingleRunExperiment {
    pub fn new(
        experiment_config: &Arc<ExperimentConfig>,
        config: SingleRunExperimentConfig,
    ) -> Result<SingleRunExperiment> {
        Ok(SingleRunExperiment {
            _experiment_config: experiment_config.clone(),
            config,
        })
    }

    pub async fn run(
        self,
        mut pkg_to_exp: ExpPkgCtlSend,
        mut pkg_from_exp: ExpPkgUpdateRecv,
    ) -> Result<()> {
        tracing::debug!("Calling run on single package");
        let msg = ExperimentControl::StartSim {
            span_id: tracing::Span::current().id(),
            sim_id: 1 as SimulationShortId,
            changed_globals: serde_json::Map::new().into(), // Don't change globals
            max_num_steps: self.config.num_steps,
        };
        pkg_to_exp.send(msg).await?;

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
        tracing::debug!("Experiment package exiting");
        Ok(())
    }
}
