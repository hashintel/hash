use serde::{Deserialize, Serialize};

use crate::{
    package::{
        experiment::comms::{control::ExpPkgCtlSend, update::ExpPkgUpdateRecv, ExperimentControl},
        simulation::SimulationId,
    },
    Error, Result,
};

#[derive(Serialize, Deserialize, Eq, PartialEq, Debug, Clone)]
pub struct SingleRunExperimentConfig {
    /// Number of steps the run should go for
    #[serde(rename = "numSteps")]
    pub num_steps: usize,
}

pub struct SingleRunExperiment {
    config: SingleRunExperimentConfig,
}

impl SingleRunExperiment {
    pub fn new(config: SingleRunExperimentConfig) -> Result<SingleRunExperiment> {
        Ok(SingleRunExperiment { config })
    }

    pub async fn run(
        self,
        mut pkg_to_exp: ExpPkgCtlSend,
        mut pkg_from_exp: ExpPkgUpdateRecv,
    ) -> Result<()> {
        tracing::debug!("Calling run on single package");
        let msg = ExperimentControl::StartSim {
            span_id: tracing::Span::current().id(),
            sim_id: SimulationId::new(1),
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
