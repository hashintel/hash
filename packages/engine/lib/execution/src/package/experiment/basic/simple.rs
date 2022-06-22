use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::{
    package::{
        experiment::{
            comms::{control::ExpPkgCtlSend, update::ExpPkgUpdateRecv, ExperimentControl},
            ExperimentName,
        },
        simulation::SimulationId,
    },
    Error, Result,
};

pub struct SimpleExperiment {
    config: SimpleExperimentConfig,
}

struct SimProgress {
    n_steps: usize,
    stopped: bool,
}

struct SimQueue<'a> {
    max_num_steps: usize,
    pkg_to_exp: &'a mut ExpPkgCtlSend,
    pending_iter: &'a mut (dyn Iterator<Item = (SimulationId, &'a serde_json::Value)> + Send),
    active: HashMap<SimulationId, SimProgress>,
    finished: HashMap<SimulationId, SimProgress>,
}

impl<'a> SimQueue<'a> {
    async fn start_sim_if_available(&mut self) -> Result<()> {
        if let Some((sim_id, changed_props)) = self.pending_iter.next() {
            self.active.insert(sim_id, SimProgress {
                n_steps: 0,
                stopped: false,
            });
            let msg = ExperimentControl::StartSim {
                span_id: tracing::Span::current().id(),
                sim_id,
                changed_globals: changed_props.clone(),
                max_num_steps: self.max_num_steps,
            };
            self.pkg_to_exp.send(msg).await?;
        }

        Ok(())
    }
}

// TODO: investigate if the renames are still needed
#[derive(Serialize, Deserialize, Eq, PartialEq, Debug, Clone)]
pub struct SimpleExperimentConfig {
    /// The experiment name
    pub experiment_name: ExperimentName,
    /// The global properties changed for each simulation run
    #[serde(rename = "changedProperties")]
    pub changed_globals: Vec<serde_json::Value>,
    /// Number of steps each run should go for
    #[serde(rename = "numSteps")]
    pub num_steps: usize,
    /// Maximum amount of simulations that can be ran in parallel - None is unlimited
    pub max_sims_in_parallel: Option<usize>,
}

impl SimpleExperiment {
    pub fn new(config: SimpleExperimentConfig) -> Result<SimpleExperiment> {
        Ok(SimpleExperiment { config })
    }

    pub async fn run(
        self,
        mut pkg_to_exp: ExpPkgCtlSend,
        mut exp_pkg_update_recv: ExpPkgUpdateRecv,
    ) -> Result<()> {
        let max_num_steps = self.config.num_steps;
        let num_sims = self.config.changed_globals.len();
        let max_sims_in_parallel = self.config.max_sims_in_parallel.unwrap_or(num_sims);

        let mut queued_iter =
            self.config
                .changed_globals
                .iter()
                .enumerate()
                .map(|(sim_idx, props)| {
                    // We sometimes use 0 as a default/null value, therefore it's not a valid
                    // SimulationShortId
                    (SimulationId::new(sim_idx as u32 + 1), props)
                });

        let mut sim_queue = SimQueue {
            pending_iter: &mut queued_iter,
            max_num_steps,
            pkg_to_exp: &mut pkg_to_exp,
            active: HashMap::new(),
            finished: HashMap::new(),
        };

        tracing::trace!("Starting {max_sims_in_parallel} sims in parallel");
        for _ in 0..max_sims_in_parallel {
            sim_queue.start_sim_if_available().await?;
        }

        loop {
            let response = exp_pkg_update_recv.recv().await.ok_or_else(|| {
                Error::ExperimentRecv(
                    "Experiment main loop closed when experiment package was still running".into(),
                )
            })?;

            if response.was_error || response.stop_signal {
                let mut sim_progress =
                    sim_queue.active.remove(&response.sim_id).ok_or_else(|| {
                        tracing::warn!("Sim run with unknown id {} stopped", &response.sim_id);
                        Error::MissingSimulationRun(response.sim_id)
                    })?;

                sim_progress.stopped = true;
                sim_queue.finished.insert(response.sim_id, sim_progress);

                sim_queue.start_sim_if_available().await?;

                if sim_queue.active.is_empty() {
                    break;
                }
            } else {
                let mut sim_progress = sim_queue
                    .active
                    .get_mut(&response.sim_id)
                    .ok_or(Error::MissingSimulationRun(response.sim_id))?;

                sim_progress.n_steps += 1;

                assert!(
                    sim_progress.n_steps <= max_num_steps,
                    "{} > max_num_steps {}",
                    sim_progress.n_steps,
                    max_num_steps
                );
            }
        }
        Ok(())
    }
}
