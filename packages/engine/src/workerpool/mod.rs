//! TODO: DOC
use std::{future::Future, pin::Pin, sync::Arc};

use execution::{
    package::PackageTask,
    task::{SharedStore, Task, TaskDistributionConfig, TaskId},
    worker::{SyncPayload, WorkerConfig},
    worker_pool::{WorkerIndex, WorkerPoolConfig, WorkerPoolHandler},
};
use futures::{
    future::try_join_all,
    stream::{FuturesUnordered, StreamExt},
};
use rand::prelude::SliceRandom;
use stateful::field::PackageId;
use tokio::{pin, task::JoinHandle};
use tracing::{Instrument, Span};

pub use self::error::{Error, Result};
use self::{
    comms::{
        experiment::ExperimentToWorkerPoolMsg, main::MainMsgSendBase, top::WorkerPoolMsgSend,
        ExpMsgRecv, MainMsgRecv, TerminateRecv, WorkerCommsWithWorkerPool,
        WorkerPoolCommsWithWorkers,
    },
    pending::{DistributionController, PendingWorkerPoolTask, PendingWorkerPoolTasks},
    runs::SimulationRuns,
};
use crate::{
    config::{self},
    proto::SimulationShortId,
    simulation::comms::message::{EngineToWorkerPoolMsg, EngineToWorkerPoolMsgPayload},
    worker::{
        runner::comms::{ExperimentInitRunnerMsg, ExperimentInitRunnerMsgBase, NewSimulationRun},
        task::WorkerTask,
        WorkerController,
    },
    workerpool::comms::{
        top::WorkerPoolToExpCtlMsg, WorkerPoolToWorkerMsg, WorkerPoolToWorkerMsgPayload,
        WorkerToWorkerPoolMsg,
    },
};

pub mod comms;
mod error;
mod pending;
pub mod runs;

/// TODO: DOC
pub struct WorkerPoolController {
    worker_controllers: Option<Vec<WorkerController>>,
    comms: WorkerPoolCommsWithWorkers,
    simulation_runs: SimulationRuns,
    pending_tasks: PendingWorkerPoolTasks,
    sim_recv: MainMsgRecv,
    exp_recv: ExpMsgRecv,
    terminate_recv: TerminateRecv,
    top_send: WorkerPoolMsgSend,
    worker_comms: Option<Vec<WorkerCommsWithWorkerPool>>,
    worker_config: Option<WorkerConfig>,
}

impl WorkerPoolController {
    pub fn new_with_sender(
        config: Arc<config::ExperimentConfig>,
        experiment_control_recv: ExpMsgRecv,
        terminate_recv: TerminateRecv,
        worker_pool_controller_send: WorkerPoolMsgSend,
    ) -> Result<(Self, MainMsgSendBase)> {
        let WorkerPoolConfig {
            worker_config,
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
                terminate_recv,
                top_send: worker_pool_controller_send,
                worker_comms: Some(worker_comms),
                worker_config: Some(worker_config),
            },
            sim_send_base,
        ))
    }

    pub async fn spawn_workers(
        &mut self,
        exp_init_base: ExperimentInitRunnerMsgBase,
    ) -> Result<()> {
        let worker_comms = self
            .worker_comms
            .take()
            .ok_or_else(|| Error::from("missing worker comms"))?;
        let worker_config = self
            .worker_config
            .take()
            .ok_or_else(|| Error::from("missing worker base config"))?;
        self.worker_controllers = Some(
            try_join_all(worker_comms.into_iter().map(|comms| {
                let init = ExperimentInitRunnerMsg::new(&exp_init_base, *comms.index());
                WorkerController::spawn(worker_config.clone(), comms, init)
            }))
            .await
            .map_err(|e| Error::from(e.to_string()))?,
        );

        Ok(())
    }

    async fn register_simulation(&mut self, payload: NewSimulationRun) -> Result<()> {
        // TODO: Only send to workers that simulation run is registered with
        self.send_to_all_workers(WorkerPoolToWorkerMsg::new_simulation_run(payload))
    }

    fn run_worker_controllers(&mut self) -> Result<JoinHandle<Result<Vec<()>>>> {
        tracing::debug!("Running workers");
        let worker_controllers = self
            .worker_controllers
            .take()
            .ok_or(Error::MissingWorkerControllers)?;

        let futs = worker_controllers
            .into_iter()
            .map(|mut c| {
                tokio::spawn(async move { c.run().await.map_err(Error::from) }.in_current_span())
            })
            .collect::<Vec<_>>();

        let fut = tokio::spawn(
            async move {
                try_join_all(futs)
                    .await
                    .map_err(|_| Error::from("Couldn't join!"))?
                    .into_iter()
                    .collect::<Result<_>>()
            }
            .in_current_span(),
        );
        Ok(fut)
    }

    /// TODO: DOC
    pub async fn run(mut self) -> Result<()> {
        tracing::debug!("Running Worker Pool Controller");
        pin!(let workers = self.run_worker_controllers()?;);
        pin!(let terminate_recv = self.terminate_recv.take_recv()?;);

        // `pending_syncs` contains futures that wait for state sync responses
        // from (the handlers of) WaitableStateSync messages that the worker pool
        // has sent out.
        let pending_syncs: FuturesUnordered<Pin<Box<dyn Future<Output = ()> + Send>>> =
            FuturesUnordered::new();
        pin!(pending_syncs);

        loop {
            tokio::select! {
                Some(_) = pending_syncs.next() => {}
                Some(msg) = self.sim_recv.recv() => {
                    tracing::debug!("Handle simulation message: {:?}", msg);
                    self.handle_sim_msg(msg, &mut pending_syncs).await?;
                }
                Some((span, msg)) = self.exp_recv.recv() => {
                    tracing::debug!("Handle experiment message: {:?}", msg);
                    self.handle_exp_msg(msg).instrument(span).await?;
                }
                Some((worker_index, sim_id, msg)) = self.comms.recv() => {
                    tracing::debug!("Handle comms message for worker [{}] and simulation [{}]: {:?}", worker_index, sim_id, msg);
                    self.handle_worker_msg(worker_index, sim_id, msg).await?;
                }
                // TODO: Revisit this
                // cancel_msgs = self.pending_tasks.run_cancel_check() => {
                //     if !cancel_msgs.is_empty() {
                //         self.handle_cancel_msgs(cancel_msgs).await?;
                //     }
                // }
                terminate_msg = &mut terminate_recv => {
                    terminate_msg.map_err(|err| Error::from(format!("Couldn't receive terminate: {:?}", err)))?;
                    tracing::debug!("Sending terminate msg to all workers");
                    // Propagate terminate msg to all workers
                    self.comms.send_terminate_all().await?;
                    tracing::debug!("Confirming termination of workers");
                    // Send confirmation of success
                    self.terminate_recv.confirm_terminate()?;
                    return Ok(())
                }
                work_res = &mut workers => {
                    tracing::debug!("Worker result: {:?}", &work_res);
                    work_res??;
                    return Ok(())
                }
            }
        }
    }

    /// TODO: DOC
    async fn handle_sim_msg(
        &mut self,
        msg: EngineToWorkerPoolMsg,
        pending_syncs: &mut FuturesUnordered<Pin<Box<dyn Future<Output = ()> + Send>>>,
    ) -> Result<()> {
        let _span = msg.span.entered();
        let sim_id = msg.sim_id;
        match msg.payload {
            EngineToWorkerPoolMsgPayload::Task(task_msg) => {
                let task_id = task_msg.task_id;
                let channels = task_msg.comms;
                let (tasks, distribution_controller) = self.new_worker_subtasks(
                    sim_id,
                    task_id,
                    task_msg.package_id,
                    task_msg.shared_store,
                    task_msg.inner,
                )?;
                let pending =
                    PendingWorkerPoolTask::new(task_id, channels, distribution_controller);
                self.pending_tasks.inner.insert(task_id, pending);
                tasks.into_iter().try_for_each(|(worker_index, task)| {
                    self.send_to_worker(worker_index, WorkerPoolToWorkerMsg::task(sim_id, task))
                })?;
            }
            EngineToWorkerPoolMsgPayload::Sync(sync) => {
                let sync = if let SyncPayload::State(sync) = sync {
                    sync
                } else {
                    self.send_to_all_workers(WorkerPoolToWorkerMsg::sync(sim_id, sync))?;
                    return Ok(());
                };

                // TODO: Only send to workers that simulation run is registered with
                let (worker_msgs, worker_completion_receivers) =
                    sync.create_children(self.comms.num_workers());
                for (worker_index, msg) in worker_msgs.into_iter().enumerate() {
                    self.comms
                        .send(WorkerIndex::new(worker_index), WorkerPoolToWorkerMsg {
                            span: Span::current(),
                            sim_id: Some(sim_id),
                            payload: WorkerPoolToWorkerMsgPayload::Sync(SyncPayload::State(msg)),
                        })?;
                }
                let fut = async move {
                    let sync = sync;
                    // Capture `sync` in lambda.
                    // TODO: these types of logs are better suited as a span
                    tracing::trace!("Waiting for worker synchronization");
                    sync.forward_children(worker_completion_receivers).await;
                    tracing::trace!("Workers synchronized");
                }
                .in_current_span();
                pending_syncs.push(Box::pin(fut) as _);
            }
        }
        Ok(())
    }

    /// TODO: DOC
    async fn handle_exp_msg(&mut self, msg: ExperimentToWorkerPoolMsg) -> Result<()> {
        match msg {
            ExperimentToWorkerPoolMsg::NewSimulationRun(payload) => {
                self.simulation_runs
                    .push(payload.short_id, &payload.engine_config.worker_allocation)?;
                self.register_simulation(payload).await?
            }
        }
        Ok(())
    }

    /// TODO: DOC
    async fn handle_worker_msg(
        &mut self,
        worker_index: WorkerIndex,
        sim_id: SimulationShortId,
        worker_msg: WorkerToWorkerPoolMsg,
    ) -> Result<()> {
        match worker_msg {
            WorkerToWorkerPoolMsg::TaskResultOrCancelled(res) => {
                let task_id = res.task_id;
                let pending_task = self
                    .pending_tasks
                    .inner
                    .get_mut(&res.task_id)
                    .ok_or(Error::MissingPendingTask(task_id))?;
                if pending_task.handle_result_or_cancel(worker_index, res)? {
                    // Remove pending task because it has terminated (completed OR cancelled)
                    // Unwrap must work, since we've checked the key exists in the hashmap
                    self.pending_tasks.inner.remove(&task_id).unwrap();
                }
            }
            WorkerToWorkerPoolMsg::RunnerErrors(errors) => {
                tracing::debug!("Received RunnerErrors Message from Worker");
                self.top_send
                    .inner
                    .send((sim_id, WorkerPoolToExpCtlMsg::RunnerErrors(errors)))?;
            }
            WorkerToWorkerPoolMsg::RunnerWarnings(warnings) => {
                tracing::debug!("Received RunnerWarnings Message from Worker");
                self.top_send
                    .inner
                    .send((sim_id, WorkerPoolToExpCtlMsg::RunnerWarnings(warnings)))?;
            }
            WorkerToWorkerPoolMsg::RunnerLogs(logs) => {
                tracing::debug!("Received RunnerLogs Message from Worker");
                self.top_send
                    .inner
                    .send((sim_id, WorkerPoolToExpCtlMsg::Logs(logs)))?;
            }
            WorkerToWorkerPoolMsg::UserErrors(errors) => {
                tracing::debug!("Received UserErrors message from Worker");
                self.top_send
                    .inner
                    .send((sim_id, WorkerPoolToExpCtlMsg::UserErrors(errors)))?
            }
            WorkerToWorkerPoolMsg::UserWarnings(warnings) => {
                tracing::debug!("Received UserWarnings message from Worker");
                self.top_send
                    .inner
                    .send((sim_id, WorkerPoolToExpCtlMsg::UserWarnings(warnings)))?
            }
            WorkerToWorkerPoolMsg::PackageError(error) => {
                tracing::debug!("Received PackageError message from Worker");
                self.top_send
                    .inner
                    .send((sim_id, WorkerPoolToExpCtlMsg::PackageError(error)))?
            }
        }
        Ok(())
    }

    // TODO: delete or use when cancel is revisited
    #[allow(dead_code, unused_variables, unreachable_code)]
    async fn handle_cancel_msgs(&mut self, cancel_msgs: Vec<TaskId>) -> Result<()> {
        todo!("Cancel messages are not implemented yet");
        // see https://app.asana.com/0/1199548034582004/1202011714603653/f

        for id in cancel_msgs {
            tracing::trace!("Handling cancel msg for task with id: {}", id);
            if let Some(task) = self.pending_tasks.inner.get(&id) {
                match &task.distribution_controller {
                    DistributionController::Distributed {
                        active_worker_indices,
                        received_results: _,
                        reference_task: _,
                    } => {
                        for worker_index in active_worker_indices {
                            self.send_to_worker(
                                *worker_index,
                                WorkerPoolToWorkerMsg::cancel_task(task.task_id),
                            )?;
                        }
                    }
                    DistributionController::Single {
                        active_worker: active_worker_index,
                    } => {
                        self.send_to_worker(
                            *active_worker_index,
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

    /// TODO: DOC
    fn new_worker_subtasks(
        &self,
        sim_id: SimulationShortId,
        task_id: TaskId,
        package_id: PackageId,
        shared_store: SharedStore,
        task: PackageTask,
    ) -> Result<(Vec<(WorkerIndex, WorkerTask)>, DistributionController)> {
        let worker_list = self.simulation_runs.get_worker_allocation(sim_id)?;

        let (triples, original_task) =
            if let TaskDistributionConfig::Distributed(distribution) = task.distribution() {
                let (distributed_tables, split_config) =
                    shared_store.distribute(&distribution, worker_list)?;
                let tasks: Vec<PackageTask> = task.split_task(&split_config)?;
                (
                    tasks
                        .into_iter()
                        .zip(distributed_tables.into_iter())
                        .map(|(task, (worker, store))| (worker, task, store))
                        .collect::<Vec<_>>(),
                    DistributionController::Distributed {
                        active_worker_indices: worker_list.clone(),
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
                    vec![(*worker, task, shared_store)],
                    DistributionController::Single {
                        active_worker: *worker,
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
