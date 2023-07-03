pub mod config;
pub mod run;
pub mod sim_configurer;

use std::{collections::HashMap, sync::Arc, time::Duration};

use execution::{
    package::{
        experiment::comms::{ExperimentControl, ExperimentPackageComms, StepUpdate},
        simulation::{output::persistence::OutputPersistenceCreator, SimulationId},
    },
    runner::comms::{DatastoreSimulationPayload, ExperimentInitRunnerMsgBase, NewSimulationRun},
    worker_pool::comms::{
        experiment::{ExpMsgSend, ExperimentToWorkerPoolMsg},
        main::MainMsgSendBase,
        terminate::TerminateRecv,
        top::{WorkerPoolMsgRecv, WorkerPoolToExpCtlMsg},
    },
};
use experiment_structure::{ExperimentConfig, PackageCreators};
use simulation_control::{
    comms::{
        control::SimCtlSend,
        status::{SimStatusRecv, SimStatusSend},
        Comms,
    },
    controller::{Packages, SimControl, SimulationController, SimulationRuns},
    EngineStatus, SimStatus,
};
use stateful::global::{Globals, SharedStore};
use tracing::{Instrument, Span};

use crate::{
    comms::{EngineMsg, OrchClient},
    controller::sim_configurer::SimConfigurer,
    environment::{self, Environment},
    Error, Result,
};

pub struct ExperimentController<P: OutputPersistenceCreator> {
    exp_config: Arc<ExperimentConfig>,
    env: Environment,
    shared_store: Arc<SharedStore>,
    worker_pool_send: ExpMsgSend,
    worker_pool_recv: WorkerPoolMsgRecv,
    experiment_package_comms: ExperimentPackageComms,
    output_persistence_service_creator: P,
    sim_run_tasks: SimulationRuns,
    sim_senders: HashMap<SimulationId, SimCtlSend>,
    worker_pool_send_base: MainMsgSendBase,
    package_creators: PackageCreators,
    sim_configurer: SimConfigurer,
    sim_status_send: SimStatusSend,
    sim_status_recv: SimStatusRecv,
    terminate_recv: TerminateRecv,
}

impl<P: OutputPersistenceCreator> ExperimentController<P> {
    /// Handle an inbound message from the orchestrator (or CLI)
    async fn handle_orch_msg(&mut self, orch_msg: EngineMsg) -> Result<()> {
        match orch_msg {
            EngineMsg::Init(_) => Err(Error::from("Unexpected init message")),
        }
    }

    async fn handle_experiment_control_msg(&mut self, msg: ExperimentControl) -> Result<()> {
        match msg {
            ExperimentControl::StartSim {
                span_id,
                sim_id,
                changed_globals,
                max_num_steps,
            } => {
                let sim_span = environment::examine(tracing::info_span!(
                    parent: span_id,
                    "sim",
                    id = &sim_id.as_u32()
                ));
                self.start_new_sim_run(sim_id, changed_globals, max_num_steps)
                    .instrument(sim_span)
                    .await?;
            }
            ExperimentControl::PauseSim { sim_id, span_id } => {
                let sim_span = environment::examine(tracing::info_span!(
                    parent: span_id,
                    "sim",
                    id = &sim_id.as_u32()
                ));
                self.pause_sim_run(sim_id).instrument(sim_span).await?
            }
            ExperimentControl::ResumeSim { sim_id, span_id } => {
                let sim_span = environment::examine(tracing::info_span!(
                    parent: span_id,
                    "sim",
                    id = &sim_id.as_u32()
                ));
                self.resume_sim_run(sim_id).instrument(sim_span).await?
            }
            ExperimentControl::StopSim { sim_id, span_id } => {
                let sim_span = environment::examine(tracing::info_span!(
                    parent: span_id,
                    "sim",
                    id = &sim_id.as_u32()
                ));
                self.stop_sim_run(sim_id).instrument(sim_span).await?
            }
        }
        Ok(())
    }

    async fn handle_sim_status(&mut self, status: SimStatus) -> Result<()> {
        // Send Step update to experiment package
        let send_step_update = self
            .experiment_package_comms
            .step_update_sender
            .send(StepUpdate {
                sim_id: status.sim_id,
                was_error: status.error.is_some(),
                stop_signal: status.stop_signal,
            })
            .await
            .map_err(|exp_controller_err| {
                Error::from(format!(
                    "Experiment controller error: {:?}",
                    exp_controller_err
                ))
            });

        if let Err(err) = send_step_update {
            if !status.running || status.stop_signal {
                // non-fatal error if the sim is stopping
                tracing::debug!(
                    "Failed to send the step update to the experiment package, logging rather \
                     than error as simulation has been marked as ending this step: {}",
                    err.to_string()
                )
            } else {
                return Err(err);
            }
        }

        // Send Sim Status to the orchestration client
        self.orch_client()
            .send(EngineStatus::SimStatus(status))
            .await
    }

    async fn handle_sim_run_stop(&mut self, id: SimulationId) -> Result<()> {
        self.orch_client().send(EngineStatus::SimStop(id)).await
    }

    async fn handle_worker_pool_msg(
        &mut self,
        id: SimulationId,
        msg: WorkerPoolToExpCtlMsg,
    ) -> Result<()> {
        let engine_status = match msg {
            WorkerPoolToExpCtlMsg::RunnerErrors(errors) => {
                tracing::debug!(
                    "Received RunnerErrors Experiment Control Message from Worker Pool"
                );
                let runner_errors = errors.into_iter().map(|w| w.into_sendable(false)).collect();
                EngineStatus::RunnerErrors(id, runner_errors)
            }
            WorkerPoolToExpCtlMsg::RunnerWarnings(warnings) => {
                tracing::debug!(
                    "Received RunnerWarnings Experiment Control Message from Worker Pool"
                );
                let runner_warnings = warnings
                    .into_iter()
                    .map(|w| w.into_sendable(true))
                    .collect();
                EngineStatus::RunnerWarnings(id, runner_warnings)
            }
            WorkerPoolToExpCtlMsg::Logs(logs) => {
                tracing::debug!("Received Logs Experiment Control Message from Worker Pool");
                EngineStatus::Logs(id, logs)
            }
            WorkerPoolToExpCtlMsg::UserErrors(errors) => {
                tracing::debug!("Received UserErrors Experiment Control Message from Worker Pool");
                EngineStatus::UserErrors(id, errors)
            }
            WorkerPoolToExpCtlMsg::UserWarnings(warnings) => {
                tracing::debug!(
                    "Received UserWarnings Experiment Control Message from Worker Pool"
                );
                EngineStatus::UserWarnings(id, warnings)
            }
            WorkerPoolToExpCtlMsg::PackageError(error) => {
                tracing::debug!(
                    "Received PackageError Experiment Control Message from Worker Pool"
                );
                EngineStatus::PackageError(id, error)
            }
        };
        self.orch_client().send(engine_status).await?;
        Ok(())
    }

    async fn start_new_sim_run(
        &mut self,
        sim_short_id: SimulationId,
        changed_globals: serde_json::Value,
        max_num_steps: usize,
    ) -> Result<()> {
        tracing::info!("Starting a new run");
        let worker_pool_sender = self.worker_pool_send_base.sender_with_sim_id(sim_short_id);

        // Create the `globals.json` for the simulation
        let globals = Arc::new(
            apply_globals_changes(self.exp_config.base_globals.clone(), &changed_globals)
                .map_err(|experiment_err| Error::from(experiment_err.to_string()))?,
        );

        // Create the datastore configuration (requires schemas)
        let schema = self.package_creators.create_schema(
            &self.exp_config.experiment_run.simulation().package_init,
            &globals,
        )?;
        // Create the persistence configuration
        let persistence_config = self
            .package_creators
            .create_persistent_config(&self.exp_config, &globals)?;
        // Start the persistence service
        let persistence_service = self
            .output_persistence_service_creator
            .new_simulation(sim_short_id, &persistence_config)?;

        // Create the Simulation top level config
        let sim_config = Arc::new(self.sim_configurer.configure_next(
            Arc::clone(&self.exp_config),
            sim_short_id,
            (*globals).clone(),
            schema,
            persistence_config,
            max_num_steps,
        ));

        let task_comms = Comms::new(sim_short_id, worker_pool_sender)?;

        // Create the packages which will be running in the engine
        let (packages, sim_start_msgs) =
            Packages::from_package_creators(&self.package_creators, &sim_config, &task_comms)?;

        let datastore_payload = DatastoreSimulationPayload::new(
            sim_config.simulation_config().schema.agent_schema.clone(),
            sim_config
                .simulation_config()
                .schema
                .message_schema
                .arrow
                .clone(),
            sim_config
                .simulation_config()
                .schema
                .context_schema
                .arrow
                .clone(),
            Arc::downgrade(&self.shared_store),
        );
        // Register the new simulation with the worker pool
        self.worker_pool_send
            .send(ExperimentToWorkerPoolMsg::NewSimulationRun(
                NewSimulationRun {
                    span: Span::current(),
                    short_id: sim_short_id,
                    worker_allocation: Arc::clone(
                        &sim_config.simulation_config().worker_allocation,
                    ),
                    packages: sim_start_msgs,
                    datastore: datastore_payload,
                    globals: globals.clone(),
                },
            ))
            .await?;

        let sim_controller = SimulationController::new(
            sim_config,
            task_comms,
            packages,
            persistence_service,
            self.sim_status_send.clone(),
        )?;
        let sim_sender = sim_controller.sender;
        self.add_sim_sender(sim_short_id, sim_sender)?;
        self.sim_run_tasks.new_run(sim_controller.task_handle);

        // Register run with the orchestrator
        self.orch_client()
            .send(EngineStatus::SimStart {
                sim_id: sim_short_id,
                globals: (*globals).clone(),
            })
            .await?;
        Ok(())
    }

    async fn pause_sim_run(&mut self, sim_short_id: SimulationId) -> Result<()> {
        self.send_sim(sim_short_id, SimControl::Pause).await?;
        Ok(())
    }

    async fn resume_sim_run(&mut self, sim_short_id: SimulationId) -> Result<()> {
        self.send_sim(sim_short_id, SimControl::Resume).await?;
        Ok(())
    }

    async fn stop_sim_run(&mut self, sim_short_id: SimulationId) -> Result<()> {
        self.send_sim(sim_short_id, SimControl::Stop).await?;
        Ok(())
    }

    async fn send_sim(&mut self, sim_short_id: SimulationId, msg: SimControl) -> Result<()> {
        if let Some(sender) = self.sim_senders.get_mut(&sim_short_id) {
            sender.send(msg).await?;
            Ok(())
        } else {
            Err(Error::from(format!(
                "Simulation with short id {} does not exist",
                sim_short_id
            )))
        }
    }

    pub async fn exp_init_msg_base(&self) -> Result<ExperimentInitRunnerMsgBase> {
        let pkg_start_msgs = self.package_creators.init_message()?;
        Ok(ExperimentInitRunnerMsgBase {
            experiment_id: self.exp_config.experiment_run.id(),
            shared_context: Arc::downgrade(&self.shared_store),
            package_config: Arc::new(pkg_start_msgs),
            runner_config: self
                .exp_config
                .worker_pool
                .worker_config
                .runner_config
                .clone(),
        })
    }

    fn add_sim_sender(&mut self, sim_short_id: SimulationId, sender: SimCtlSend) -> Result<()> {
        if self.sim_senders.contains_key(&sim_short_id) {
            let msg = "Cannot mutate a simulation control msg sender";
            tracing::error!("{}, sim short id: {}", msg, sim_short_id);
            return Err(Error::from(msg));
        }
        self.sim_senders.insert(sim_short_id, sender);
        Ok(())
    }

    fn orch_client(&mut self) -> &mut OrchClient {
        &mut self.env.orch_client
    }
}

impl<P: OutputPersistenceCreator> ExperimentController<P> {
    pub async fn run(mut self) -> Result<()> {
        let mut terminate_recv = self.terminate_recv.take_recv()?;

        let mut waiting_for_completion = None;
        let mut time_to_wait = 3;
        const WAITING_MULTIPLIER: u64 = 3;

        loop {
            tokio::select! {
                Some(msg) = self.experiment_package_comms.ctl_recv.recv() => {
                    tracing::debug!("Handling experiment control message: {:?}", &msg);
                    self.handle_experiment_control_msg(msg).await?;
                }
                result = self.sim_run_tasks.next() => {
                    if let Some(result) = result.map_err(|_| Error::from("Couldn't join `sim_run_tasks.next()`"))? {
                        self.handle_sim_run_stop(result?).await?;

                        if self.sim_run_tasks.is_empty() && waiting_for_completion.is_some() {
                            tracing::debug!("Stopping experiment controller");
                            return Ok(())
                        }

                        tracing::trace!("There was a result from a sim run but: self.sim_run_tasks.is_empty(): {}, waiting_for_completion.is_some(): {} so continuing", self.sim_run_tasks.is_empty(), waiting_for_completion.is_some());
                    }
                }
                Some(msg) = self.sim_status_recv.recv() => {
                    self.handle_sim_status(msg).await?;
                }
                msg = self.worker_pool_recv.recv() => {
                    if let Some((id, msg)) = msg {
                        self.handle_worker_pool_msg(id, msg).await?;
                    }
                }
                Ok(msg) = self.env.orch_listener.recv::<EngineMsg>() => {
                    self.handle_orch_msg(msg).await?;
                }
                terminate_res = &mut terminate_recv, if waiting_for_completion.is_none() => {
                    terminate_res.map_err(|err| Error::from(format!("Couldn't receive terminate: {:?}", err)))?;
                    tracing::trace!("Received terminate message");

                    if self.sim_run_tasks.is_empty() {
                        tracing::debug!("Stopping experiment controller");
                        return Ok(())
                    } else {
                        tracing::trace!("sim_run_tasks wasn't empty, starting a wait and warn loop");
                        waiting_for_completion = Some(Box::pin(tokio::time::sleep(Duration::from_secs(time_to_wait))));
                    }
                }
                _ = async { waiting_for_completion.as_mut().expect("must be some").await }, if waiting_for_completion.is_some() => {
                    time_to_wait *= WAITING_MULTIPLIER;
                    tracing::warn!("Experiment Controller received a termination message, but simulation runs haven't finished, waiting {} seconds", time_to_wait);
                    waiting_for_completion = Some(Box::pin(tokio::time::sleep(Duration::from_secs(time_to_wait))));
                }
            }
        }
    }
}

#[allow(clippy::too_many_arguments)]
impl<P: OutputPersistenceCreator> ExperimentController<P> {
    pub fn new(
        exp_config: Arc<ExperimentConfig>,
        env: Environment,
        shared_store: Arc<SharedStore>,
        worker_pool_send: ExpMsgSend,
        worker_pool_recv: WorkerPoolMsgRecv,
        experiment_package_comms: ExperimentPackageComms,
        output_persistence_service_creator: P,
        worker_pool_send_base: MainMsgSendBase,
        package_creators: PackageCreators,
        sim_configurer: SimConfigurer,
        sim_status_send: SimStatusSend,
        sim_status_recv: SimStatusRecv,
        terminate_recv: TerminateRecv,
    ) -> Self {
        ExperimentController {
            exp_config,
            env,
            shared_store,
            worker_pool_send,
            worker_pool_recv,
            experiment_package_comms,
            output_persistence_service_creator,
            sim_run_tasks: Default::default(),
            sim_senders: Default::default(),
            worker_pool_send_base,
            package_creators,
            sim_configurer,
            sim_status_send,
            sim_status_recv,
            terminate_recv,
        }
    }
}

fn set_nested_global_property(
    map: &mut serde_json::Map<String, serde_json::Value>,
    property_path: Vec<&str>,
    new_value: serde_json::Value,
    cur_map_depth: usize,
) -> Result<()> {
    let name = property_path[cur_map_depth];
    if cur_map_depth == property_path.len() - 1 {
        // Last (i.e. deepest) nesting level
        // We allow varying properties that are not present in `globals.json`.
        let _ = map.insert(name.to_string(), new_value);
        Ok(())
    } else {
        // TODO: OS - Uninitialized nested globals
        let global_property = map
            .get_mut(name)
            .ok_or_else(|| Error::MissingChangedGlobalProperty(name.to_string()))?;
        set_nested_global_property(
            global_property
                .as_object_mut()
                .ok_or_else(|| Error::NestedPropertyNotObject(name.to_string()))?,
            property_path,
            new_value,
            cur_map_depth + 1,
        )
    }
}

pub fn apply_globals_changes(base: Globals, changes: &serde_json::Value) -> Result<Globals> {
    let mut map = base
        .0
        .as_object()
        .ok_or(Error::BaseGlobalsNotProject)?
        .clone();
    let changes = changes.as_object().ok_or(Error::ChangedGlobalsNotObject)?;
    for (property_path, changed_value) in changes.iter() {
        let property_path = property_path.split('.').collect();
        set_nested_global_property(&mut map, property_path, changed_value.clone(), 0)?;
    }
    let globals = Globals(map.into());
    Ok(globals)
}
