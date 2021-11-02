pub mod error;
mod pending;
pub mod runner;
pub mod task;

use futures::future::try_join_all;

use crate::{
    config::WorkerConfig,
    datastore::table::sync::SyncPayload,
    proto::SimulationShortID,
    simulation::task::{
        prelude::{TaskMessage, WorkerHandler},
        result::TaskResultOrCancelled,
    },
    types::TaskID,
    worker::{
        pending::PendingWorkerTask,
        runner::comms::{inbound::InboundToRunnerMsgPayload, MessageTarget},
    },
    workerpool::comms::{
        WorkerCommsWithWorkerPool, WorkerPoolToWorkerMsg, WorkerPoolToWorkerMsgPayload,
        WorkerToWorkerPoolMsg,
    },
    Language,
};
use crate::worker::pending::CancelState;

use self::{
    error::{Error, Result},
    pending::PendingWorkerTasks,
    runner::{
        comms::{
            outbound::{OutboundFromRunnerMsg, OutboundFromRunnerMsgPayload, RunnerError},
            ExperimentInitRunnerMsg, NewSimulationRun, RunnerTaskMsg, StateInterimSync,
        },
        javascript::JavaScriptRunner,
        python::PythonRunner,
        rust::RustRunner,
    },
    task::{WorkerTask, WorkerTaskResultOrCancelled},
};

/// A task worker.
///
/// Represents three dedicated language workers.
///
/// ### Running a task
///
/// There are three phases to running a task:
/// - Start a task with a target language
/// - Handle language switches
/// - Upon completion return a completion message
pub struct WorkerController {
    py: PythonRunner,
    js: JavaScriptRunner,
    rs: RustRunner,
    config: WorkerConfig,
    worker_pool_comms: WorkerCommsWithWorkerPool,
    tasks: PendingWorkerTasks,
}

// TODO impl drop for worker controller?
impl WorkerController {
    pub async fn spawn(
        config: WorkerConfig,
        worker_pool_comms: WorkerCommsWithWorkerPool,
        exp_init: ExperimentInitRunnerMsg,
    ) -> Result<WorkerController> {
        Ok(WorkerController {
            py: PythonRunner::new(config.spawn.python, exp_init.clone())?,
            js: JavaScriptRunner::new(config.spawn.javascript, exp_init.clone())?,
            rs: RustRunner::new(config.spawn.rust, exp_init.clone())?,
            config,
            worker_pool_comms,
            tasks: PendingWorkerTasks::default(),
        })
    }

    /// ### Run the main loop of the Worker
    ///
    /// Runs a loop which allows the worker to receive/register tasks,
    /// drive tasks to completion and send back completed tasks.
    pub async fn run(&mut self) -> Result<()> {
        match self._run().await {
            Ok(()) => self.shutdown(),
            Err(e) => self.shutdown_with_error(e),
        }
    }

    fn shutdown(&mut self) -> Result<()> {
        Ok(()) // TODO
    }

    fn shutdown_with_error(&mut self, e: Error) -> Result<()> {
        Err(e) // TODO
    }

    async fn _run(&mut self) -> Result<()> {
        loop {
            tokio::select! {
                Some(msg) = self.recv_from_worker_pool_controller() => {
                    self.handle_worker_pool_msg(msg).await?;
                }
                res = self.recv_from_runners() => {
                    let msg = res?;
                    self.handle_runner_msg(msg).await?;
                }
            }
        }
        Ok(())
    }

    async fn handle_worker_pool_msg(&mut self, msg: WorkerPoolToWorkerMsg) -> Result<()> {
        match msg.payload {
            WorkerPoolToWorkerMsgPayload::Task(task) => {
                self.spawn_task(
                    msg.sim_id
                        .ok_or_else(|| Error::from("Expected simulation id for spawning a task"))?,
                    task,
                )
                .await?;
            }
            WorkerPoolToWorkerMsgPayload::Sync(sync_msg) => {
                self.sync_runners(msg.sim_id, sync_msg).await?;
            }
            WorkerPoolToWorkerMsgPayload::CancelTask(task_id) => {
                self.cancel_task(task_id).await?;
            }
            WorkerPoolToWorkerMsgPayload::NewSimulationRun(new_simulation_run) => {
                self.new_simulation_run(new_simulation_run).await?;
            }
        }
        Ok(())
    }

    async fn handle_runner_msg(&mut self, msg: OutboundFromRunnerMsg) -> Result<()> {
        use MessageTarget::*;
        use OutboundFromRunnerMsgPayload::*;
        let sim_id = msg.sim_id;
        match msg.payload {
            TaskMsg(task) => {
                let pending_task = self.tasks.inner.get_mut(&task.msg.task_id);
                match task.target {
                    Rust => {
                        self.rs.send(Some(sim_id), InboundToRunnerMsgPayload::TaskMsg(task.msg)).await?;
                        pending_task
                            .map(|pending_task| pending_task.active_runner = Language::Rust);
                    }
                    Python => {
                        self.py.send(Some(sim_id), InboundToRunnerMsgPayload::TaskMsg(task.msg)).await?;
                        pending_task
                            .map(|pending_task| pending_task.active_runner = Language::Python);
                    }
                    JavaScript => {
                        self.js.send(Some(sim_id), InboundToRunnerMsgPayload::TaskMsg(task.msg)).await?;
                        pending_task
                            .map(|pending_task| pending_task.active_runner = Language::JavaScript);
                    }
                    Dynamic => {
                        self.run_task_handler_on_outbound(sim_id, task.msg, msg.source)
                            .await?;
                    }
                    Main => {
                        self.finish_task_from_runner_msg(task.msg, msg.source)
                            .await?;
                    }
                }
            }
            TaskCancelled(task_id) => {
                self.handle_cancel_task_confirmation(task_id, msg.source)
                    .await?;
            }
            RunnerError(err) => self.handle_errors(vec![err]).await?,
            RunnerErrors(errs) => self.handle_errors(errs).await?,
            RunnerWarning(warning) => self.handle_warnings(vec![warning]).await?,
            RunnerWarnings(warnings) => self.handle_warnings(warnings).await?,
        }
        Ok(())
    }

    async fn finish_task(
        &mut self,
        task_id: TaskID,
        source: Language,
        message: TaskMessage,
        metaversioning: &StateInterimSync,
    ) -> Result<()> {
        if let Some(mut task) = self.tasks.inner.remove(&task_id) {
            // Important to update metaversioning as the metaversioning is not passed to worker pool
            task.inner
                .shared_store
                .update_metaversioning(metaversioning)?;

            let task_result = WorkerHandler::into_result(&task.inner.inner, message)?;
            // Important to drop here since we then lose the access to
            // the shared store
            drop(task);

            self.cancel_task_except_for_runner(task_id, source).await?;

            self.worker_pool_comms
                .send(WorkerToWorkerPoolMsg::TaskResultOrCancelled(
                    WorkerTaskResultOrCancelled {
                        task_id: task_id,
                        payload: TaskResultOrCancelled::Result(task_result),
                    },
                ))?;
        }
        Ok(())
    }

    async fn finish_task_from_runner_msg(
        &mut self,
        msg: RunnerTaskMsg,
        source: Language,
    ) -> Result<()> {
        self.finish_task(msg.task_id, source, msg.payload, &msg.sync)
            .await
    }

    fn inbound_from_task_msg(
        task_msg: TaskMessage,
        pending: &PendingWorkerTask,
        group_index: Option<u32>,
        sync: StateInterimSync,
    ) -> InboundToRunnerMsgPayload {
        InboundToRunnerMsgPayload::TaskMsg(RunnerTaskMsg {
            task_id: pending.task_id,
            package_id: pending.inner.package_id,
            group_index,
            sync,
            payload: task_msg.payload,
        })
    }

    async fn run_task_handler_on_outbound(
        &mut self,
        sim_id: SimulationShortID,
        msg: RunnerTaskMsg,
        source: Language,
    ) -> Result<()> {
        use MessageTarget::*;
        let group_index = msg.group_index;
        let sync = msg.sync;
        if let Some(pending) = self.tasks.inner.get_mut(&msg.task_id) {
            let next = WorkerHandler::handle_worker_message(
                &mut pending.inner.inner, msg.payload
            )?;
            match next.target {
                Rust => {
                    self.rs.send(
                        Some(sim_id),
                        self.inbound_from_task_msg(next.payload, pending, group_index, sync)
                    ).await?;
                    pending.active_runner = Language::Rust;
                }
                Python => {
                    self.py.send(
                        Some(sim_id),
                        self.inbound_from_task_msg(next.payload, pending, group_index, sync)
                    ).await?;
                    pending.active_runner = Language::Python;
                }
                JavaScript => {
                    self.js.send(
                        Some(sim_id),
                        self.inbound_from_task_msg(next.payload, pending, group_index, sync)
                    ).await?;
                    pending.active_runner = Language::JavaScript;
                }
                Dynamic => return Err(Error::UnexpectedTarget(next.target)),
                Main => {
                    drop(pending);
                    self.finish_task(msg.task_id, source, next.payload, &sync)
                        .await?;
                }
            }
        }
        Ok(())
    }

    async fn handle_cancel_task_confirmation(
        &mut self,
        task_id: TaskID,
        source: Language,
    ) -> Result<()> {
        if let Some(task) = self.tasks.inner.get_mut(&task_id) {
            if task.cancelling == CancelState::None { // TODO: Correct?
                log::warn!("Unexpected task cancelling");
                task.cancelling = CancelState::Active(vec![source]);
            }
            if source == task.active_runner {
                drop(task);
                // Safe unwrap, since we know it must be in `tasks`
                self.tasks.inner.remove(&task_id).unwrap();
                self.worker_pool_comms
                    .send(WorkerToWorkerPoolMsg::TaskResultOrCancelled(
                        WorkerTaskResultOrCancelled {
                            task_id,
                            payload: TaskResultOrCancelled::Cancelled,
                        },
                    ))?;
            }
        }
        // else ignore, since it must be that either the active runner cancelled or completed
        Ok(())
    }

    async fn handle_errors(&mut self, errors: Vec<RunnerError>) -> Result<()> {
        self.worker_pool_comms
            .send(WorkerToWorkerPoolMsg::RunnerErrors(errors))?;
        Ok(())
    }

    async fn handle_warnings(&mut self, warnings: Vec<RunnerError>) -> Result<()> {
        self.worker_pool_comms
            .send(WorkerToWorkerPoolMsg::RunnerWarnings(warnings))?;
        Ok(())
    }

    async fn spawn_task(&mut self, sim_id: SimulationShortID, task: WorkerTask) -> Result<()> {
        use MessageTarget::*;
        let task_id = task.task_id;
        let init_msg = WorkerHandler::start_message(&task.inner as _)?;
        let runner_msg = InboundToRunnerMsgPayload::TaskMsg(RunnerTaskMsg {
            task_id,
            package_id: task.package_id,
            sync: todo!(),        // TODO: From `task.shared_store?`
            group_index: todo!(), // TODO: Should be getting this from workercontroller in `task`?
            payload: init_msg.payload,
        });
        let active_runner = match init_msg.target {
            Python => {
                self.py.send(Some(sim_id), runner_msg).await?;
                Language::Python
            }
            JavaScript => {
                self.js.send(Some(sim_id), runner_msg).await?;
                Language::JavaScript
            }
            Rust => {
                self.rs.send(Some(sim_id), runner_msg).await?;
                Language::Rust
            }
            Main | Dynamic => {
                // Expected initial message to be directed to a language runtime
                return Err(Error::UnexpectedTarget(init_msg.target));
            }
        };
        if self
            .tasks
            .inner
            .insert(task_id, PendingWorkerTask::new(task, active_runner))
            .is_some()
        {
            return Err(Error::TaskAlreadyExists(task_id));
        }
        Ok(())
    }

    async fn sync_runners(
        &mut self,
        sim_id: Option<SimulationShortID>,
        sync_msg: SyncPayload,
    ) -> Result<()> {
        tokio::try_join!(
            self.py.send_if_spawned(sim_id, sync_msg.clone()),
            self.js.send_if_spawned(sim_id, sync_msg.clone()),
            self.rs.send_if_spawned(sim_id, sync_msg)
        )
        .await?;
        Ok(())
    }

    async fn cancel_task(&mut self, task_id: TaskID) -> Result<()> {
        self.tasks
            .inner
            .get_mut(&task_id)
            .map(|task| {
                task.cancelling = CancelState::Active(vec![task.active_runner])
            }); // TODO: Or `CancelState::None`?
        tokio::try_join!(
            self.py
                .send_if_spawned(None, InboundToRunnerMsgPayload::CancelTask(task_id)),
            self.js
                .send_if_spawned(None, InboundToRunnerMsgPayload::CancelTask(task_id)),
            self.rs
                .send_if_spawned(None, InboundToRunnerMsgPayload::CancelTask(task_id))
        )
        .await?;
        Ok(())
    }

    async fn cancel_task_except_for_runner(
        &mut self,
        task_id: TaskID,
        runner_language: Language,
    ) -> Result<()> {
        let mut tasks = vec![];
        if !matches!(runner_language, Language::Python) {
            tasks.append(
                self.py
                    .send_if_spawned(None, InboundToRunnerMsgPayload::CancelTask(task_id)),
            );
        }
        if !matches!(runner_language, Language::JavaScript) {
            tasks.append(
                self.js
                    .send_if_spawned(None, InboundToRunnerMsgPayload::CancelTask(task_id)),
            );
        }
        if !matches!(runner_language, Language::Rust) {
            tasks.append(
                self.rs
                    .send_if_spawned(None, InboundToRunnerMsgPayload::CancelTask(task_id)),
            );
        }
        try_join_all(tasks).await?;
        Ok(())
    }

    async fn new_simulation_run(&mut self, new_simulation_run: NewSimulationRun) -> Result<()> {
        tokio::try_join!(
            self.py.send_if_spawned(
                None,
                InboundToRunnerMsgPayload::NewSimulationRun(new_simulation_run)
            ),
            self.js.send_if_spawned(
                None,
                InboundToRunnerMsgPayload::NewSimulationRun(new_simulation_run.clone())
            ),
            self.rs.send_if_spawned(
                None,
                InboundToRunnerMsgPayload::NewSimulationRun(new_simulation_run.clone())
            )
        )
        .await?;
        Ok(())
    }

    async fn recv_from_worker_pool_controller(&mut self) -> Option<WorkerPoolToWorkerMsg> {
        self.worker_pool_comms.recv().await
    }

    async fn recv_from_runners(&mut self) -> Result<OutboundFromRunnerMsg> {
        tokio::select! {
            res = self.py.recv(), if self.py.spawned() => {
                res
            }
            res = self.js.recv(), if self.js.spawned() => {
                res
            }
            res = self.rs.recv(), if self.rs.spawned() => {
                res
            }
        }
    }
}
