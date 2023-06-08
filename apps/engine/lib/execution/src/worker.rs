//! Defines the task worker and accompanying API.
//!
//! The [`Worker`] contains and orchestrates the [language runners].
//!
//! [language runners]: crate::runner

mod config;
mod handler;
mod init;
mod pending;
mod sync;
mod task;

use std::{collections::hash_map::Entry, future::Future, pin::Pin, time::Duration};

use futures::{
    future::OptionFuture,
    stream::{FuturesOrdered, FuturesUnordered},
    StreamExt,
};
use tokio::time::timeout;
use tracing::{Instrument, Span};

use self::pending::{CancelState, PendingGroup, PendingWorkerTask, PendingWorkerTasks};
pub(crate) use self::task::{WorkerTask, WorkerTaskResultOrCancelled};
pub use self::{
    config::{RunnerSpawnConfig, WorkerConfig},
    handler::WorkerHandler,
    init::PackageInitMsgForWorker,
    sync::{ContextBatchSync, StateSync, SyncCompletionReceiver, SyncPayload, WaitableStateSync},
};
use crate::{
    package::{experiment::ExperimentId, simulation::SimulationId},
    runner::{
        comms::{
            ExperimentInitRunnerMsg, InboundToRunnerMsgPayload, NewSimulationRun,
            OutboundFromRunnerMsg, OutboundFromRunnerMsgPayload, RunnerTaskMessage,
        },
        JavaScriptRunner, Language, MessageTarget, PythonRunner, RunnerConfig, RustRunner,
    },
    task::{SharedState, TaskId, TaskMessage, TaskResultOrCancelled, TaskSharedStore},
    worker_pool::comms::{
        WorkerCommsWithWorkerPool, WorkerPoolToWorkerMsg, WorkerPoolToWorkerMsgPayload,
        WorkerToWorkerPoolMsg,
    },
    Error, Result,
};

/// A task worker containing three dedicated language runners.
///
/// Depending on the [`RunnerSpawnConfig`] provided to the `Worker`, different language runners may
/// be enabled or disabled.
///
/// A worker is only driven by the [`WorkerPool`] by sending [`Task`]s, please see their
/// documentation for further information.
///
/// [`WorkerPool`]: crate::worker_pool::WorkerPool
/// [`Task`]: crate::task::Task
pub struct Worker {
    py: PythonRunner,
    js: JavaScriptRunner,
    rs: RustRunner,

    // TODO: unused, remove?
    _runner_config: RunnerConfig,

    worker_pool_comms: WorkerCommsWithWorkerPool,
    tasks: PendingWorkerTasks,
}

// TODO: impl drop for worker?
impl Worker {
    /// Spawns a new worker, containing a runner for each language: JavaScript, Python, and Rust and
    /// initializes them by sending the [`ExperimentInitRunnerMsg`].
    pub async fn spawn(
        worker_config: WorkerConfig,
        worker_pool_comms: WorkerCommsWithWorkerPool,
        exp_init: ExperimentInitRunnerMsg,
    ) -> Result<Self> {
        tracing::debug!("Spawning worker");
        let RunnerSpawnConfig {
            python,
            javascript,
            rust,
        } = worker_config.spawn;
        // TODO: Rust, JS
        Ok(Self {
            py: PythonRunner::new(python, exp_init.clone())?,
            js: JavaScriptRunner::new(javascript, exp_init.clone())?,
            rs: RustRunner::new(rust, exp_init)?,
            _runner_config: worker_config.runner_config,
            worker_pool_comms,
            tasks: PendingWorkerTasks::default(),
        })
    }

    /// Runs the main loop of the Worker and [`await`]s for completion.
    ///
    /// The message handling loop allows the worker to receive/register tasks, drive tasks to
    /// completion and send back completed tasks.
    ///
    /// [`await`]: https://doc.rust-lang.org/std/keyword.await.html
    pub async fn run(&mut self) -> Result<()> {
        tracing::debug!("Running worker");
        match self._run().await {
            Ok(()) => self.shutdown(),
            Err(e) => self.shutdown_with_error(e),
        }
    }

    pub fn cleanup(experiment_id: ExperimentId) -> Result<()> {
        PythonRunner::cleanup(experiment_id)
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
        let mut py_handle = self.py.run().await?;
        let mut rs_handle = self.rs.run().await?;
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
                    tracing::debug!("Handle worker pool message: {:?}", &msg);
                    self.handle_worker_pool_msg(msg, &mut pending_syncs).await?;
                }
                res = self.recv_from_runners() => {
                    match res {
                        Ok(msg) => {
                            tracing::debug!("Handle message from runners: {:?}", &msg);
                            self.handle_runner_msg(msg).await?;
                        }
                        Err(recv_err) => {
                            // Check whether the root cause is actually a problem
                            // with receiving or simply that the runner exited
                            // already, so we can't receive from it.
                            let duration = Duration::from_millis(500);
                            let mut runner_futs = FuturesOrdered::new();
                            // runner_futs.push(timeout(duration, py_handle));
                            runner_futs.push_back(timeout(duration, js_handle));
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
                    tracing::debug!("Sending terminate msg to all workers");
                    // Tell runners to terminate
                    self.terminate_runners().await?;
                    // Send confirmation of success
                    self.worker_pool_comms.confirm_terminate().map_err(|err| Error::from(format!("Failed to send confirmation of terminating workers: {:?}", err)))?;
                    break;
                }
                py_res = &mut py_handle, if self.py.spawned() => {
                    tracing::warn!("Python runner finished unexpectedly: {py_res:?}");
                    py_res??;
                    // TODO: send termination to js_handle
                    js_handle.await??;
                    // TODO: send termination to rs_handle
                    rs_handle.await??;
                    return Ok(());
                }
                js_res = &mut js_handle, if self.js.spawned() => {
                    tracing::warn!("Javascript runner finished unexpectedly: {js_res:?}");
                    js_res??;
                    // TODO: send termination to py_handle
                    py_handle.await??;
                    // TODO: send termination to rs_handle
                    rs_handle.await??;
                    return Ok(());
                }
                rs_res = &mut rs_handle, if self.rs.spawned() => {
                    tracing::warn!("Rust runner finished unexpectedly: {rs_res:?}");
                    rs_res??;
                    // TODO: send termination to py_handle
                    py_handle.await??;
                    // TODO: send termination to js_handle
                    js_handle.await??;
                    return Ok(());
                }
            }
        }

        py_handle.await??;
        rs_handle.await??;
        js_handle.await??;

        Ok(())
    }

    /// Handles a message from the worker pool.
    ///
    /// Depending on the content of the message, the following actions are executed:
    ///   - [`Task`]: The task is forwarded to the appropriate language runner.
    ///   - [`Sync`]: Tells the runners to synchronize. See [`sync_runners`] for more details.
    ///   - [`CancelTask`], The specified task is canceled, for all runners. A [`CancelTask`]
    ///     containing the task_id is sent to all runners that have been spawned.
    ///   - [`NewSimulationRun`]: Message is forwarded to all runners.
    ///
    /// [`Task`]: WorkerPoolToWorkerMsgPayload::Task
    /// [`Sync`]: WorkerPoolToWorkerMsgPayload::Sync
    /// [`CancelTask`]: WorkerPoolToWorkerMsgPayload::CancelTask
    /// [`NewSimulationRun`]: WorkerPoolToWorkerMsgPayload::NewSimulationRun
    ///
    /// [`sync_runners`]: Self::sync_runners
    /// [`CancelTask`]: InboundToRunnerMsgPayload::CancelTask
    async fn handle_worker_pool_msg(
        &mut self,
        msg: WorkerPoolToWorkerMsg,
        pending_syncs: &mut FuturesUnordered<Pin<Box<dyn Future<Output = ()> + Send>>>,
    ) -> Result<()> {
        let span = msg.span;
        match msg.payload {
            WorkerPoolToWorkerMsgPayload::Task(task) => {
                self.spawn_task(
                    msg.sim_id
                        .ok_or_else(|| Error::from("Expected simulation id for spawning a task"))?,
                    task,
                )
                .instrument(span)
                .await?;
            }
            WorkerPoolToWorkerMsgPayload::Sync(sync) => {
                tracing::debug!("Synchronize {sync:?}");
                self.sync_runners(msg.sim_id, sync, pending_syncs)
                    .instrument(span)
                    .await?;
            }
            WorkerPoolToWorkerMsgPayload::CancelTask(_task_id) => {
                // TODO: We don't currently use Task cancelling, and to be able use it we would need
                //  to change how and when cancel messages are sent
                // self.cancel_task(task_id).
                //   instrument(span).await?;
            }
            WorkerPoolToWorkerMsgPayload::NewSimulationRun(new_simulation_run) => {
                self.new_simulation_run(new_simulation_run)
                    .instrument(span)
                    .await?;
            }
        }
        Ok(())
    }

    /// Handles an outbound message from a runner.
    ///
    /// Depending on the content of the message, the following actions are executed:
    ///   - [`TaskMsg`]: Depending on the [`target`], the following actions are executed:
    ///     - [`Javascript`]/[`Python`]/[`Rust`]: The message is forwarded to the corresponding
    ///       language runner and the active runner is set to the language.
    ///     - [`Dynamic`]: The message is forwarded to the language runner determined dynamically.
    ///     - [`Main`]: Finishes the task if any. See [`handle_end_message`] for more information.
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
    /// [`handle_end_message`]: Self::handle_end_message
    /// [`JavaScript`]: MessageTarget::JavaScript
    /// [`Python`]: MessageTarget::Python
    /// [`Rust`]: MessageTarget::Rust
    /// [`Dynamic`]: MessageTarget::Dynamic
    /// [`Main`]: MessageTarget::Main
    async fn handle_runner_msg(&mut self, msg: OutboundFromRunnerMsg) -> Result<()> {
        use OutboundFromRunnerMsgPayload::{
            PackageError, RunnerError, RunnerErrors, RunnerLog, RunnerLogs, RunnerWarning,
            RunnerWarnings, SyncCompletion, TaskCancelled, TaskMsg, UserErrors, UserWarnings,
        };
        let sim_id = msg.sim_id;
        match msg.payload {
            TaskMsg(task) => match task.target {
                MessageTarget::Rust => {
                    self.rs
                        .send(Some(sim_id), InboundToRunnerMsgPayload::TaskMsg(task.msg))
                        .in_current_span()
                        .await?;
                }
                MessageTarget::Python => {
                    self.py
                        .send(Some(sim_id), InboundToRunnerMsgPayload::TaskMsg(task.msg))
                        .in_current_span()
                        .await?;
                }
                MessageTarget::JavaScript => {
                    self.js
                        .send(Some(sim_id), InboundToRunnerMsgPayload::TaskMsg(task.msg))
                        .in_current_span()
                        .await?;
                }
                MessageTarget::Dynamic => {
                    self.run_task_handler_on_outbound(sim_id, task.msg, msg.source)
                        .in_current_span()
                        .await?;
                }
                MessageTarget::Main => {
                    tracing::trace!("Task message came back to main, finishing task");
                    self.handle_end_message(
                        task.msg.task_id,
                        sim_id,
                        task.msg.group_index,
                        msg.source,
                        task.msg.payload,
                        task.msg.shared_store,
                    )
                    .in_current_span()
                    .await?;
                }
            },
            TaskCancelled(_task_id) => {
                // TODO: We don't currently use Task cancelling, and to be able use it we would need
                //  to change how and when cancel messages are sent
                // self.handle_cancel_task_confirmation(task_id, sim_id, msg.source)
                //     .in_current_span()
                //     .await?;
            }
            RunnerError(error) => self
                .worker_pool_comms
                .send(sim_id, WorkerToWorkerPoolMsg::RunnerErrors(vec![error]))?,
            RunnerErrors(errors) => self
                .worker_pool_comms
                .send(sim_id, WorkerToWorkerPoolMsg::RunnerErrors(errors))?,
            RunnerWarning(warning) => self
                .worker_pool_comms
                .send(sim_id, WorkerToWorkerPoolMsg::RunnerWarnings(vec![warning]))?,
            RunnerWarnings(warnings) => self
                .worker_pool_comms
                .send(sim_id, WorkerToWorkerPoolMsg::RunnerWarnings(warnings))?,
            RunnerLog(log) => self
                .worker_pool_comms
                .send(sim_id, WorkerToWorkerPoolMsg::RunnerLogs(vec![log]))?,
            RunnerLogs(logs) => self
                .worker_pool_comms
                .send(sim_id, WorkerToWorkerPoolMsg::RunnerLogs(logs))?,
            UserErrors(errors) => self
                .worker_pool_comms
                .send(sim_id, WorkerToWorkerPoolMsg::UserErrors(errors))?,
            UserWarnings(warnings) => self
                .worker_pool_comms
                .send(sim_id, WorkerToWorkerPoolMsg::UserWarnings(warnings))?,
            PackageError(package_error) => self
                .worker_pool_comms
                .send(sim_id, WorkerToWorkerPoolMsg::PackageError(package_error))?,
            SyncCompletion => {
                unreachable!("Synchronizing is expected to be done at runner level")
            }
        }
        Ok(())
    }

    /// Sends a termination message to all spawned runners
    // TODO: these methods don't look like they need to be async
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

    /// Handles the terminating message of a sub-task associated with a group (i.e. the last one in
    /// its execution chain, which will be sent to "Main")
    ///
    /// - Drops the [`TaskSharedStore`] associated with the sub-task.
    /// - Removes the [`PendingGroup`] from the [`PendingWorkerTask`], and if there are no more
    /// [`PendingGroup`]s then the Task has finished and sends a message to runners to cancel any
    /// work they're doing on the Task and sends `message` to the worker pool.
    async fn handle_end_message(
        &mut self,
        task_id: TaskId,
        sim_id: SimulationId,
        group_index: Option<usize>,
        _source: Language,
        message: TaskMessage,
        shared_store: TaskSharedStore,
    ) -> Result<()> {
        // `shared_store` metaversioning should have been kept updated
        // by the runners, so it doesn't need to be updated at this point.
        // It's important to drop here since we then lose the access to the shared store,
        // so the main loop can get access to state and context immediately after it
        // receives the task completion message.
        drop(shared_store);

        if let Entry::Occupied(mut entry) = self.tasks.inner.entry(task_id) {
            let task = entry.get_mut();
            task.final_task_messages.push(message);

            if let Some(completed_group_index) = task
                .pending_groups
                .iter()
                .position(|group| group.group_index == group_index)
            {
                task.pending_groups.remove(completed_group_index);
            };

            if task.pending_groups.is_empty() {
                let mut task = entry.remove();
                let final_task_message = if task.final_task_messages.len() > 1 {
                    task.task.combine_task_messages(task.final_task_messages)?
                } else {
                    task.final_task_messages.remove(0)
                };

                tracing::trace!(
                    "No more pending groups on task [{task_id}], cancelling task on the other \
                     runners"
                );

                // TODO: Cancel messages are not implemented yet");
                //   see https://app.asana.com/0/1199548034582004/1202011714603653/f
                // self.cancel_task_except_for_runner(task_id, source).await?;

                self.worker_pool_comms.send(
                    sim_id,
                    WorkerToWorkerPoolMsg::TaskResultOrCancelled(WorkerTaskResultOrCancelled {
                        task_id,
                        payload: TaskResultOrCancelled::Result(final_task_message),
                    }),
                )?;
            }
        }
        Ok(())
    }

    /// Calls the task's [`WorkerHandler`] implementation to create the follow-up task and depending
    /// on the target of that, it handles the given message.
    ///
    ///
    ///   Depending on the [`target`], the following actions are executed:
    ///   - [`Javascript`]/[`Python`]/[`Rust`]: The message is forwarded to the corresponding
    ///     language runner and the active runner is set to the language.
    ///   - [`Main`]: Finishes the task if any. See [`handle_end_message`] for more information.
    ///   - [`Dynamic`] is an unexpected target and will return an error.
    ///
    /// [`target`]: MessageTarget
    /// [`handle_end_message`]: Self::handle_end_message
    /// [`JavaScript`]: MessageTarget::JavaScript
    /// [`Python`]: MessageTarget::Python
    /// [`Rust`]: MessageTarget::Rust
    /// [`Main`]: MessageTarget::Main
    /// [`Dynamic`]: MessageTarget::Dynamic
    async fn run_task_handler_on_outbound(
        &mut self,
        sim_id: SimulationId,
        msg: RunnerTaskMessage,
        source: Language,
    ) -> Result<()> {
        if let Some(pending) = self.tasks.inner.get_mut(&msg.task_id) {
            let next = WorkerHandler::handle_worker_message(&mut pending.task, msg.payload)?;
            match next.target {
                MessageTarget::Rust => {
                    let inbound = InboundToRunnerMsgPayload::TaskMsg(RunnerTaskMessage {
                        package_id: msg.package_id,
                        task_id: msg.task_id,
                        group_index: msg.group_index,
                        shared_store: msg.shared_store,
                        payload: next.payload,
                    });
                    tracing::trace!(
                        "Task resulted in a new message from Runner, sending new one to Rust: {:?}",
                        &inbound
                    );
                    self.rs.send(Some(sim_id), inbound).await?;
                    pending
                        .get_pending_group_mut(msg.group_index)?
                        .active_runner = Language::Rust;
                }
                MessageTarget::Python => {
                    let inbound = InboundToRunnerMsgPayload::TaskMsg(RunnerTaskMessage {
                        package_id: msg.package_id,
                        task_id: msg.task_id,
                        group_index: msg.group_index,
                        shared_store: msg.shared_store,
                        payload: next.payload,
                    });
                    tracing::trace!(
                        "Task resulted in a new message from Runner, sending new one to Python: \
                         {:?}",
                        &inbound
                    );
                    self.py.send(Some(sim_id), inbound).await?;
                    pending
                        .get_pending_group_mut(msg.group_index)?
                        .active_runner = Language::Python;
                }
                MessageTarget::JavaScript => {
                    let inbound = InboundToRunnerMsgPayload::TaskMsg(RunnerTaskMessage {
                        package_id: msg.package_id,
                        task_id: msg.task_id,
                        group_index: msg.group_index,
                        shared_store: msg.shared_store,
                        payload: next.payload,
                    });
                    tracing::trace!(
                        "Task resulted in a new message from Runner, sending new one to \
                         JavaScript: {:?}",
                        &inbound
                    );
                    self.js.send(Some(sim_id), inbound).await?;
                    pending
                        .get_pending_group_mut(msg.group_index)?
                        .active_runner = Language::JavaScript;
                }
                MessageTarget::Dynamic => return Err(Error::UnexpectedTarget(next.target)),
                MessageTarget::Main => {
                    tracing::trace!("Task message came back to main, finishing task");
                    self.handle_end_message(
                        msg.task_id,
                        sim_id,
                        msg.group_index,
                        source,
                        next.payload,
                        msg.shared_store,
                    )
                    .await?;
                }
            }
        }
        Ok(())
    }

    /// Handles a [`TaskCancelled`] message returned from a runner.
    ///
    /// If the worker has a task associated with `task_id` and the active runner is a [`Language`]
    /// runner for the `source` specified, the task is dropped and a [`Cancelled`] message is sent
    /// to the worker pool.
    /// Otherwise, this function does nothing, as it must be that either the active runner is
    /// cancelled or has completed.
    ///
    /// [`TaskCancelled`]: OutboundFromRunnerMsgPayload::TaskCancelled
    /// [`Cancelled`]: TaskResultOrCancelled::Cancelled
    #[allow(dead_code)]
    async fn handle_cancel_task_confirmation(
        &mut self,
        _task_id: TaskId,
        _sim_id: SimulationId,
        _source: Language,
    ) -> Result<()> {
        // TODO: We don't currently use Task cancelling, and to be able use it we would need
        //  to change how and when cancel messages are sent
        todo!();
        // if let Some(task) = self.tasks.inner.get_mut(&task_id) {
        //     match task.cancelling {
        //         CancelState::Active(ref mut langs) => {
        //             if !langs.contains(&source) {
        //                 langs.push(source);
        //             }
        //         }
        //         CancelState::None => {
        //             tracing::warn!("Unexpected task cancelling confirmation");
        //             task.cancelling = CancelState::Active(vec![source]);
        //         }
        //     }
        //     if source == task.active_runner {
        //         // Safe unwrap, since we know it must be in `tasks`
        //         // We want to drop so we lose the locks on the datastore
        //         drop(self.tasks.inner.remove(&task_id).unwrap());
        //         self.worker_pool_comms.send(
        //             sim_id,
        //             WorkerToWorkerPoolMsg::TaskResultOrCancelled(WorkerTaskResultOrCancelled {
        //                 task_id,
        //                 payload: TaskResultOrCancelled::Cancelled,
        //             }),
        //         )?;
        //     }
        // }
        // else ignore, since it must be that either the active runner cancelled or completed
        // Ok(())
    }

    /// Sends a message containing the `task` to the appropriate language runner.
    ///
    /// Splits the [`WorkerTask`] into multiple executions if the [`TaskSharedStore`] is
    /// [`SharedState::Partial`] by using the
    /// [`PartialSharedState::split_into_individual_per_group()`] method.
    ///
    /// [`PartialSharedState::split_into_individual_per_group()`]: crate::task::PartialSharedState::split_into_individual_per_group
    async fn spawn_task(&mut self, sim_id: SimulationId, task: WorkerTask) -> Result<()> {
        let task_id = task.task_id;
        let msg = WorkerHandler::start_message(&task.task)?;

        let context = task.shared_store.context().clone();
        let shared_stores = match task.shared_store.state {
            SharedState::None | SharedState::Write(_) | SharedState::Read(_) => {
                // Run the task on all groups
                vec![(None, task.shared_store)]
            }
            SharedState::Partial(partial_shared_state) => partial_shared_state
                .split_into_individual_per_group()
                .into_iter()
                .map(|shared_state| {
                    debug_assert_eq!(shared_state.indices().len(), 1);
                    let group_index = shared_state.indices()[0];
                    (
                        Some(group_index),
                        TaskSharedStore::new(SharedState::Partial(shared_state), context.clone()),
                    )
                })
                .collect(),
        };

        let mut pending_groups = vec![];

        for (group_index, shared_store) in shared_stores {
            let runner_msg = InboundToRunnerMsgPayload::TaskMsg(RunnerTaskMessage {
                task_id,
                package_id: task.package_id,
                group_index,
                shared_store,
                payload: msg.payload.clone(),
            });

            let active_runner = match msg.target {
                MessageTarget::Python => {
                    tracing::debug!("Sending task message to Python");
                    self.py.send(Some(sim_id), runner_msg).await?;
                    Language::Python
                }
                MessageTarget::JavaScript => {
                    tracing::debug!("Sending task message to JavaScript");
                    self.js.send(Some(sim_id), runner_msg).await?;
                    Language::JavaScript
                }
                MessageTarget::Rust => {
                    tracing::debug!("Sending task message to Rust");
                    self.rs.send(Some(sim_id), runner_msg).await?;
                    Language::Rust
                }
                MessageTarget::Main | MessageTarget::Dynamic => {
                    // Expected initial message to be directed to a language runtime
                    return Err(Error::UnexpectedTarget(msg.target));
                }
            };
            pending_groups.push(PendingGroup {
                group_index,
                active_runner,
            })
        }

        if self
            .tasks
            .inner
            .insert(task_id, PendingWorkerTask {
                task: task.task,
                pending_groups,
                final_task_messages: Vec::new(),
                cancelling: CancelState::None,
            })
            .is_some()
        {
            return Err(Error::TaskAlreadyExists(task_id));
        }
        Ok(())
    }

    async fn sync_runners(
        &mut self,
        sim_id: Option<SimulationId>,
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

        debug_assert!(!self.rs.spawned());
        let (runner_msgs, runner_receivers) = sync.create_children(
            self.js.spawned() as usize + self.py.spawned() as usize + self.rs.spawned() as usize,
        );
        let mut messages = runner_msgs
            .into_iter()
            .map(InboundToRunnerMsgPayload::StateSync);
        let (js_res, py_res, rs_res) = tokio::join!(
            OptionFuture::from(
                self.js
                    .spawned()
                    .then(|| self.js.send(sim_id, messages.next().unwrap()))
            ),
            OptionFuture::from(
                self.py
                    .spawned()
                    .then(|| self.py.send(sim_id, messages.next().unwrap()))
            ),
            OptionFuture::from(
                self.rs
                    .spawned()
                    .then(|| self.rs.send(sim_id, messages.next().unwrap()))
            ),
        );
        js_res.transpose()?;
        py_res.transpose()?;
        rs_res.transpose()?;

        let fut = async move {
            // Capture `sync` in lambda.
            let sync = sync;
            tracing::trace!("Waiting for runner synchronization");
            sync.forward_children(runner_receivers).await;
            tracing::trace!("Runners synchronized");
        }
        .in_current_span();
        pending_syncs.push(Box::pin(fut) as _);
        Ok(())
    }

    /// Sends a message to all spawned runners to cancel the current task.
    #[allow(dead_code, unused_variables, unreachable_code)]
    async fn cancel_task(&mut self, task_id: TaskId) -> Result<()> {
        todo!("Cancel messages are not implemented yet");
        // see https://app.asana.com/0/1199548034582004/1202011714603653/f

        tracing::trace!("Cancelling task");
        if let Some(_task) = self.tasks.inner.get_mut(&task_id) {
            // TODO: Or `CancelState::None`?
            // task.cancelling = CancelState::Active(vec![task.active_runner]);
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
    #[allow(dead_code, unused_variables, unreachable_code)]
    async fn cancel_task_except_for_runner(
        &self,
        task_id: TaskId,
        runner_language: Language,
    ) -> Result<()> {
        todo!("Cancel messages are not implemented yet");
        // see https://app.asana.com/0/1199548034582004/1202011714603653/f

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
        let span = Span::current();
        tokio::try_join!(
            self.py
                .send_if_spawned(
                    Some(new_simulation_run.short_id),
                    InboundToRunnerMsgPayload::NewSimulationRun(new_simulation_run.clone())
                )
                .instrument(span.clone()),
            self.js
                .send_if_spawned(
                    Some(new_simulation_run.short_id),
                    InboundToRunnerMsgPayload::NewSimulationRun(new_simulation_run.clone())
                )
                .instrument(span.clone()),
            self.rs
                .send_if_spawned(
                    Some(new_simulation_run.short_id),
                    InboundToRunnerMsgPayload::NewSimulationRun(new_simulation_run)
                )
                .instrument(span.clone())
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
