use std::sync::Arc;

use arrow2::datatypes::Schema;
use memory::arrow::{ArrowBatch, ColumnChange};
use stateful::state::StateWriteProxy;

use super::ThreadLocalRunner;
use crate::{
    package::simulation::SimulationId,
    runner::{
        javascript::{
            error::JavaScriptResult as Result, utils::new_js_string, Array, Object, Value,
        },
        JavaScriptError as Error,
    },
    task::TaskSharedStore,
};
impl<'s> ThreadLocalRunner<'s> {
    fn flush_batch(
        &mut self,
        scope: &mut v8::HandleScope<'s>,
        changes: Array<'s>,
        batch: &mut ArrowBatch,
        schema: &Schema,
    ) -> Result<()> {
        for change_idx in 0..changes.length() {
            let change = changes.get_index(scope, change_idx as u32).ok_or_else(|| {
                Error::V8(format!("Could not access index {change_idx} on changes"))
            })?;
            let change = change.to_object(scope).ok_or_else(|| {
                Error::V8("Could not convert change from Value to Object".to_string())
            })?;

            let i_field = new_js_string(scope, "i_field");

            let i_field: v8::Local<'s, v8::Number> = change
                .get(scope, i_field.into())
                .ok_or_else(|| Error::V8("Could not get i_field property on change".to_string()))?
                .try_into()
                .map_err(|err| {
                    Error::V8(format!(
                        "Could not convert i_field from Value to Number: {err}"
                    ))
                })?;

            let i_field = i_field.value() as usize;
            let field = &schema.fields[i_field];

            let data = new_js_string(scope, "data");

            let data = change
                .get(scope, data.into())
                .ok_or_else(|| Error::V8("Could not get data property on change".to_string()))?;
            let data = self.array_data_from_js(scope, data, field.data_type(), None)?;

            batch.queue_change(ColumnChange {
                data,
                index: i_field,
            })?;
        }

        // TODO: `flush_changes` automatically reloads memory and record batch
        //       and respectively increments memory and batch versions if
        //       necessary, but JS doesn't need the record batch in the native
        //       Rust format. Could instead reload only memory and leave the
        //       batch version unchanged.
        batch.flush_changes()?;

        Ok(())
    }

    fn flush_group(
        &mut self,
        scope: &mut v8::HandleScope<'s>,
        agent_schema: &Arc<Schema>,
        msg_schema: &Arc<Schema>,
        state_proxy: &mut StateWriteProxy,
        i_proxy: usize,
        changes: Value<'s>,
    ) -> Result<()> {
        let changes = changes.to_object(scope).unwrap();

        let agent = new_js_string(scope, "agent");

        let agent_changes: Array<'s> = changes
            .get(scope, agent.into())
            .ok_or_else(|| Error::V8("Could not get agent property on changes".to_string()))?
            .try_into()
            .map_err(|err| {
                Error::V8(format!(
                    "Could not convert agent_changes from Value to Array, {err}"
                ))
            })?;

        self.flush_batch(
            scope,
            agent_changes,
            &mut state_proxy
                .agent_pool_mut()
                .batch_mut(i_proxy)
                .ok_or_else(|| format!("Could not access batch at index {i_proxy}"))?
                .batch,
            agent_schema,
        )?;

        let msg = new_js_string(scope, "msg");

        let msg_changes = changes
            .get(scope, msg.into())
            .ok_or_else(|| Error::V8("Could not get msg property on changes".to_string()))?
            .try_into()
            .map_err(|err| {
                Error::V8(format!(
                    "Could not convert msg_changes from Value to Array, {err}"
                ))
            })?;
        self.flush_batch(
            scope,
            msg_changes,
            &mut state_proxy
                .message_pool_mut()
                .batch_mut(i_proxy)
                .ok_or_else(|| format!("Could not access batch at index {i_proxy}"))?
                .batch,
            msg_schema,
        )?;

        Ok(())
    }

    /// "Flushes" the changes which the JavaScript code made. This involves collecting a list of all
    /// the changes, which we then use to modify the underlying Arrow arrays.
    ///
    /// See also the [`memory::arrow::flush`] module for more information.
    pub(in crate::runner::javascript) fn flush(
        &mut self,
        scope: &mut v8::HandleScope<'s>,
        sim_run_id: SimulationId,
        shared_store: &mut TaskSharedStore,
        return_val: Object<'s>,
    ) -> Result<()> {
        let (proxy, group_indices) = match shared_store.get_write_proxies() {
            Ok(t) => t,
            Err(_) => return Ok(()),
        };

        let state = self
            .sims_state
            .get(&sim_run_id)
            .ok_or(Error::MissingSimulationRun(sim_run_id))?;
        // Assuming cloning an Arc once is faster than looking up `state` in
        // the `sims_state` HashMap in every `flush_group` call.
        let agent_schema = state.agent_schema.clone();
        let msg_schema = state.msg_schema.clone();

        let changes = new_js_string(scope, "changes");

        let changes = return_val
            .get(scope, changes.into())
            .ok_or_else(|| Error::V8("Could not get changes property on return_val".to_string()))?;

        if group_indices.len() == 1 {
            self.flush_group(scope, &agent_schema, &msg_schema, proxy, 0, changes)?;
        } else {
            let changes: Array<'s> = changes.try_into().unwrap();
            for i_proxy in 0..group_indices.len() {
                // In principle, `i_proxy` and `group_indices[i_proxy]` can differ.
                let group_changes = changes.get_index(scope, i_proxy as u32).ok_or_else(|| {
                    Error::V8(format!("Could not access index {i_proxy} on changes"))
                })?;

                self.flush_group(
                    scope,
                    &agent_schema,
                    &msg_schema,
                    proxy,
                    i_proxy,
                    group_changes,
                )?;
            }
        }

        Ok(())
    }
}
