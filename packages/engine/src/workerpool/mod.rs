pub mod comms;
pub mod error;
mod pending;
pub mod runs;

use std::sync::Arc;

use crate::proto::{ExperimentRunRepr, SimulationShortID};
use crate::simulation::{
    package::id::PackageId,
    task::{args::GetTaskArgs, handler::WorkerPoolHandler},
};
use futures::future::try_join_all;
use rand::prelude::SliceRandom;
use tokio::{pin, task::JoinHandle};

use crate::config;
use crate::datastore::table::task_shared_store::TaskSharedStore;

use crate::types::{TaskID, WorkerIndex};
use crate::worker::runner::comms::{ExperimentInitRunnerMsg, NewSimulationRun};
use crate::worker::task::WorkerTask;
use crate::workerpool::comms::top::WorkerPoolToExpCtlMsg;
use crate::workerpool::comms::WorkerToWorkerPoolMsg;
use crate::{
    config::WorkerPoolConfig,
    simulation::comms::message::{EngineToWorkerPoolMsg, EngineToWorkerPoolMsgPayload},
    worker::WorkerController,
    workerpool::comms::WorkerPoolToWorkerMsg,
};

use self::comms::main::MainMsgSendBase;
use self::comms::top::WorkerPoolMsgSend;
use self::comms::WorkerCommsWithWorkerPool;
use self::pending::DistributionController;
use self::{
    comms::{
        experiment::ExperimentToWorkerPoolMsg, ExpMsgRecv, KillRecv, MainMsgRecv,
        WorkerPoolCommsWithWorkers,
    },
    pending::{PendingWorkerPoolTask, PendingWorkerPoolTasks},
    runs::SimulationRuns,
};
use crate::config::{TaskDistributionConfig, Worker};
use crate::simulation::task::Task;
pub use error::{Error, Result};

pub struct WorkerPoolController {
    worker_controllers: Option<Vec<WorkerController>>,
    comms: WorkerPoolCommsWithWorkers,
    simulation_runs: SimulationRuns,
    pending_tasks: PendingWorkerPoolTasks,
    sim_recv: MainMsgRecv,
    exp_recv: ExpMsgRecv,
    kill_recv: KillRecv,
    top_send: WorkerPoolMsgSend,
    worker_comms: Option<Vec<WorkerCommsWithWorkerPool>>,
    worker_base_config: Option<config::WorkerConfig>,
}

impl WorkerPoolController {
    pub fn new_with_sender<E: ExperimentRunRepr>(
        config: Arc<config::ExperimentConfig<E>>,
        experiment_control_recv: ExpMsgRecv,
        kill_recv: KillRecv,
        worker_pool_controller_send: WorkerPoolMsgSend,
    ) -> Result<(Self, MainMsgSendBase)> {
        let WorkerPoolConfig {
            worker_base_config,
            num_workers,
        } = (*config.worker_pool).clone();

        let (comms, worker_comms) = comms::new_pool_comms(num_workers);
        let (sim_send_base, sim_recv) = comms::new_no_sim();

        let simulation_runs = SimulationRuns::default();
        let pending_tasks = PendingWorkerPoolTasks::default();

        Ok((
            WorkerPoolController {
                worker_controllers: None,
                comms,
                simulation_runs,
                pending_tasks,
                sim_recv,
                exp_recv: experiment_control_recv,
                kill_recv,
                top_send: worker_pool_controller_send,
                worker_comms: Some(worker_comms),
                worker_base_config: Some(worker_base_config),
            },
            sim_send_base,
        ))
    }

    pub async fn spawn_workers(&mut self, runner_init: ExperimentInitRunnerMsg) -> Result<()> {
        let worker_comms = self
            .worker_comms
            .take()
            .ok_or_else(|| Error::from("missing worker comms"))?;
        let worker_base_config = self
            .worker_base_config
            .take()
            .ok_or_else(|| Error::from("missing worker base config"))?;
        self.worker_controllers = Some(
            try_join_all(worker_comms.into_iter().map(|comms| {
                WorkerController::spawn(worker_base_config.clone(), comms, runner_init.clone())
            }))
            .await
            .map_err(|e| Error::from(""))?,
        );

        Ok(())
    }

    async fn register_simulation(&mut self, payload: NewSimulationRun) -> Result<()> {
        // TODO simulation may not be registered to all workers
        self.send_to_all_workers(WorkerPoolToWorkerMsg::new_simulation_run(payload))
    }

    fn sim_runs(&mut self) -> &mut SimulationRuns {
        &mut self.simulation_runs
    }

    fn run_worker_controllers(&mut self) -> Result<JoinHandle<Result<Vec<()>>>> {
        let worker_controllers = self
            .worker_controllers
            .take()
            .ok_or_else(|| Error::MissingWorkerControllers)?;

        let futs = worker_controllers
            .into_iter()
            .map(|mut c| tokio::spawn(async move { c.run().await.map_err(Error::from) }));

        let fut = tokio::spawn(async move {
            try_join_all(futs)
                .await
                .map_err(|_| Error::from("Couldn't join!"))?
                .into_iter()
                .collect::<Result<_>>()
        });
        return Ok(fut);
    }

    pub async fn run(mut self) -> Result<()> {
        pin!(let workers = self.run_worker_controllers()?;);
        pin!(let kill_recv = self.kill_recv.take_recv()?;);
        loop {
            tokio::select! {
                Some(msg) = self.sim_recv.recv() => {
                    self.handle_sim_msg(msg).await?;
                }
                Some(msg) = self.exp_recv.recv() => {
                    self.handle_exp_msg(msg).await?;
                }
                Some((worker_index, msg)) = self.comms.recv() => {
                    self.handle_worker_msg(worker_index, msg).await?;
                }
                // Ignore if None, since this call does a cheap block
                Ok(res) = self.pending_tasks.run_cancel_check() => {
                    self.handle_cancel_msgs(res).await?;
                }
                kill_msg = &mut kill_recv => {
                    kill_msg.map_err(|err| Error::from(format!("Couldn't receive kill: {:?}", err)))?;
                    // Propagate kill msg to all workers
                    self.comms.send_kill_all().await?;
                    // Send confirmation of success
                    self.kill_recv.confirm_kill()?;
                    return Ok(())
                }
                work_res = &mut workers => {
                    work_res?;
                    return Ok(())
                }
            }
        }
    }

    async fn handle_sim_msg(&mut self, msg: EngineToWorkerPoolMsg) -> Result<()> {
        let sim_id = msg.sim_id;
        match msg.payload {
            EngineToWorkerPoolMsgPayload::Task(task_msg) => {
                let task_id = task_msg.task_id;
                let channels = task_msg.comms;
                let (tasks, distribution_controller) = self.new_worker_tasks(
                    sim_id,
                    task_id,
                    task_msg.package_id,
                    task_msg.shared_store,
                    task_msg.inner,
                )?;
                let pending =
                    PendingWorkerPoolTask::new(task_id, channels, distribution_controller);
                self.pending_tasks.inner.insert(task_id, pending);
                tasks.into_iter().try_for_each(|(worker, task)| {
                    self.send_to_worker(worker.index(), WorkerPoolToWorkerMsg::task(sim_id, task))
                })?;
            }
            EngineToWorkerPoolMsgPayload::Sync(sync_msg) => {
                self.send_to_all_workers(WorkerPoolToWorkerMsg::sync(sim_id, sync_msg))?
            }
        }
        Ok(())
    }

    async fn handle_exp_msg(&mut self, msg: ExperimentToWorkerPoolMsg) -> Result<()> {
        match msg {
            ExperimentToWorkerPoolMsg::NewSimulationRun(payload) => {
                self.register_simulation(payload).await?
            }
        }
        Ok(())
    }

    async fn handle_worker_msg(
        &mut self,
        worker: WorkerIndex,
        worker_msg: WorkerToWorkerPoolMsg,
    ) -> Result<()> {
        match worker_msg {
            WorkerToWorkerPoolMsg::TaskResultOrCancelled(res) => {
                let task_id = res.task_id.clone();
                let pending_task = self
                    .pending_tasks
                    .inner
                    .get_mut(&res.task_id)
                    .ok_or_else(|| Error::MissingPendingTask(task_id))?;
                if pending_task.handle_result_or_cancel(Worker::new(worker), res)? {
                    // Remove pending task because it has terminated (completed OR cancelled)
                    // Unwrap must work, since we've checked the key exists in the hashmap
                    self.pending_tasks.inner.remove(&task_id).unwrap();
                }
            }
            WorkerToWorkerPoolMsg::RunnerErrors(errors) => {
                self.top_send
                    .inner
                    .send((None, WorkerPoolToExpCtlMsg::Errors(errors)))?;
            }
            WorkerToWorkerPoolMsg::RunnerWarnings(warnings) => {
                self.top_send
                    .inner
                    .send((None, WorkerPoolToExpCtlMsg::Warnings(warnings)))?;
            }
        }
        Ok(())
    }

    async fn handle_cancel_msgs(&mut self, cancel_msgs: Vec<TaskID>) -> Result<()> {
        for id in cancel_msgs {
            if let Some(task) = self.pending_tasks.inner.get(&id) {
                match &task.distribution_controller {
                    DistributionController::Distributed {
                        active_workers,
                        received_results,
                        reference_task,
                    } => {
                        for worker in active_workers {
                            self.send_to_worker(
                                worker.index(),
                                WorkerPoolToWorkerMsg::cancel_task(task.task_id),
                            )?;
                        }
                    }
                    DistributionController::Single { active_worker } => {
                        self.send_to_worker(
                            active_worker.index(),
                            WorkerPoolToWorkerMsg::cancel_task(task.task_id),
                        )?;
                    }
                }
            }
        }

        Ok(())
    }

    fn send_to_worker(&self, index: WorkerIndex, msg: WorkerPoolToWorkerMsg) -> Result<()> {
        self.comms.send(index, msg).map_err(Error::from)
    }

    fn send_to_all_workers(&mut self, msg: WorkerPoolToWorkerMsg) -> Result<()> {
        self.comms.send_all(msg)
    }

    fn new_worker_tasks(
        &self,
        sim_id: SimulationShortID,
        task_id: TaskID,
        package_id: PackageId,
        shared_store: TaskSharedStore,
        task: Task,
    ) -> Result<(Vec<(Worker, WorkerTask)>, DistributionController)> {
        let worker_list = self.simulation_runs.get_worker_allocation(sim_id)?;

        let (triples, original_task) =
            if let TaskDistributionConfig::Distributed(distribution) = task.distribution() {
                let (distributed_tables, split_config) =
                    shared_store.distribute(&distribution, worker_list)?;
                let tasks: Vec<Task> = task.split_task(&split_config)?;
                let num_active_workers: usize = tasks.len();
                (
                    tasks
                        .into_iter()
                        .zip(distributed_tables.into_iter())
                        .map(|(task, (worker, store))| (worker, task, store))
                        .collect::<Vec<_>>(),
                    DistributionController::Distributed {
                        active_workers: worker_list.clone(),
                        received_results: Vec::with_capacity(worker_list.len()),
                        reference_task: task,
                    },
                )
            } else {
                let worker = worker_list
                    .choose(&mut rand::thread_rng())
                    .ok_or_else(|| Error::from("Unexpected: No Workers"))?;
                // Pass the task to the worker controller, don't keep a local copy
                (
                    vec![(worker.clone(), task, shared_store)],
                    DistributionController::Single {
                        active_worker: worker.clone(),
                    },
                )
            };

        Ok((
            triples
                .into_iter()
                .map(|(worker, task, store)| {
                    (worker, WorkerTask::new(task_id, package_id, task, store))
                })
                .collect(),
            original_task,
        ))
    }
}
