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

pub mod active;

pub mod message;
pub mod package;

use std::sync::{Arc, RwLock};

use uuid::Uuid;

use self::message::{EngineToWorkerPoolMsg, WrappedTask};
use super::{
    command::CreateRemoveCommands,
    package::id::PackageId,
    task::{access::StoreAccessVerify, active::ActiveTask, Task},
};
pub use super::{Error, Result};
use crate::{
    datastore::{
        prelude::{Context, State},
        table::{
            state::{view::StateSnapshot, ReadState},
            sync::{ContextBatchSync, StateSync, SyncPayload, WaitableStateSync},
            task_shared_store::TaskSharedStore,
        },
    },
    hash_types::Agent,
    proto::SimulationShortId,
    simulation::comms::message::SyncCompletionReceiver,
    types::TaskId,
    workerpool::comms::MainMsgSend,
};

#[derive(Clone)]
/// All relevant to communication between the Loop and the Language Runtime(s)
pub struct Comms {
    sim_id: SimulationShortId,
    cmds: Arc<RwLock<CreateRemoveCommands>>,
    worker_pool_sender: MainMsgSend,
}

impl Comms {
    pub fn new(sim_id: SimulationShortId, worker_pool_sender: MainMsgSend) -> Result<Comms> {
        Ok(Comms {
            sim_id,
            cmds: Arc::new(RwLock::new(CreateRemoveCommands::default())),
            worker_pool_sender,
        })
    }

    pub fn take_create_remove_commands(&self) -> Result<CreateRemoveCommands> {
        let mut cmds = self.cmds.try_write()?;
        let taken = std::mem::replace(&mut *cmds, CreateRemoveCommands::default());
        Ok(taken)
    }

    pub fn add_create_agent_command(&mut self, agent: Agent) -> Result<()> {
        let cmds = &mut self.cmds.try_write()?;
        cmds.add_create(agent);
        Ok(())
    }

    pub fn add_remove_agent_command(&mut self, uuid: Uuid) -> Result<()> {
        let cmds = &mut self.cmds.try_write()?;
        cmds.add_remove(uuid);
        Ok(())
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
    pub async fn state_sync(&self, state: &State) -> Result<SyncCompletionReceiver> {
        log::trace!("Synchronizing state");
        let (completion_sender, completion_receiver) = tokio::sync::oneshot::channel();

        // Synchronize the state batches
        let agents = state.agent_pool().clone();
        let agent_messages = state.message_pool().clone();
        let sync_msg = WaitableStateSync::new(completion_sender, agents, agent_messages);
        self.worker_pool_sender
            .send(EngineToWorkerPoolMsg::sync(
                self.sim_id,
                SyncPayload::State(sync_msg),
            ))
            .map_err(|e| Error::from(format!("Worker pool error: {:?}", e)))?;
        Ok(completion_receiver)
    }

    pub async fn state_snapshot_sync(&self, state: &StateSnapshot) -> Result<()> {
        log::trace!("Synchronizing state snapshot");
        // Synchronize the state snapshot batches
        let agents = state.agent_pool().clone();
        let agent_messages = state.message_pool().clone();
        let sync_msg = StateSync::new(agents, agent_messages);
        self.worker_pool_sender
            .send(EngineToWorkerPoolMsg::sync(
                self.sim_id,
                SyncPayload::StateSnapshot(sync_msg),
            ))
            .map_err(|e| Error::from(format!("Worker pool error: {:?}", e)))?;
        Ok(())
    }

    pub async fn context_batch_sync(
        &self,
        context: &Context,
        state_group_start_indices: &Arc<Vec<usize>>,
    ) -> Result<()> {
        log::trace!("Synchronizing context batch");
        // Synchronize the context batch
        let batch = context.batch();
        let indices = Arc::clone(state_group_start_indices);
        let sync_msg = ContextBatchSync::new(batch, indices);
        self.worker_pool_sender
            .send(EngineToWorkerPoolMsg::sync(
                self.sim_id,
                SyncPayload::ContextBatch(sync_msg),
            ))
            .map_err(|e| Error::from(format!("Worker pool error: {:?}", e)))?;
        Ok(())
    }
}

impl Comms {
    pub async fn new_task<T: Into<Task>>(
        &self,
        package_id: PackageId,
        task: T,
        shared_store: TaskSharedStore,
    ) -> Result<ActiveTask> {
        let task_id = uuid::Uuid::new_v4().as_u128();
        let (wrapped, active) = wrap_task(task_id, package_id, task, shared_store)?;
        self.worker_pool_sender
            .send(EngineToWorkerPoolMsg::task(self.sim_id, wrapped))
            .map_err(|e| Error::from(format!("Worker pool error: {:?}", e)))?;
        Ok(active)
    }
}

fn wrap_task<T: Into<Task>>(
    task_id: TaskId,
    package_id: PackageId,
    task: T,
    shared_store: TaskSharedStore,
) -> Result<(WrappedTask, ActiveTask)> {
    let task: Task = task.into();
    task.verify_store_access(&shared_store)?;
    let (owner_channels, executor_channels) = active::comms();
    let wrapped = WrappedTask::new(task_id, package_id, task, executor_channels, shared_store);
    let active = ActiveTask::new(owner_channels);
    Ok((wrapped, active))
}
