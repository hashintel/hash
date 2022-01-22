//! The `worker` module defines the three different language runners for JavaScript, Python, and
//! Rust and the accompanying API for their tasks and communication.
//!
//! The [`runner`] module contains the implementations for the languages and the
//! [communication module](runner::comms). The [`task`] module defines tasks executed in the
//! runners.

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

/// A task worker.
///
/// Represents three dedicated language workers.
///
/// ## Running a task
///
/// There are three phases to running a task:
/// - Start a task with a target language
/// - Handle language switches
/// - Upon completion return a completion message
pub struct WorkerController {
    py: PythonRunner,
    js: JavaScriptRunner,
    rs: RustRunner,
    // TODO: unused, remove?
    _config: WorkerConfig,
    worker_pool_comms: WorkerCommsWithWorkerPool,
    tasks: PendingWorkerTasks,
}

// TODO: impl drop for worker controller?
impl WorkerController {
    /// Spawns a new worker for each language: JavaScript, Python, and Rust and initialize the
    /// communication channels for each of them.
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

    /// Runs the main loop of the Worker and [`await`]s for completition.
    ///
    /// The main loop allows the worker to receive/register tasks, drive tasks to completion and
    /// send back completed tasks.
    ///
    /// [`await`]: https://doc.rust-lang.org/std/keyword.await.html
    pub async fn run(&mut self) -> Result<()> {
        log::debug!("Running worker");
        match self._run().await {
            Ok(()) => self.shutdown(),
            Err(e) => self.shutdown_with_error(e),
        }
    }

    fn shutdown(&mut self) -> Result<()> {
        // TODO
        Ok(())
    }

    fn shutdown_with_error(&mut self, e: Error) -> Result<()> {
        // TODO
        Err(e)
    }

    async fn _run(&mut self) -> Result<()> {
        // TODO: Rust, JS
        let mut js_handle = self.js.run().await?;
        // let mut py_handle = self.py.run().await?;
        // let mut rs_handle = self.rs.run().await?;

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

        js_handle.await??;
        // py_handle.await??;
        // rs_handle.await??;

        Ok(())
    }

    /// Handles a message from the worker pool.
    ///
    /// Depending of the content of the message, the following actions are executed:
    ///   - [`Task`]: The contained task is spawned for the specified simulation, [`TaskMsg`] is
    ///     send to all workers.
    ///   - [`Sync`]: The workers are synchronized. See [`sync_runners`] for more details.
    ///   - [`CancelTask`], The specified task is canceled, for all workers. [`CancelTask`] is send
    ///     to all workers.
    ///   - [`NewSimulationRun`]: Message is forwarded to all workers.
    ///
    /// [`Task`]: WorkerPoolToWorkerMsgPayload::Task
    /// [`Sync`]: WorkerPoolToWorkerMsgPayload::Sync
    /// [`CancelTask`]: WorkerPoolToWorkerMsgPayload::CancelTask
    /// [`NewSimulationRun`]: WorkerPoolToWorkerMsgPayload::NewSimulationRun
    ///
    /// [`sync_runners`]: Self::sync_runners
    /// [`TaskMsg`]: InboundToRunnerMsgPayload::TaskMsg
    /// [`CancelTask`]: InboundToRunnerMsgPayload::CancelTask
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

    /// Handles an outbound message from a runner.
    ///
    /// Depending of the content of the message, the following actions are executed:
    ///   - [`TaskMsg`]: Depending on the [`target`], the following actions are executed:
    ///     - [`Javascript`]/[`Python`]/[`Rust`]: The message is forwarded to the corresponding
    ///       language runner and the active runner is set to the language.
    ///     - [`Dynamic`]: The message is forwarded to the language runner determined dynamically.
    ///     - [`Main`]: Finishes the task if any. See [`finish_task`] for more information.
    ///   - [`TaskCancelled`]: Cancels the task if any. See [`handle_cancel_task_confirmation`] for
    ///     more information.
    ///   - [`RunnerError`]/[`RunnerErrors`]: Forwards the error(s) to the worker pool.
    ///   - [`RunnerWarning`]/[`RunnerWarnings`]: Forwards the warning(s) to the worker pool.
    ///   - [`RunnerLog`]/[`RunnerLogs`]: Forwards the log entry/entries to the worker pool.
    ///
    /// [`TaskMsg`]: OutboundFromRunnerMsgPayload::TaskMsg
    /// [`TaskCancelled`]: OutboundFromRunnerMsgPayload::TaskCancelled
    /// [`RunnerError`]: OutboundFromRunnerMsgPayload::RunnerError
    /// [`RunnerErrors`]: OutboundFromRunnerMsgPayload::RunnerErrors
    /// [`RunnerWarning`]: OutboundFromRunnerMsgPayload::RunnerWarning
    /// [`RunnerWarnings`]: OutboundFromRunnerMsgPayload::RunnerWarnings
    /// [`RunnerLog`]: OutboundFromRunnerMsgPayload::RunnerLog
    /// [`RunnerLogs`]: OutboundFromRunnerMsgPayload::RunnerLogs
    ///
    /// [`target`]: MessageTarget
    /// [`handle_cancel_task_confirmation`]: Self::handle_cancel_task_confirmation
    /// [`finish_task`]: Self::finish_task
    /// [`JavaScript`]: MessageTarget::JavaScript
    /// [`Python`]: MessageTarget::Python
    /// [`Rust`]: MessageTarget::Rust
    /// [`Dynamic`]: MessageTarget::Dynamic
    /// [`Main`]: MessageTarget::Main
    async fn handle_runner_msg(&mut self, msg: OutboundFromRunnerMsg) -> Result<()> {
        use OutboundFromRunnerMsgPayload::*;
        let sim_id = msg.sim_id;
        match msg.payload {
            TaskMsg(task) => {
                let pending_task = self.tasks.inner.get_mut(&task.msg.task_id);
                match task.target {
                    MessageTarget::Rust => {
                        self.rs
                            .send(Some(sim_id), InboundToRunnerMsgPayload::TaskMsg(task.msg))
                            .await?;
                        if let Some(pending_task) = pending_task {
                            pending_task.active_runner = Language::Rust;
                        }
                    }
                    MessageTarget::Python => {
                        self.py
                            .send(Some(sim_id), InboundToRunnerMsgPayload::TaskMsg(task.msg))
                            .await?;
                        if let Some(pending_task) = pending_task {
                            pending_task.active_runner = Language::Python;
                        }
                    }
                    MessageTarget::JavaScript => {
                        self.js
                            .send(Some(sim_id), InboundToRunnerMsgPayload::TaskMsg(task.msg))
                            .await?;
                        if let Some(pending_task) = pending_task {
                            pending_task.active_runner = Language::JavaScript;
                        }
                    }
                    MessageTarget::Dynamic => {
                        self.run_task_handler_on_outbound(sim_id, task.msg, msg.source)
                            .await?;
                    }
                    MessageTarget::Main => {
                        log::trace!("Task message came back to main, finishing task");
                        self.finish_task(
                            task.msg.task_id,
                            sim_id,
                            msg.source,
                            task.msg.payload,
                            task.msg.shared_store,
                        )
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

    /// Attempts to join the spawned runners.
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

    /// Sends a message to runners to cancel the current task and sends `message` to the worker
    /// pool.
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

    /// Handles a runner message based on the target of the current task.
    ///
    ///   Depending on the [`target`], the following actions are executed:
    ///   - [`Javascript`]/[`Python`]/[`Rust`]: The message is forwarded to the corresponding
    ///     language runner and the active runner is set to the language.
    ///   - [`Main`]: Finishes the task if any. See [`finish_task`] for more information.
    ///   - [`Dynamic`] is an unexpected target and will return an error.
    ///
    /// [`target`]: MessageTarget
    /// [`finish_task`]: Self::finish_task
    /// [`JavaScript`]: MessageTarget::JavaScript
    /// [`Python`]: MessageTarget::Python
    /// [`Rust`]: MessageTarget::Rust
    /// [`Main`]: MessageTarget::Main
    /// [`Dynamic`]: MessageTarget::Dynamic
    async fn run_task_handler_on_outbound(
        &mut self,
        sim_id: SimulationShortId,
        msg: RunnerTaskMsg,
        source: Language,
    ) -> Result<()> {
        if let Some(pending) = self.tasks.inner.get_mut(&msg.task_id) {
            // TODO: implement worker node handler
            let next = WorkerHandler::handle_worker_message(&mut pending.inner, msg.payload)?;
            match next.target {
                MessageTarget::Rust => {
                    let inbound = InboundToRunnerMsgPayload::TaskMsg(RunnerTaskMsg {
                        task_id: msg.task_id,
                        package_id: msg.package_id,
                        shared_store: msg.shared_store,
                        payload: next.payload,
                    });
                    log::trace!(
                        "Task resulted in a new message from Runner, sending new one to Rust: {:?}",
                        &inbound
                    );
                    self.rs.send(Some(sim_id), inbound).await?;
                    pending.active_runner = Language::Rust;
                }
                MessageTarget::Python => {
                    let inbound = InboundToRunnerMsgPayload::TaskMsg(RunnerTaskMsg {
                        task_id: msg.task_id,
                        package_id: msg.package_id,
                        shared_store: msg.shared_store,
                        payload: next.payload,
                    });
                    log::trace!(
                        "Task resulted in a new message from Runner, sending new one to Python: \
                         {:?}",
                        &inbound
                    );
                    self.py.send(Some(sim_id), inbound).await?;
                    pending.active_runner = Language::Python;
                }
                MessageTarget::JavaScript => {
                    let inbound = InboundToRunnerMsgPayload::TaskMsg(RunnerTaskMsg {
                        task_id: msg.task_id,
                        package_id: msg.package_id,
                        shared_store: msg.shared_store,
                        payload: next.payload,
                    });
                    log::trace!(
                        "Task resulted in a new message from Runner, sending new one to \
                         JavaScript: {:?}",
                        &inbound
                    );
                    self.js.send(Some(sim_id), inbound).await?;
                    pending.active_runner = Language::JavaScript;
                }
                MessageTarget::Dynamic => return Err(Error::UnexpectedTarget(next.target)),
                MessageTarget::Main => {
                    log::trace!("Task message came back to main, finishing task");
                    self.finish_task(msg.task_id, sim_id, source, next.payload, msg.shared_store)
                        .await?;
                }
            }
        }
        Ok(())
    }

    /// Adds `source` to the list of currently cancelling languages and if there is a running task
    /// it sends a [`Cancelled`] message for it to the worker pool.
    ///
    /// [`Cancelled`]: TaskResultOrCancelled::Cancelled
    async fn handle_cancel_task_confirmation(
        &mut self,
        task_id: TaskId,
        sim_id: SimulationShortId,
        source: Language,
    ) -> Result<()> {
        if let Some(task) = self.tasks.inner.get_mut(&task_id) {
            match task.cancelling {
                CancelState::Active(ref mut langs) => {
                    if !langs.contains(&source) {
                        langs.push(source);
                    }
                }
                CancelState::None => {
                    log::warn!("Unexpected task cancelling confirmation");
                    task.cancelling = CancelState::Active(vec![source]);
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

    /// Forwards the errors to the worker pool.
    async fn handle_errors(
        &mut self,
        sim_id: SimulationShortId,
        errors: Vec<RunnerError>,
    ) -> Result<()> {
        self.worker_pool_comms
            .send(sim_id, WorkerToWorkerPoolMsg::RunnerErrors(errors))?;
        Ok(())
    }

    /// Forwards the warnings to the worker pool.
    async fn handle_warnings(
        &mut self,
        sim_id: SimulationShortId,
        warnings: Vec<RunnerError>,
    ) -> Result<()> {
        self.worker_pool_comms
            .send(sim_id, WorkerToWorkerPoolMsg::RunnerWarnings(warnings))?;
        Ok(())
    }

    /// Forwards the log entries to the worker pool.
    async fn handle_logs(&mut self, sim_id: SimulationShortId, logs: Vec<String>) -> Result<()> {
        self.worker_pool_comms
            .send(sim_id, WorkerToWorkerPoolMsg::RunnerLogs(logs))?;
        Ok(())
    }

    /// Sends `task` to the appropriate worker.
    async fn spawn_task(&mut self, sim_id: SimulationShortId, task: WorkerTask) -> Result<()> {
        let task_id = task.task_id;
        let init_msg = WorkerHandler::start_message(&task.inner)?;
        let runner_msg = InboundToRunnerMsgPayload::TaskMsg(RunnerTaskMsg {
            task_id,
            package_id: task.package_id,
            shared_store: task.shared_store,
            payload: init_msg.payload,
        });
        let active_runner = match init_msg.target {
            MessageTarget::Python => {
                log::debug!("Sending task message to Python");
                self.py.send(Some(sim_id), runner_msg).await?;
                Language::Python
            }
            MessageTarget::JavaScript => {
                log::debug!("Sending task message to JavaScript");
                self.js.send(Some(sim_id), runner_msg).await?;
                Language::JavaScript
            }
            MessageTarget::Rust => {
                log::debug!("Sending task message to Rust");
                self.rs.send(Some(sim_id), runner_msg).await?;
                Language::Rust
            }
            MessageTarget::Main | MessageTarget::Dynamic => {
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

        // TODO: Change to `children(n)` for `n` enabled runners and adjust the following lines as
        //   well.
        debug_assert!(!self.py.spawned());
        debug_assert!(!self.rs.spawned());
        let (runner_msgs, runner_receivers) = sync.create_children(1);
        let messages: [_; 1] = runner_msgs
            .into_iter()
            .map(InboundToRunnerMsgPayload::StateSync)
            .collect::<Vec<_>>()
            .try_into()
            .unwrap();
        let [js_msg /* , py_msg, rs_msg */] = messages;
        tokio::try_join!(
            self.js.send_if_spawned(sim_id, js_msg),
            // self.py.send_if_spawned(msg.sim_id, py_msg),
            // self.rs.send_if_spawned(msg.sim_id, rs_msg),
        )?;
        let fut = async move {
            let sync = sync; // Capture `sync` in lambda.
            sync.forward_children(runner_receivers).await
        };
        pending_syncs.push(Box::pin(fut) as _);
        Ok(())
    }

    /// Sends a message to all spawned runners to cancel the current task.
    async fn cancel_task(&mut self, task_id: TaskId) -> Result<()> {
        if let Some(task) = self.tasks.inner.get_mut(&task_id) {
            // TODO: Or `CancelState::None`?
            task.cancelling = CancelState::Active(vec![task.active_runner]);
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

    /// Sends a message to cancel the current task to any runner except for `runner_language`.
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

    /// Forwards `new_simulation_run` to all spawned workers.
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

    /// Waits for a message from any spawned worker.
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
