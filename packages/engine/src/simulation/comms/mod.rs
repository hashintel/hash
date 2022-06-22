/*!
# System

This module provides the tools for packages to communicate with the language runtimes.

### What can be sent to the language runtimes

Calls to language runtimes are of two main types:
1) Distributed
    - These calls mean that batches of agents are worked on
    in multiple workers
2) Centralized
    - All of State is loaded into a single language worker


Distributed calls can yield significant performance benefits. For distributed calls however,
packages have to define a `DistributedMessageHandler` which must be able to handle
inbound completion messages from multiple workers and combine them into one such that the
main package definition can be agnostic of how work was distributed.
 */

use std::sync::{Arc, RwLock};

use async_trait::async_trait;
use execution::{
    package::simulation::{PackageTask, SimulationId},
    task::{StoreAccessValidator, TaskId, TaskSharedStore},
    worker::{ContextBatchSync, StateSync, SyncCompletionReceiver, SyncPayload, WaitableStateSync},
    worker_pool,
    worker_pool::comms::{
        main::MainMsgSend,
        message::{EngineToWorkerPoolMsg, WrappedTask},
    },
};
use stateful::{
    agent::{Agent, AgentId},
    context::Context,
    field::PackageId,
    state::StateReadProxy,
};

use super::{command::Commands, task::active::ActiveTask, Error, Result};

/// A simulation-specific object containing a sender to communicate with the worker-pool, and a
/// shared collection of commands.
#[derive(Clone)]
pub struct Comms {
    /// The ID of the simulation that information pertains to.
    sim_id: SimulationId,
    /// A shared mutable [`Commands`] that are merged with those from agent messages, and resolved,
    /// by the Engine each step.
    cmds: Arc<RwLock<Commands>>,
    /// A sender to communicate with the [`WorkerPool`].
    ///
    /// [`WorkerPool`]: execution::worker_pool::WorkerPool
    worker_pool_sender: MainMsgSend,
}

impl Comms {
    /// Creates a new `Comms` object for a simulation with the given `sim_id`.
    ///
    /// Initializes a default [`Commands`], wrapping it in a `RwLock` for safe shared access.
    pub fn new(sim_id: SimulationId, worker_pool_sender: MainMsgSend) -> Result<Comms> {
        Ok(Comms {
            sim_id,
            cmds: Arc::new(RwLock::new(Commands::default())),
            worker_pool_sender,
        })
    }

    /// Takes the [`Commands`] stored in self.
    ///
    /// # Errors
    ///
    /// This function can fail if it's unable to acquire a write lock on the [`Commands`] object.
    pub fn take_commands(&self) -> Result<Commands> {
        let mut cmds = self.cmds.try_write()?;
        let taken = std::mem::take(&mut *cmds);
        Ok(taken)
    }
}

// Datastore synchronization methods
impl Comms {
    /// Sends a message to workers (via the worker pool) that tells them
    /// to load state from Arrow in shared memory.
    ///
    /// State sync is distinct from state interim sync in that state sync
    /// can update the number of batches (after adding/removing agents or
    /// partitioning them differently), but state interim sync only makes
    /// changes within (some subset of) batches.
    ///
    /// Returns a handle (inside a Result) that can be used to wait for the
    /// state sync to complete. The handle returns whether the sync itself
    /// succeeded (as opposed to whether sending the message succeeded).
    ///
    /// Errors: tokio failed to send the message to the worker pool for some reason;
    ///         e.g. the worker pool already stopped due to some other error.
    pub async fn state_sync(&self, state_proxy: StateReadProxy) -> Result<SyncCompletionReceiver> {
        tracing::trace!("Synchronizing state");
        let (completion_sender, completion_receiver) = tokio::sync::oneshot::channel();

        // Synchronize the state batches
        let sync_msg = WaitableStateSync {
            completion_sender,
            state_proxy,
        };
        self.worker_pool_sender
            .send(EngineToWorkerPoolMsg::sync(
                self.sim_id,
                SyncPayload::State(sync_msg),
            ))
            .map_err(|e| Error::from(format!("Worker pool error: {:?}", e)))?;
        Ok(completion_receiver)
    }

    /// TODO: DOC
    pub async fn state_snapshot_sync(&self, state_proxy: StateReadProxy) -> Result<()> {
        tracing::trace!("Synchronizing state snapshot");
        // Synchronize the state snapshot batches
        self.worker_pool_sender
            .send(EngineToWorkerPoolMsg::sync(
                self.sim_id,
                SyncPayload::StateSnapshot(StateSync { state_proxy }),
            ))
            .map_err(|e| Error::from(format!("Worker pool error: {:?}", e)))?;
        Ok(())
    }

    /// TODO: DOC
    pub async fn context_batch_sync(
        &self,
        context: &Context,
        current_step: usize,
        state_group_start_indices: Arc<Vec<usize>>,
    ) -> Result<()> {
        tracing::trace!("Synchronizing context batch");
        // Synchronize the context batch
        let sync_msg = ContextBatchSync {
            context_batch: Arc::clone(context.global_batch()),
            current_step,
            state_group_start_indices,
        };
        self.worker_pool_sender
            .send(EngineToWorkerPoolMsg::sync(
                self.sim_id,
                SyncPayload::ContextBatch(sync_msg),
            ))
            .map_err(|e| Error::from(format!("Worker pool error: {:?}", e)))?;
        Ok(())
    }
}

#[async_trait]
impl execution::package::simulation::Comms for Comms {
    type ActiveTask = ActiveTask;

    /// Takes a given [`Task`] object, and starts its execution on the [`WorkerPool`], returning an
    /// [`ActiveTask`] to track its progress.
    ///
    /// [`Task`]: execution::task::Task
    /// [`WorkerPool`]: execution::worker_pool::WorkerPool
    async fn new_task(
        &self,
        package_id: PackageId,
        task: PackageTask,
        shared_store: TaskSharedStore,
    ) -> execution::Result<ActiveTask> {
        let task_id = TaskId::generate();
        let (wrapped, active) = wrap_task(task_id, package_id, task, shared_store)?;
        self.worker_pool_sender
            .send(EngineToWorkerPoolMsg::task(self.sim_id, wrapped))
            .map_err(|e| execution::Error::from(format!("Worker pool error: {:?}", e)))?;
        Ok(active)
    }

    fn add_create_agent_command(&mut self, agent: Agent) -> execution::Result<()> {
        self.cmds.try_write()?.add_create(agent);
        Ok(())
    }

    fn add_remove_agent_command(&mut self, agent_id: AgentId) -> execution::Result<()> {
        self.cmds.try_write()?.add_remove(agent_id);
        Ok(())
    }
}

/// Turns a given [`Task`] into a [`WrappedTask`] and [`ActiveTask`] pair.
///
/// This includes setting up the appropriate communications to be sent to the [`WorkerPool`] and to
/// be made accessible to the Package that created the task.
///
/// # Errors
///
/// If the [`Task`] needs more access than the provided [`TaskSharedStore`] has.
///
/// [`Task`]: execution::task::Task
/// [`WorkerPool`]: execution::worker_pool::WorkerPool
fn wrap_task(
    task_id: TaskId,
    package_id: PackageId,
    task: PackageTask,
    shared_store: TaskSharedStore,
) -> Result<(WrappedTask, ActiveTask)> {
    task.verify_store_access(&shared_store)?;
    let (owner_channels, executor_channels) = worker_pool::comms::active::comms();
    let wrapped = WrappedTask {
        task_id,
        package_id,
        task,
        comms: executor_channels,
        shared_store,
    };
    let active = ActiveTask::new(owner_channels);
    Ok((wrapped, active))
}
