use memory::arrow::{ArrowBatch, ColumnChange};
use pyo3::{
    prelude::*,
    types::{PyDict, PyList},
};
use stateful::state::StateWriteProxy;

use super::PyHandle;
use crate::{package::simulation::SimulationId, task::TaskSharedStore};

impl<'py> PyHandle<'py> {
    /// Flushes the changes which were made (TODO: doc - where are they flushed to???) by the user
    /// behavior.
    ///
    /// Note: this function will panic if there is a mismatch between the Rust and Python
    /// implementations of various types.
    fn flush_batch(&mut self, changes: &PyList, batch: &mut ArrowBatch) -> memory::Result<()> {
        // first we queue all the changes which were made to the ArrowBatch...
        for change in changes {
            let i_field = change.getattr("i_field").expect(
                "failed to obtain the `i_field` member of the Python change (this is a bug)",
            );
            let i_field: usize = i_field.extract().unwrap();
            let data = change.getattr("change").unwrap();
            let array = self.rust_of_python_array(data).unwrap();

            batch.queue_change(ColumnChange {
                data: array,
                index: i_field,
            })?;
        }

        // ... then we flush them
        batch.flush_changes()?;

        Ok(())
    }

    fn flush_group(
        &mut self,
        state_proxy: &mut StateWriteProxy,
        i_proxy: usize,
        changes: &PyDict,
    ) -> memory::Result<()> {
        let agent_changes = changes.get_item("agent").unwrap();
        self.flush_batch(
            agent_changes.cast_as::<PyList>().unwrap(),
            &mut state_proxy
                .agent_pool_mut()
                .batch_mut(i_proxy)
                .unwrap()
                .batch,
        )?;

        let message_changes = changes.get_item("msg").unwrap();
        self.flush_batch(
            message_changes.cast_as::<PyList>().unwrap(),
            &mut state_proxy
                .agent_pool_mut()
                .batch_mut(i_proxy)
                .unwrap()
                .batch,
        )?;

        Ok(())
    }

    pub(super) fn flush(
        &mut self,
        _: SimulationId,
        shared_store: &mut TaskSharedStore,
        return_val: &PyAny,
    ) -> memory::Result<()> {
        let (proxy, group_indices) = match shared_store.get_write_proxies() {
            Ok(res) => res,
            Err(_) => return Ok(()),
        };

        let changes = return_val.getattr("changes").unwrap();

        if group_indices.len() == 1 {
            self.flush_group(proxy, 0, changes.cast_as::<PyDict>().unwrap())
                .unwrap();
        } else {
            let changes = changes.cast_as::<PyList>().unwrap();
            for ith_proxy in 0..group_indices.len() {
                let group_changes = changes.get_item(ith_proxy).unwrap();

                self.flush_group(proxy, ith_proxy, group_changes.cast_as::<PyDict>().unwrap())
                    .unwrap();
            }
        }

        Ok(())
    }
}
