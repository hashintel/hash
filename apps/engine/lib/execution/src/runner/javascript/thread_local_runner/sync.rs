use super::ThreadLocalRunner;
use crate::{
    package::simulation::SimulationId,
    runner::{
        javascript::{
            conversion::{
                batch_to_js, batches_from_shared_store, current_step_to_js,
                new_js_array_from_usizes, sim_id_to_js, state_to_js,
            },
            error::JavaScriptResult,
            utils::call_js_function,
        },
        JavaScriptError,
    },
    task::TaskSharedStore,
    worker::{ContextBatchSync, StateSync, WaitableStateSync},
};

impl<'s> ThreadLocalRunner<'s> {
    pub(in crate::runner::javascript) fn ctx_batch_sync(
        &mut self,
        scope: &mut v8::HandleScope<'s>,
        sim_run_id: SimulationId,
        ctx_batch_sync: ContextBatchSync,
    ) -> JavaScriptResult<()> {
        let ContextBatchSync {
            context_batch,
            current_step,
            state_group_start_indices,
        } = ctx_batch_sync;

        let js_sim_id = sim_id_to_js(scope, sim_run_id);
        let js_batch_id = batch_to_js(scope, context_batch.segment())?;
        let js_idxs = new_js_array_from_usizes(scope, &state_group_start_indices)?;
        let js_current_step = current_step_to_js(scope, current_step);
        call_js_function(scope, self.embedded.ctx_batch_sync, self.this, &[
            js_sim_id,
            js_batch_id,
            js_idxs,
            js_current_step,
        ])
        .map_err(|err| format!("Could not run ctx_batch_sync function: {err}"))?;

        Ok(())
    }

    pub(in crate::runner::javascript) fn state_sync(
        &mut self,
        scope: &mut v8::HandleScope<'s>,
        sim_run_id: SimulationId,
        msg: WaitableStateSync,
    ) -> JavaScriptResult<()> {
        // TODO: Technically this might violate Rust's aliasing rules, because
        //       at this point, the state batches are immutable, but we pass
        //       pointers to them into V8 that can later to be used to mutate
        //       them (because later we can guarantee that nothing else is reading
        //       state in parallel with the mutation through those pointers).

        // Sync JS.
        let agent_pool = msg.state_proxy.agent_proxies.batches_iter();
        let msg_pool = msg.state_proxy.message_proxies.batches_iter();
        // TODO: Pass `agent_pool` and `msg_pool` by reference
        let (agent_pool, msg_pool) = state_to_js(scope, agent_pool, msg_pool)?;
        let js_sim_id = sim_id_to_js(scope, sim_run_id);
        call_js_function(scope, self.embedded.state_sync, self.this, &[
            js_sim_id, agent_pool, msg_pool,
        ])
        .map_err(|err| format!("Could not run state_sync Function: {err}"))?;

        tracing::trace!("Sending state sync completion");
        msg.completion_sender.send(Ok(())).map_err(|err| {
            JavaScriptError::from(format!(
                "Couldn't send state sync completion to worker: {err:?}",
            ))
        })?;
        tracing::trace!("Sent state sync completion");

        Ok(())
    }

    pub(in crate::runner::javascript) fn state_interim_sync(
        &mut self,
        scope: &mut v8::HandleScope<'s>,
        sim_id: SimulationId,
        shared_store: &TaskSharedStore,
    ) -> JavaScriptResult<()> {
        // Sync JS.
        let (agent_batches, msg_batches, group_indices) = batches_from_shared_store(shared_store)?;
        // TODO: Pass `agent_pool` and `msg_pool` by reference
        let (agent_batches, msg_batches) = state_to_js(scope, agent_batches, msg_batches)?;

        let js_sim_id = sim_id_to_js(scope, sim_id);
        let js_idxs = new_js_array_from_usizes(scope, &group_indices)?;
        call_js_function(scope, self.embedded.state_interim_sync, self.this, &[
            js_sim_id,
            js_idxs,
            agent_batches,
            msg_batches,
        ])
        .map_err(|err| {
            JavaScriptError::V8(format!("Could not call state_interim_sync Function: {err}"))
        })?;

        Ok(())
    }

    pub(in crate::runner::javascript) fn state_snapshot_sync(
        &mut self,
        scope: &mut v8::HandleScope<'s>,
        sim_run_id: SimulationId,
        msg: StateSync,
    ) -> JavaScriptResult<()> {
        // TODO: Duplication with `state_sync`
        let agent_pool = msg.state_proxy.agent_pool().batches_iter();
        let msg_pool = msg.state_proxy.message_pool().batches_iter();
        let (agent_pool, msg_pool) = state_to_js(scope, agent_pool, msg_pool)?;
        let sim_run_id = sim_id_to_js(scope, sim_run_id);
        call_js_function(scope, self.embedded.state_snapshot_sync, self.this, &[
            sim_run_id, agent_pool, msg_pool,
        ])
        .map_err(|err| format!("Could not run state_snapshot_sync Function: {err}"))?;

        // State snapshots are part of context, not state, so don't need to
        // sync Rust agent pool and message pool.
        Ok(())
    }
}
