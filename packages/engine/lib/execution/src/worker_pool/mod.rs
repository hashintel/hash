//! Management of [`Worker`]s and the orchestration of [`Task`]s executed on them.
//!
//! This module defines the [`WorkerPool`] and accompanying API. For configuring the [`WorkerPool`],
//! the [`WorkerPoolConfig`] is used, which itself contains the information to configure the
//! [`Worker`]s.
//!
//! For communication between the [`WorkerPool`] and [`Worker`]s, the [`comms`] module provides
//! channel-based communication messages.

use std::{future::Future, pin::Pin};

pub mod comms;

mod config;
mod handler;
mod pending;
mod runs;

use futures::{
    future::try_join_all,
    stream::{FuturesUnordered, StreamExt},
};
use rand::prelude::SliceRandom;
use stateful::field::PackageId;
use tokio::{pin, task::JoinHandle};
use tracing::{Instrument, Span};

use self::{
    comms::{
        experiment::{ExpMsgRecv, ExperimentToWorkerPoolMsg},
        main::{MainMsgRecv, MainMsgSendBase},
        message::{EngineToWorkerPoolMsg, EngineToWorkerPoolMsgPayload},
        terminate::TerminateRecv,
        top::{WorkerPoolMsgSend, WorkerPoolToExpCtlMsg},
        WorkerCommsWithWorkerPool, WorkerPoolCommsWithWorkers, WorkerPoolToWorkerMsg,
        WorkerPoolToWorkerMsgPayload, WorkerToWorkerPoolMsg,
    },
    pending::DistributionController,
    runs::SimulationRuns,
};
pub(crate) use self::{
    config::SplitConfig,
    pending::{PendingWorkerPoolTask, PendingWorkerPoolTasks},
};
pub use self::{
    config::{WorkerAllocation, WorkerIndex, WorkerPoolConfig},
    handler::WorkerPoolHandler,
};
use crate::{
    package::simulation::{PackageTask, SimulationId},
    runner::comms::{ExperimentInitRunnerMsg, ExperimentInitRunnerMsgBase, NewSimulationRun},
    task::{Task, TaskDistributionConfig, TaskId, TaskSharedStore},
    worker::{SyncPayload, Worker, WorkerConfig, WorkerTask},
    Error, Result,
};

/// Orchestrates multiple [`Worker`]s and [`Task`]s executed on them.
///
/// The `WorkerPool` is created by passing the communication channels defined in [`comms`] by
/// calling [`new_with_sender()`]. See the [`comms`] module for more information about different
/// communication channels and messages.
///
/// To spawn [`Worker`]s, [`spawn_workers()`] is used. After the workers has been spawned, they can
/// be started by calling [`run()`].
///
/// [`new_with_sender()`]: Self::new_with_sender
/// [`spawn_workers()`]: Self::spawn_workers
/// [`run()`]: Self::run
pub struct WorkerPool {
    worker: Option<Vec<Worker>>,
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

impl WorkerPool {
    pub fn new_with_sender(
        config: &WorkerPoolConfig,
        experiment_control_recv: ExpMsgRecv,
        terminate_recv: TerminateRecv,
        worker_pool_send: WorkerPoolMsgSend,
    ) -> Result<(Self, MainMsgSendBase)> {
        let (comms, worker_comms) = comms::new_pool_comms(config.num_workers);
        let (sim_send_base, sim_recv) = comms::main::new_no_sim();

        let simulation_runs = SimulationRuns::default();
        let pending_tasks = PendingWorkerPoolTasks::default();

        Ok((
            WorkerPool {
                worker: None,
                comms,
                simulation_runs,
                pending_tasks,
                sim_recv,
                exp_recv: experiment_control_recv,
                terminate_recv,
                top_send: worker_pool_send,
                worker_comms: Some(worker_comms),
                worker_config: Some(config.worker_config.clone()),
            },
            sim_send_base,
        ))
    }

    /// Spawns the [`Worker`]s.
    ///
    /// It creates the communication channels to the workers and creates the [`Worker`]s with the
    /// [`WorkerConfig`] provided in [`WorkerPoolConfig`] when creating the `WorkerPool`.
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
        self.worker = Some(
            try_join_all(worker_comms.into_iter().map(|comms| {
                let init = ExperimentInitRunnerMsg::new(&exp_init_base, *comms.index());
                Worker::spawn(worker_config.clone(), comms, init)
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

    fn run_workers(&mut self) -> Result<JoinHandle<Result<Vec<()>>>> {
        tracing::debug!("Running workers");
        let workers = self.worker.take().ok_or(Error::MissingWorker)?;

        let futs = workers
            .into_iter()
            .map(|mut worker| {
                tokio::spawn(
                    async move { worker.run().await.map_err(Error::from) }.in_current_span(),
                )
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

    /// Runs the worker pool.
    // TODO: DOC: Describe communication between worker pool and engine/experiment/simulations
    //   Probably point to different `comms` submodules as well
    pub async fn run(mut self) -> Result<()> {
        tracing::debug!("Running Worker Pool");
        pin!(let workers = self.run_workers()?;);
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
                let comms = task_msg.comms;
                let (tasks, distribution_controller) = self.new_worker_subtasks(
                    sim_id,
                    task_id,
                    task_msg.package_id,
                    task_msg.shared_store,
                    task_msg.task,
                )?;
                let pending = PendingWorkerPoolTask {
                    task_id,
                    comms,
                    distribution_controller,
                    cancelling: false,
                };
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
                    .push(payload.short_id, payload.worker_allocation.as_ref().clone())?;
                self.register_simulation(payload).await?
            }
        }
        Ok(())
    }

    /// TODO: DOC
    async fn handle_worker_msg(
        &mut self,
        worker_index: WorkerIndex,
        sim_id: SimulationId,
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
        sim_id: SimulationId,
        task_id: TaskId,
        package_id: PackageId,
        shared_store: TaskSharedStore,
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
                // Pass the task to the worker, don't keep a local copy
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
                .map(|(worker, task, shared_store)| {
                    (worker, WorkerTask {
                        task_id,
                        package_id,
                        task,
                        shared_store,
                    })
                })
                .collect(),
            original_task,
        ))
    }
}
