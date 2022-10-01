use arrow2::datatypes::Schema;
use memory::arrow::{ArrowBatch, ColumnChange};
use pyo3::{
    prelude::*,
    types::{PyDict, PyList},
};
use stateful::state::StateWriteProxy;

use super::PyHandle;
use crate::{package::simulation::SimulationId, task::TaskSharedStore};

impl<'py> PyHandle<'py> {
    pub(super) fn flush(
        &mut self,
        sim_run_id: SimulationId,
        shared_store: &mut TaskSharedStore,
        return_val: &PyAny,
    ) -> crate::Result<()> {
        let state = self
            .simulation_states
            .get(&sim_run_id)
            .ok_or(crate::Error::MissingSimulationRun(sim_run_id))?;
        let agent_schema = state.agent_schema.clone();
        let msg_schema = state.msg_schema.clone();

        let (proxy, group_indices) = match shared_store.get_write_proxies() {
            Ok(res) => res,
            Err(_) => return Ok(()),
        };

        let changes = return_val.get_item("changes").unwrap();

        let changes = changes.cast_as::<PyList>().unwrap();

        for ith_proxy in 0..group_indices.len() {
            let group_changes = changes.get_item(ith_proxy).unwrap();

            self.flush_group(
                &agent_schema,
                &msg_schema,
                proxy,
                ith_proxy,
                group_changes.cast_as::<PyDict>().unwrap(),
            )
            .unwrap();
        }

        Ok(())
    }

    fn flush_group(
        &mut self,
        agent_schema: &Schema,
        msg_schema: &Schema,
        state_proxy: &mut StateWriteProxy,
        i_proxy: usize,
        changes: &PyDict,
    ) -> memory::Result<()> {
        let agent_changes = changes.get_item("agent").unwrap();
        self.flush_batch(
            agent_schema,
            agent_changes.cast_as::<PyList>().unwrap(),
            &mut state_proxy
                .agent_pool_mut()
                .batch_mut(i_proxy)
                .unwrap()
                .batch,
        )?;

        let message_changes = changes.get_item("message").unwrap();
        self.flush_batch(
            msg_schema,
            message_changes.cast_as::<PyList>().unwrap(),
            &mut state_proxy
                .message_pool_mut()
                .batch_mut(i_proxy)
                .unwrap()
                .batch,
        )?;

        Ok(())
    }

    /// Flushes the changes which were made (TODO: doc - where are they flushed to???) by the user
    /// behavior.
    ///
    /// Note: this function will panic if there is a mismatch between the Rust and Python
    /// implementations of various types.
    fn flush_batch(
        &mut self,
        schema: &Schema,
        changes: &PyList,
        batch: &mut ArrowBatch,
    ) -> memory::Result<()> {
        batch.increment_batch_version();

        batch.check_static_meta(schema);

        for change in changes {
            let i_field = change.get_item("i_field").expect(
                "failed to obtain the `i_field` member of the Python change (this is a bug)",
            );
            let i_field: usize = i_field.extract().unwrap();
            let data_type = schema.fields[i_field].data_type().clone();
            let data = change.get_item("data").unwrap();
            let array = self.rust_of_python_array(data, data_type.clone()).unwrap();

            batch.queue_change(ColumnChange {
                data: array,
                index: i_field,
            })?;
        }

        batch.flush_changes()?;

        Ok(())
    }
}
