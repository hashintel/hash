use std::{collections::HashMap, sync::Arc};

use simulation_structure::SimulationShortId;

use crate::{
    config::ExperimentConfig,
    experiment::{
        controller::comms::{exp_pkg_ctl::ExpPkgCtlSend, exp_pkg_update::ExpPkgUpdateRecv},
        error::{Error, Result},
        ExperimentControl,
    },
    proto::SimpleExperimentConfig,
};

pub struct SimpleExperiment {
    _experiment_config: Arc<ExperimentConfig>,
    // TODO: unused, remove?
    config: SimpleExperimentConfig,
}

struct SimProgress {
    n_steps: usize,
    stopped: bool,
}

struct SimQueue<'a> {
    max_num_steps: usize,
    pkg_to_exp: &'a mut ExpPkgCtlSend,
    pending_iter: &'a mut (dyn Iterator<Item = (SimulationShortId, &'a serde_json::Value)> + Send),
    active: HashMap<SimulationShortId, SimProgress>,
    finished: HashMap<SimulationShortId, SimProgress>,
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
                    ((sim_idx + 1) as SimulationShortId, props)
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
