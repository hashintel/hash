//! This module contains code to keep the Engine state in sync with the Python
//! runner's state.

use pyo3::{PyResult, ToPyObject};

use super::PyHandle;
use crate::{
    package::simulation::SimulationId,
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
        let ContextBatchSync {
            context_batch,
            current_step,
            state_group_start_indices,
        } = ctx_batch_sync;

        let py_sim_id = sim_run_id.as_u32().to_object(self.py);
        let py_batch_id = self.create_batch_object(context_batch.segment())?;
        let py_indices = state_group_start_indices.to_object(self.py);
        let py_current_step = current_step.to_object(self.py);

        let f = &self.py_functions.ctx_batch_sync;
        f.call1(
            self.py,
            (
                py_sim_id.as_ref(self.py),
                py_batch_id,
                py_indices.as_ref(self.py),
                py_current_step.as_ref(self.py),
            ),
        )?;

        Ok(())
    }

    pub(super) fn state_sync(
        &self,
        sim_run_id: SimulationId,
        msg: WaitableStateSync,
    ) -> PyResult<()> {
        let agent_pool = msg.state_proxy.agent_proxies.batches_iter();
        let msg_pool = msg.state_proxy.message_proxies.batches_iter();
        let (agent_pool, msg_pool) = self.python_of_state(agent_pool, msg_pool)?;
        let py_sim_id = sim_run_id.as_u32().to_object(self.py);

        let f = &self.py_functions.state_sync;
        f.call1(self.py, (py_sim_id, agent_pool, msg_pool))?;

        Ok(())
    }

    pub(super) fn state_interim_sync(
        &self,
        sim_id: SimulationId,
        shared_store: &TaskSharedStore,
    ) -> PyResult<()> {
        // Sync JS.
        let (agent_batches, msg_batches, group_indices) = shared_store.batches_iter();
        // TODO: Pass `agent_pool` and `msg_pool` by reference
        let (agent_batches, msg_batches) = self.python_of_state(agent_batches, msg_batches)?;

        let py_sim_id = sim_id.as_u32().to_object(self.py);
        let py_indices = group_indices.to_object(self.py);

        let f = &self.py_functions.state_interim_sync;

        f.call1(self.py, (py_sim_id, py_indices, agent_batches, msg_batches))?;

        Ok(())
    }

    pub(super) fn state_snapshot_sync(
        &mut self,
        sim_run_id: SimulationId,
        msg: StateSync,
    ) -> PyResult<()> {
        // TODO: Duplication with `state_sync`
        let agent_pool = msg.state_proxy.agent_pool().batches_iter();
        let msg_pool = msg.state_proxy.message_pool().batches_iter();
        let (agent_pool, msg_pool) = self.python_of_state(agent_pool, msg_pool)?;

        let py_sim_id = sim_run_id.as_u32().to_object(self.py);

        let f = &self.py_functions.state_snapshot_sync;

        f.call1(self.py, (py_sim_id, agent_pool, msg_pool))?;

        // State snapshots are part of context, not state, so don't need to
        // sync Rust agent pool and message pool.
        Ok(())
    }
}
