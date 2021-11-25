use super::super::{Error, ExperimentControl, Result};
use crate::config::ExperimentConfig;
use crate::experiment::controller::comms::exp_pkg_ctl::ExpPkgCtlSend;
use crate::proto::SimulationShortID;
use crate::{
    experiment::controller::comms::exp_pkg_update::ExpPkgUpdateRecv, proto::SimpleExperimentConfig,
};

use std::{collections::HashMap, sync::Arc};

pub struct SimpleExperiment {
    _experiment_config: Arc<ExperimentConfig>, // TODO: unused, remove?
    config: SimpleExperimentConfig,
}

// Returns whether to stop experiment.
fn finish_run(n_remaining: &mut isize) -> bool {
    assert!(*n_remaining > 0, "n_remaining {} <= 0", *n_remaining);
    *n_remaining -= 1;
    *n_remaining == 0
}

struct StepProgress {
    n_steps: usize,
    stopped: bool,
}

impl SimpleExperiment {
    pub fn new(
        experiment_config: &Arc<ExperimentConfig>,
        config: SimpleExperimentConfig,
    ) -> Result<SimpleExperiment> {
        Ok(SimpleExperiment {
            _experiment_config: experiment_config.clone(),
            config,
        })
    }

    pub async fn run(
        self,
        mut pkg_to_exp: ExpPkgCtlSend,
        mut exp_pkg_update_recv: ExpPkgUpdateRecv,
    ) -> Result<()> {
        let max_num_steps = self.config.num_steps;
        let mut n_sims_steps = HashMap::new();
        let num_sims = self.config.changed_properties.len();
        for (sim_id, changed_properties) in self.config.changed_properties.iter().enumerate() {
            n_sims_steps.insert(
                sim_id as SimulationShortID,
                StepProgress {
                    n_steps: 0,
                    stopped: false,
                },
            );
            let msg = ExperimentControl::StartSim {
                sim_id: sim_id as SimulationShortID,
                changed_properties: changed_properties.clone(),
                max_num_steps,
            };
            pkg_to_exp.send(msg).await?;
        }

        // Use `isize` to avoid issues with decrementing zero.
        let mut n_remaining = num_sims as isize;
        loop {
            let response = exp_pkg_update_recv.recv().await.ok_or_else(|| {
                Error::ExperimentRecv(
                    "Experiment main loop closed when experiment package was still running".into(),
                )
            })?;

            let mut maybe_step_progress = n_sims_steps.get_mut(&response.sim_id);

            if response.was_error || response.stop_signal {
                if let Some(step_progress) = &mut maybe_step_progress {
                    step_progress.stopped = true;
                } else {
                    log::warn!("Stopped sim run with unknown id {}", &response.sim_id);
                }

                if finish_run(&mut n_remaining) {
                    break;
                }
            }

            let step_progress = maybe_step_progress
                .ok_or_else(|| Error::MissingSimulationRun(response.sim_id.clone()))?;

            if !step_progress.stopped {
                step_progress.n_steps += 1;
            }

            let n_steps = step_progress.n_steps;
            assert!(
                n_steps <= max_num_steps,
                "{} > max_num_steps {}",
                n_steps,
                max_num_steps
            );

            if n_steps == max_num_steps {
                if finish_run(&mut n_remaining) {
                    break;
                }
            }
        }
        Ok(())
    }
}
