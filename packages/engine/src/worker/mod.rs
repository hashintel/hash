//! TODO: DOC
pub mod error;
mod pending;
pub mod runner;
pub mod task;

use std::{future::Future, pin::Pin, time::Duration};

use futures::{
    stream::{FuturesOrdered, FuturesUnordered},
    StreamExt,
};
use tokio::time::timeout;

pub use self::error::{Error, Result};
use self::{
    pending::PendingWorkerTasks,
    runner::{
        comms::{
            outbound::{OutboundFromRunnerMsg, OutboundFromRunnerMsgPayload, RunnerError},
            ExperimentInitRunnerMsg, NewSimulationRun, RunnerTaskMsg,
        },
        javascript::JavaScriptRunner,
        python::PythonRunner,
        rust::RustRunner,
    },
    task::{WorkerTask, WorkerTaskResultOrCancelled},
};
use crate::{
    config::{WorkerConfig, WorkerSpawnConfig},
    datastore::table::sync::SyncPayload,
    proto::SimulationShortId,
    simulation::{
        enum_dispatch::TaskSharedStore,
        package::id::PackageId,
        task::{
            handler::WorkerHandler,
            msg::{TaskMessage, TaskResultOrCancelled},
        },
    },
    types::TaskId,
    worker::{
        pending::{CancelState, PendingWorkerTask},
        runner::comms::{inbound::InboundToRunnerMsgPayload, MessageTarget},
    },
    workerpool::comms::{
        WorkerCommsWithWorkerPool, WorkerPoolToWorkerMsg, WorkerPoolToWorkerMsgPayload,
        WorkerToWorkerPoolMsg,
    },
    Language,
};

/// A task worker.-
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
    _config: WorkerConfig, // TODO: unused, remove?
    worker_pool_comms: WorkerCommsWithWorkerPool,
    tasks: PendingWorkerTasks,
}

// TODO: impl drop for worker controller?
impl WorkerController {
    pub async fn spawn(
        config: WorkerConfig,
        worker_pool_comms: WorkerCommsWithWorkerPool,
        exp_init: ExperimentInitRunnerMsg,
    ) -> Result<WorkerController> {
        log::debug!("Spawning worker controller");
        let WorkerSpawnConfig {
            python,
            javascript,
            rust,
        } = config.spawn;
        // TODO: Rust, JS
        Ok(WorkerController {
            py: PythonRunner::new(python, exp_init.clone())?,
            js: JavaScriptRunner::new(javascript, exp_init.clone())?,
            rs: RustRunner::new(rust, exp_init)?,
            _config: config,
            worker_pool_comms,
            tasks: PendingWorkerTasks::default(),
        })
    }

    /// ### Run the main loop of the Worker
    ///
    /// Runs a loop which allows the worker to receive/register tasks,
    /// drive tasks to completion and send back completed tasks.
    pub async fn run(&mut self) -> Result<()> {
        log::debug!("Running worker");
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
        // TODO: Rust, JS
        // let mut py_handle = self.py.run().await?;
        let mut js_handle = self.js.run().await?;

        let mut wp_recv = self.worker_pool_comms.take_recv()?;
        let mut terminate_recv = self
            .worker_pool_comms
            .take_terminate_recv()
            .map_err(|err| Error::from(format!("Failed to take terminate_recv: {}", err)))?;

        let pending_syncs: FuturesUnordered<Pin<Box<dyn Future<Output = ()> + Send>>> =
            FuturesUnordered::new();
        tokio::pin!(pending_syncs);
        loop {
            tokio::select! {
                Some(_) = pending_syncs.next() => {}
                Some(msg) = wp_recv.recv() => {
                    log::debug!("Handle worker pool message: {:?}", &msg);
                    self.handle_worker_pool_msg(msg, &mut pending_syncs).await?;
                }
                res = self.recv_from_runners() => {
                    match res {
                        Ok(msg) => {
                            log::debug!("Handle message from runners: {:?}", &msg);
                            self.handle_runner_msg(msg).await?;
                        }
                        Err(recv_err) => {
                            // Check whether the root cause is actually a problem
                            // with receiving or simply that the runner exited
                            // already, so we can't receive from it.
                            let duration = Duration::from_millis(500);
                            let mut runner_futs = FuturesOrdered::new();
                            // runner_futs.push(timeout(duration, py_handle));
                            runner_futs.push(timeout(duration, js_handle));
                            let timeout_results: Vec<_> = runner_futs.collect().await;
                            #[allow(clippy::manual_flatten)]
                            for timeout_result in timeout_results {
                                // If any of the runners exited with an error,
                                // return that error instead of `recv_err`.
                                if let Ok(runner_result) = timeout_result {
                                    // Runner finished -- didn't time out
                                    match runner_result {
                                        Err(e) => return Err(e.into()),
                                        Ok(Err(e)) => return Err(e),
                                        Ok(Ok(_)) => {}
                                    }
                                }
                            }
                            // Either none of the runners exited or none of
                            // them returned an error, so return `recv_err`.
                            return Err(recv_err);
                        }
                    }
                }
                terminate_res = &mut terminate_recv => {
                    terminate_res.map_err(|err| Error::from(format!("Couldn't receive terminate: {:?}", err)))?;
                    log::debug!("Sending terminate msg to all workers");
                    // Tell runners to terminate
                    self.terminate_runners().await?;
                    // Send confirmation of success
                    self.worker_pool_comms.confirm_terminate().map_err(|err| Error::from(format!("Failed to send confirmation of terminating workers: {:?}", err)))?;
                    break;
                }
                // py_res = &mut py_handle => {
                //     log::debug!("Python runner finished unexpectedly");
                //     py_res??;
                //     // TODO: send termination to js_handle
                //     js_handle.await??;
                //     return Ok(());
                // }
                js_res = &mut js_handle => {
                    log::debug!("Javascript runner finished unexpectedly: {:?}", js_res);
                    js_res??;
                    // TODO: send termination to py_handle
                    // py_handle.await??;
                    return Ok(());
                }
            }
        }
        // py_handle.await??;
        js_handle.await??;
        Ok(())
    }

    /// TODO: DOC
    async fn handle_worker_pool_msg(
        &mut self,
        msg: WorkerPoolToWorkerMsg,
        pending_syncs: &mut FuturesUnordered<Pin<Box<dyn Future<Output = ()> + Send>>>,
    ) -> Result<()> {
        match msg.payload {
            WorkerPoolToWorkerMsgPayload::Task(task) => {
                self.spawn_task(
                    msg.sim_id
                        .ok_or_else(|| Error::from("Expected simulation id for spawning a task"))?,
                    task,
                )
                .await?;
            }
            WorkerPoolToWorkerMsgPayload::Sync(sync) => {
                self.sync_runners(msg.sim_id, sync, pending_syncs).await?;
            }
            WorkerPoolToWorkerMsgPayload::CancelTask(task_id) => {
                log::trace!("Received cancel task msg from Worker Pool");
                self.cancel_task(task_id).await?;
            }
            WorkerPoolToWorkerMsgPayload::NewSimulationRun(new_simulation_run) => {
                self.new_simulation_run(new_simulation_run).await?;
            }
        }
        Ok(())
    }

    /// TODO: DOC
    async fn handle_runner_msg(&mut self, msg: OutboundFromRunnerMsg) -> Result<()> {
        use MessageTarget::*;
        use OutboundFromRunnerMsgPayload::*;
        let sim_id = msg.sim_id;
        match msg.payload {
            TaskMsg(task) => {
                let pending_task = self.tasks.inner.get_mut(&task.msg.task_id);
                match task.target {
                    Rust => {
                        self.rs
                            .send(Some(sim_id), InboundToRunnerMsgPayload::TaskMsg(task.msg))
                            .await?;
                        if let Some(pending_task) = pending_task {
                            pending_task.active_runner = Language::Rust;
                        }
                    }
                    Python => {
                        self.py
                            .send(Some(sim_id), InboundToRunnerMsgPayload::TaskMsg(task.msg))
                            .await?;
                        if let Some(pending_task) = pending_task {
                            pending_task.active_runner = Language::Python;
                        }
                    }
                    JavaScript => {
                        self.js
                            .send(Some(sim_id), InboundToRunnerMsgPayload::TaskMsg(task.msg))
                            .await?;
                        if let Some(pending_task) = pending_task {
                            pending_task.active_runner = Language::JavaScript;
                        }
                    }
                    Dynamic => {
                        self.run_task_handler_on_outbound(sim_id, task.msg, msg.source)
                            .await?;
                    }
                    Main => {
                        log::trace!("Task message came back to main, finishing task");
                        self.finish_task_from_runner_msg(sim_id, task.msg, msg.source)
                            .await?;
                    }
                }
            }
            TaskCancelled(task_id) => {
                self.handle_cancel_task_confirmation(task_id, sim_id, msg.source)
                    .await?;
            }
            RunnerError(err) => self.handle_errors(sim_id, vec![err]).await?,
            RunnerErrors(errs) => self.handle_errors(sim_id, errs).await?,
            RunnerWarning(warning) => self.handle_warnings(sim_id, vec![warning]).await?,
            RunnerWarnings(warnings) => self.handle_warnings(sim_id, warnings).await?,
            RunnerLog(log) => self.handle_logs(sim_id, vec![log]).await?,
            RunnerLogs(logs) => self.handle_logs(sim_id, logs).await?,
        }
        Ok(())
    }

    /// TODO: DOC
    async fn terminate_runners(&mut self) -> Result<()> {
        tokio::try_join!(
            self.py
                .send_if_spawned(None, InboundToRunnerMsgPayload::TerminateRunner),
            self.js
                .send_if_spawned(None, InboundToRunnerMsgPayload::TerminateRunner),
            self.rs
                .send_if_spawned(None, InboundToRunnerMsgPayload::TerminateRunner)
        )?;
        Ok(())
    }

    /// TODO: DOC
    async fn finish_task(
        &mut self,
        task_id: TaskId,
        sim_id: SimulationShortId,
        source: Language,
        message: TaskMessage,
        shared_store: TaskSharedStore,
    ) -> Result<()> {
        // `shared_store` metaversioning should have been kept updated
        // by the runners, so it doesn't need to be updated at this point.
        if let Some(_task) = self.tasks.inner.remove(&task_id) {
            // Important to drop here since we then lose the access to the shared store
            drop(shared_store);

            log::trace!("Cancelling tasks on the other runners");
            self.cancel_task_except_for_runner(task_id, source).await?;

            self.worker_pool_comms.send(
                sim_id,
                WorkerToWorkerPoolMsg::TaskResultOrCancelled(WorkerTaskResultOrCancelled {
                    task_id,
                    payload: TaskResultOrCancelled::Result(message),
                }),
            )?;
        }
        Ok(())
    }

    async fn finish_task_from_runner_msg(
        &mut self,
        sim_id: SimulationShortId,
        msg: RunnerTaskMsg,
        source: Language,
    ) -> Result<()> {
        self.finish_task(msg.task_id, sim_id, source, msg.payload, msg.shared_store)
            .await
    }

    fn inbound_from_task_msg(
        task_id: TaskId,
        package_id: PackageId,
        shared_store: TaskSharedStore,
        task_msg: TaskMessage,
    ) -> InboundToRunnerMsgPayload {
        InboundToRunnerMsgPayload::TaskMsg(RunnerTaskMsg {
            task_id,
            package_id,
            shared_store,
            payload: task_msg,
        })
    }

    /// TODO: DOC
    async fn run_task_handler_on_outbound(
        &mut self,
        sim_id: SimulationShortId,
        msg: RunnerTaskMsg,
        source: Language,
    ) -> Result<()> {
        use MessageTarget::*;
        if let Some(pending) = self.tasks.inner.get_mut(&msg.task_id) {
            let next = WorkerHandler::handle_worker_message(&mut pending.inner, msg.payload)?;
            match next.target {
                Rust => {
                    let inbound = Self::inbound_from_task_msg(
                        msg.task_id,
                        msg.package_id,
                        msg.shared_store,
                        next.payload,
                    );
                    log::trace!(
                        "Task resulted in a new message from Runner, sending new one to Rust: {:?}",
                        &inbound
                    );
                    self.rs.send(Some(sim_id), inbound).await?;
                    pending.active_runner = Language::Rust;
                }
                Python => {
                    let inbound = Self::inbound_from_task_msg(
                        msg.task_id,
                        msg.package_id,
                        msg.shared_store,
                        next.payload,
                    );
                    log::trace!(
                        "Task resulted in a new message from Runner, sending new one to Python: \
                         {:?}",
                        &inbound
                    );
                    self.py.send(Some(sim_id), inbound).await?;
                    pending.active_runner = Language::Python;
                }
                JavaScript => {
                    let inbound = Self::inbound_from_task_msg(
                        msg.task_id,
                        msg.package_id,
                        msg.shared_store,
                        next.payload,
                    );
                    log::trace!(
                        "Task resulted in a new message from Runner, sending new one to \
                         JavaScript: {:?}",
                        &inbound
                    );
                    self.js.send(Some(sim_id), inbound).await?;
                    pending.active_runner = Language::JavaScript;
                }
                Dynamic => return Err(Error::UnexpectedTarget(next.target)),
                Main => {
                    log::trace!("Task message came back to main, finishing task");
                    self.finish_task(msg.task_id, sim_id, source, next.payload, msg.shared_store)
                        .await?
                }
            }
        }
        Ok(())
    }

    /// TODO: DOC
    async fn handle_cancel_task_confirmation(
        &mut self,
        task_id: TaskId,
        sim_id: SimulationShortId,
        source: Language,
    ) -> Result<()> {
        if let Some(task) = self.tasks.inner.get_mut(&task_id) {
            if let CancelState::None = task.cancelling {
                log::warn!("Unexpected task cancelling confirmation");
                task.cancelling = CancelState::Active(vec![source]);
            } else if let CancelState::Active(langs) = &mut task.cancelling {
                if !langs.contains(&source) {
                    langs.push(source);
                }
            }
            if source == task.active_runner {
                // Safe unwrap, since we know it must be in `tasks`
                // We want to drop so we lose the locks on the datastore
                drop(self.tasks.inner.remove(&task_id).unwrap());
                self.worker_pool_comms.send(
                    sim_id,
                    WorkerToWorkerPoolMsg::TaskResultOrCancelled(WorkerTaskResultOrCancelled {
                        task_id,
                        payload: TaskResultOrCancelled::Cancelled,
                    }),
                )?;
            }
        }
        // else ignore, since it must be that either the active runner cancelled or completed
        Ok(())
    }

    async fn handle_errors(
        &mut self,
        sim_id: SimulationShortId,
        errors: Vec<RunnerError>,
    ) -> Result<()> {
        self.worker_pool_comms
            .send(sim_id, WorkerToWorkerPoolMsg::RunnerErrors(errors))?;
        Ok(())
    }

    async fn handle_warnings(
        &mut self,
        sim_id: SimulationShortId,
        warnings: Vec<RunnerError>,
    ) -> Result<()> {
        self.worker_pool_comms
            .send(sim_id, WorkerToWorkerPoolMsg::RunnerWarnings(warnings))?;
        Ok(())
    }

    async fn handle_logs(&mut self, sim_id: SimulationShortId, logs: Vec<String>) -> Result<()> {
        self.worker_pool_comms
            .send(sim_id, WorkerToWorkerPoolMsg::RunnerLogs(logs))?;
        Ok(())
    }

    /// TODO: DOC
    async fn spawn_task(&mut self, sim_id: SimulationShortId, task: WorkerTask) -> Result<()> {
        use MessageTarget::*;
        let task_id = task.task_id;
        let init_msg = WorkerHandler::start_message(&task.inner)?;
        let runner_msg = InboundToRunnerMsgPayload::TaskMsg(RunnerTaskMsg {
            task_id,
            package_id: task.package_id,
            shared_store: task.shared_store,
            payload: init_msg.payload,
        });
        let active_runner = match init_msg.target {
            Python => {
                log::debug!("Sending task message to Python");
                self.py.send(Some(sim_id), runner_msg).await?;
                Language::Python
            }
            JavaScript => {
                log::debug!("Sending task message to JavaScript");
                self.js.send(Some(sim_id), runner_msg).await?;
                Language::JavaScript
            }
            Rust => {
                log::debug!("Sending task message to Rust");
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
            .insert(task_id, PendingWorkerTask::new(task.inner, active_runner))
            .is_some()
        {
            return Err(Error::TaskAlreadyExists(task_id));
        }
        Ok(())
    }

    async fn sync_runners(
        &mut self,
        sim_id: Option<SimulationShortId>,
        sync_msg: SyncPayload,
        pending_syncs: &mut FuturesUnordered<Pin<Box<dyn Future<Output = ()> + Send>>>,
    ) -> Result<()> {
        let sync = if let SyncPayload::State(sync) = sync_msg {
            sync
        } else {
            tokio::try_join!(
                self.py
                    .send_if_spawned(sim_id, sync_msg.try_clone()?.into()),
                self.js
                    .send_if_spawned(sim_id, sync_msg.try_clone()?.into()),
                self.rs.send_if_spawned(sim_id, sync_msg.into())
            )?;
            return Ok(());
        };

        // TODO: Change to `children(3)` after enabling all runners.
        debug_assert!(!self.py.spawned());
        debug_assert!(!self.rs.spawned());
        let (runner_msgs, runner_receivers) = sync.create_children(1);
        let mut runner_msgs: Vec<_> = runner_msgs
            .into_iter()
            .map(InboundToRunnerMsgPayload::StateSync)
            .collect();
        // Borrow checker doesn't allow just `runner_msgs[0]`,
        // because it would be a partial move.
        let js_msg = runner_msgs.remove(0);
        tokio::try_join!(
            self.js.send_if_spawned(sim_id, js_msg),
            /* TODO: self.py.send_if_spawned(msg.sim_id, runner_msgs[1]),
             * TODO: self.rs.send_if_spawned(msg.sim_id, runner_msgs[2]), */
        )?;
        let fut = async move {
            let sync = sync; // Capture `sync` in lambda.
            sync.forward_children(runner_receivers).await
        };
        pending_syncs.push(Box::pin(fut) as _);
        Ok(())
    }

    async fn cancel_task(&mut self, task_id: TaskId) -> Result<()> {
        if let Some(task) = self.tasks.inner.get_mut(&task_id) {
            task.cancelling = CancelState::Active(vec![task.active_runner]); // TODO: Or `CancelState::None`?
        }
        tokio::try_join!(
            self.py
                .send_if_spawned(None, InboundToRunnerMsgPayload::CancelTask(task_id)),
            self.js
                .send_if_spawned(None, InboundToRunnerMsgPayload::CancelTask(task_id)),
            self.rs
                .send_if_spawned(None, InboundToRunnerMsgPayload::CancelTask(task_id))
        )?;
        Ok(())
    }

    async fn cancel_task_except_for_runner(
        &self,
        task_id: TaskId,
        runner_language: Language,
    ) -> Result<()> {
        if matches!(runner_language, Language::Python) {
            self.js
                .send_if_spawned(None, InboundToRunnerMsgPayload::CancelTask(task_id))
                .await?;
            self.rs
                .send_if_spawned(None, InboundToRunnerMsgPayload::CancelTask(task_id))
                .await?;
        }
        if matches!(runner_language, Language::JavaScript) {
            self.py
                .send_if_spawned(None, InboundToRunnerMsgPayload::CancelTask(task_id))
                .await?;
            self.rs
                .send_if_spawned(None, InboundToRunnerMsgPayload::CancelTask(task_id))
                .await?;
        }
        if matches!(runner_language, Language::Rust) {
            self.py
                .send_if_spawned(None, InboundToRunnerMsgPayload::CancelTask(task_id))
                .await?;
            self.js
                .send_if_spawned(None, InboundToRunnerMsgPayload::CancelTask(task_id))
                .await?;
        }
        Ok(())
    }

    async fn new_simulation_run(&mut self, new_simulation_run: NewSimulationRun) -> Result<()> {
        tokio::try_join!(
            self.py.send_if_spawned(
                None,
                InboundToRunnerMsgPayload::NewSimulationRun(new_simulation_run.clone())
            ),
            self.js.send_if_spawned(
                None,
                InboundToRunnerMsgPayload::NewSimulationRun(new_simulation_run.clone())
            ),
            self.rs.send_if_spawned(
                None,
                InboundToRunnerMsgPayload::NewSimulationRun(new_simulation_run)
            )
        )?;
        Ok(())
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
