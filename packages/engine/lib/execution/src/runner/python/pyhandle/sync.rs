//! This module contains code to keep the Engine state in sync with the Python
//! runner's state.

use pyo3::PyResult;

use super::PyHandle;
use crate::{
    package::simulation::SimulationId,
    runner::PythonError,
    task::TaskSharedStore,
    worker::{ContextBatchSync, StateSync, WaitableStateSync},
};

impl<'py> PyHandle<'py> {
    /// This calls the Python function `ctx_batch_sync` to synchronise the
    /// context batch, such that the Python runner has the same data as the
    /// engine.
    pub(super) fn context_batch_sync(
        &self,
        sim_run_id: SimulationId,
        ctx_batch_sync: ContextBatchSync,
    ) -> PyResult<()> {
        tracing::trace!(
            "Running context_batch_sync (Rust function, Python runner) for simulation {sim_run_id}"
        );

        let ContextBatchSync {
            context_batch,
            current_step,
            state_group_start_indices,
        } = ctx_batch_sync;

        let py_batch = self.create_batch_object(context_batch.segment())?;

        self.py_functions.ctx_batch_sync(
            self.py,
            sim_run_id,
            py_batch,
            &state_group_start_indices,
            current_step,
        )?;

        Ok(())
    }

    pub(super) fn state_sync(
        &self,
        sim_run_id: SimulationId,
        msg: WaitableStateSync,
    ) -> Result<(), PythonError> {
        tracing::trace!("Running Python state_sync (simulation id: {sim_run_id})");
        let agent_pool = msg.state_proxy.agent_proxies.batches_iter();
        let msg_pool = msg.state_proxy.message_proxies.batches_iter();
        let (agent_pool, msg_pool) = self.python_of_state(agent_pool, msg_pool)?;

        self.py_functions
            .state_sync(self.py, sim_run_id, agent_pool, msg_pool)?;

        tracing::trace!("Finished running Python state_sync (simulation id: {sim_run_id})");

        msg.completion_sender.send(Ok(())).map_err(|err| {
            PythonError::Unique(format!(
                "Couldn't send state sync completion to worker: {err:?}",
            ))
        })?;

        Ok(())
    }

    pub(super) fn state_interim_sync(
        &self,
        sim_id: SimulationId,
        shared_store: &TaskSharedStore,
    ) -> PyResult<()> {
        tracing::trace!(
            "Running state_interim_sync (Rust function, Python runner) for simulation {sim_id}"
        );
        // Sync JS.
        let (agent_batches, msg_batches, group_indices) = shared_store.batches_iter();
        // TODO: Pass `agent_pool` and `msg_pool` by reference
        let (agent_batches, msg_batches) = self.python_of_state(agent_batches, msg_batches)?;

        self.py_functions.state_interim_sync(
            self.py,
            sim_id,
            &group_indices,
            agent_batches,
            msg_batches,
        )?;

        Ok(())
    }

    pub(super) fn state_snapshot_sync(
        &mut self,
        sim_run_id: SimulationId,
        msg: StateSync,
    ) -> PyResult<()> {
        tracing::trace!(
            "Running state_snapshot_sync (Rust function, Python runner) for simulation \
             {sim_run_id}"
        );

        // TODO: Duplication with `state_sync`
        let agent_pool = msg.state_proxy.agent_pool().batches_iter();
        let msg_pool = msg.state_proxy.message_pool().batches_iter();
        let (agent_pool, msg_pool) = self.python_of_state(agent_pool, msg_pool)?;

        self.py_functions
            .state_snapshot_sync(self.py, sim_run_id, agent_pool, msg_pool)?;
        // State snapshots are part of context, not state, so don't need to
        // sync Rust agent pool and message pool.
        Ok(())
    }
}
