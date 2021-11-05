use std::{collections::HashMap, sync::Arc};

use crate::{
    config::{PersistenceConfig, StoreConfig},
    datastore::prelude::SharedStore,
    env::OrchClient,
    experiment::{apply_property_changes, ExperimentControl},
    output::OutputPersistenceCreatorRepr,
    simulation::{comms::Comms, package::creator::PackageCreators},
    worker::runner::comms::NewSimulationRun,
    workerpool::{
        self,
        comms::{
            experiment::{ExpMsgSend, ExperimentToWorkerPoolMsg},
            top::{WorkerPoolMsgRecv, WorkerPoolToExpCtlMsg},
        },
    },
    ExperimentConfig,
};
use crate::{experiment::package::ExperimentPackageComms, Environment};

use crate::proto::{
    EngineMsg, EngineStatus, ExperimentRunBase, ExperimentRunRepr, SimulationShortID,
};
use crate::simulation::controller::runs::SimulationRuns;
use crate::simulation::controller::sim_control::SimControl;
use crate::simulation::controller::SimulationController;
use crate::simulation::status::SimStatus;
use crate::simulation::Error as SimulationError;
use crate::worker::runner::comms::{DatastoreSimulationPayload, ExperimentInitRunnerMsg};

use super::comms::sim_status::SimStatusSend;
use super::{
    comms::{sim_status::SimStatusRecv, simulation::SimCtlSend},
    id_store::SimIdStore,
    sim_configurer::SimConfigurer,
    Error, Result,
};

type StopExperiment = bool;

#[derive(new)]
pub struct ExperimentController<E: ExperimentRunRepr, P: OutputPersistenceCreatorRepr> {
    exp_config: Arc<ExperimentConfig<E>>,
    exp_base_config: Arc<ExperimentConfig<ExperimentRunBase>>,
    env: Environment<E>,
    shared_store: Arc<SharedStore>,
    worker_pool_send: ExpMsgSend,
    worker_pool_controller_recv: WorkerPoolMsgRecv,
    experiment_package_comms: ExperimentPackageComms,
    output_persistence_service_creator: P,
    #[new(default)]
    sim_run_tasks: SimulationRuns,
    #[new(default)]
    sim_senders: HashMap<SimulationShortID, SimCtlSend>,
    worker_pool_send_base: workerpool::comms::main::MainMsgSendBase,
    package_creators: PackageCreators,
    sim_id_store: SimIdStore,
    sim_configurer: SimConfigurer,
    sim_status_send: SimStatusSend,
    sim_status_recv: SimStatusRecv,
}

impl<E: ExperimentRunRepr, P: OutputPersistenceCreatorRepr> ExperimentController<E, P> {
    /// Handle an inbound message from the orchestrator (or CLI)
    async fn handle_orch_msg(&mut self, orch_msg: EngineMsg<E>) -> Result<()> {
        match orch_msg {
            EngineMsg::Init(init) => Err(Error::from("Unexpected init message")),
            EngineMsg::SimRegistered(short_id, registered_id) => self
                .sim_id_store
                .set_registered_id(short_id, registered_id)
                .await
                .into(),
        }
    }

    async fn handle_experiment_control_msg(
        &mut self,
        msg: ExperimentControl,
    ) -> Result<StopExperiment> {
        match msg {
            ExperimentControl::StartSim {
                sim_id,
                changed_properties,
                max_num_steps,
            } => {
                self.start_new_sim_run(sim_id, changed_properties, max_num_steps)
                    .await?;
            }
            ExperimentControl::PauseSim(sim_short_id) => self.pause_sim_run(sim_short_id).await?,
            ExperimentControl::ResumeSim(sim_short_id) => self.resume_sim_run(sim_short_id).await?,
            ExperimentControl::StopSim(sim_short_id) => self.stop_sim_run(sim_short_id).await?,
            ExperimentControl::StopExperiment => return Ok(true),
        }
        Ok(false)
    }

    async fn handle_sim_status(&mut self, status: SimStatus) -> Result<()> {
        Ok(self
            .orch_client()
            .send(EngineStatus::SimStatus(status))
            .await?)
    }

    async fn handle_sim_run_stop(&mut self, id: SimulationShortID) -> Result<()> {
        Ok(self.orch_client().send(EngineStatus::SimStop(id)).await?)
    }

    async fn handle_worker_pool_controller_msg(
        &mut self,
        id: Option<SimulationShortID>,
        msg: WorkerPoolToExpCtlMsg,
    ) -> Result<()> {
        let engine_status = match msg {
            WorkerPoolToExpCtlMsg::Errors(errors) => {
                let runner_errors = errors.into_iter().map(|w| w.into_sendable(false)).collect();
                EngineStatus::Errors(id, runner_errors)
            }
            WorkerPoolToExpCtlMsg::Warnings(warnings) => {
                let runner_warnings = warnings
                    .into_iter()
                    .map(|w| w.into_sendable(true))
                    .collect();
                EngineStatus::Warnings(id, runner_warnings)
            }
        };
        self.orch_client().send(engine_status).await?;
        Ok(())
    }

    async fn start_new_sim_run(
        &mut self,
        sim_short_id: SimulationShortID,
        changed_properties: serde_json::Value,
        max_num_steps: usize,
    ) -> Result<()> {
        let worker_pool_sender = self.worker_pool_send_base.sender_with_sim_id(sim_short_id);
        let output_sender = self.experiment_package_comms.output_sender.clone();
        let output_request = self.experiment_package_comms.output_request.clone();

        // Create the `globals.json` for the simulation
        let globals = Arc::new(
            apply_property_changes(
                self.exp_base_config.base_globals.clone(),
                &changed_properties,
            )
            .map_err(|experiment_err| Error::from(experiment_err.to_string()))?,
        );

        // Create the datastore configuration (requires schemas)
        let store_config =
            StoreConfig::new_sim(&self.exp_base_config, &globals, &self.package_creators)?;
        // Create the persistence configuration
        let persistence_config =
            PersistenceConfig::new_sim(&self.exp_base_config, &globals, &self.package_creators)?;
        // Start the persistence service
        let persistence_service = self
            .output_persistence_service_creator
            .new_simulation(sim_short_id, &persistence_config)?;

        // Create the Simulation top level config
        let sim_config = Arc::new(self.sim_configurer.configure_next(
            &self.exp_base_config,
            sim_short_id,
            (*globals).clone(),
            store_config,
            persistence_config,
            max_num_steps,
        )?);

        let task_comms = Comms::new(sim_short_id, worker_pool_sender)?;

        // Create the packages which will be running in the engine
        let packages = self
            .package_creators
            .new_init(&sim_config, task_comms.clone())?;

        let datastore_payload = DatastoreSimulationPayload {
            agent_batch_schema: sim_config.sim.store.agent_schema.clone(),
            message_batch_schema: sim_config.sim.store.message_schema.arrow.clone(),
            context_batch_schema: sim_config.sim.store.context_schema.arrow.clone(),
            shared_store: self.shared_store.clone(),
        };
        // Register the new simulation with the worker pool
        self.worker_pool_send
            .send(ExperimentToWorkerPoolMsg::NewSimulationRun(
                // TODO OS - Need to create a PackageMsgs object
                NewSimulationRun {
                    short_id: sim_short_id,
                    packages: todo!(),
                    datastore: datastore_payload,
                    globals,
                },
            ))
            .await?;

        let sim_controller = SimulationController::new(
            sim_config,
            task_comms,
            packages,
            self.shared_store.clone(),
            persistence_service,
            output_request,
            output_sender,
            self.sim_status_send.clone(),
        )
        .map_err(|e| SimulationError::from(e))?;
        let sim_sender = sim_controller.sender;
        self.add_sim_sender(sim_short_id, sim_sender)?;
        self.sim_run_tasks.new_run(sim_controller.task_handle);

        // Register run with the orchestrator
        self.orch_client()
            .send(EngineStatus::SimStart {
                sim_id: sim_short_id,
                globals: globals.0.clone(),
            })
            .await?;
        Ok(())
    }

    async fn pause_sim_run(&mut self, sim_short_id: SimulationShortID) -> Result<()> {
        self.send_sim(sim_short_id, SimControl::Pause).await?;
        Ok(())
    }

    async fn resume_sim_run(&mut self, sim_short_id: SimulationShortID) -> Result<()> {
        self.send_sim(sim_short_id, SimControl::Resume).await?;
        Ok(())
    }

    async fn stop_sim_run(&mut self, sim_short_id: SimulationShortID) -> Result<()> {
        self.send_sim(sim_short_id, SimControl::Stop).await?;
        Ok(())
    }

    async fn send_sim(&mut self, sim_short_id: SimulationShortID, msg: SimControl) -> Result<()> {
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

    // TODO OS - runner_init_message is unimplemented for ExperimentController
    pub async fn runner_init_message(&self) -> Result<ExperimentInitRunnerMsg> {
        todo!()
    }

    fn add_sim_sender(
        &mut self,
        sim_short_id: SimulationShortID,
        sender: SimCtlSend,
    ) -> Result<()> {
        if self.sim_senders.contains_key(&sim_short_id) {
            let msg = "Cannot mutate a simulation control msg sender";
            log::error!("{}, sim short id: {}", msg, sim_short_id);
            return Err(Error::from(msg));
        }
        self.sim_senders.insert(sim_short_id, sender);
        Ok(())
    }

    fn orch_client(&mut self) -> &mut OrchClient {
        &mut self.env.orch_client
    }
}

impl<E: ExperimentRunRepr, P: OutputPersistenceCreatorRepr> ExperimentController<E, P> {
    pub async fn run(mut self) -> Result<()> {
        loop {
            tokio::select! {
                Some(msg) = self.experiment_package_comms.ctl_recv.recv() => {
                    let stop_experiment = self.handle_experiment_control_msg(msg).await?;
                    if stop_experiment {
                        return Ok(())
                    }
                }
                result = self.sim_run_tasks.next() => {
                    if let Some(result) = result.map_err(|_| Error::from("Couldn't join `sim_run_tasks.next()`"))? {
                        self.handle_sim_run_stop(result?).await?;
                    }
                }
                Some(msg) = self.sim_status_recv.recv() => {
                    self.handle_sim_status(msg).await?;
                }
                msg = self.worker_pool_controller_recv.recv() => {
                    if let Some((id, msg)) = msg {
                        self.handle_worker_pool_controller_msg(id, msg).await?;
                    }
                }
                Ok(msg) = self.env.orch_listener.recv::<EngineMsg<E>>() => {
                    self.handle_orch_msg(msg).await?;
                }
            }
        }
    }
}
