use arrow2::{
    datatypes::Schema,
    io::ipc::write::{default_ipc_fields, schema_to_bytes},
};
use memory::shared_memory::arrow_continuation;
use pyo3::{
    types::{PyBytes, PyTuple},
    PyAny, ToPyObject,
};

use super::PyHandle;
use crate::runner::{comms::NewSimulationRun, python::error::PythonError};

impl<'py> PyHandle<'py> {
    pub(super) fn start_sim(&self, run: NewSimulationRun) -> Result<(), PythonError> {
        let agent_schema_bytes = schema_to_stream_bytes(&run.datastore.agent_batch_schema.arrow);
        let msg_schema_bytes = schema_to_stream_bytes(&run.datastore.message_batch_schema);
        let ctx_schema_bytes = schema_to_stream_bytes(&run.datastore.context_batch_schema);

        let mut package_ids = Vec::with_capacity(run.packages.0.len());
        let mut package_messages = Vec::with_capacity(run.packages.0.len());

        for (pkg_id, pkg_msg) in run.packages.0.iter() {
            package_ids.push(usize::from(pkg_id.as_usize()).to_object(self.py));
            package_messages.push(serde_json::to_string(&pkg_msg.payload).unwrap());
        }

        let globals = run.globals;
        let globals = serde_json::to_string(&globals).unwrap();
        let sim_id = run.short_id.to_string();

        self.py_functions
            .start_sim
            .call1(
                self.py,
                PyTuple::new(self.py, &[
                    sim_id.to_object(self.py).cast_as::<PyAny>(self.py).unwrap(),
                    PyBytes::new(self.py, &agent_schema_bytes)
                        .cast_as::<PyAny>()
                        .unwrap(),
                    PyBytes::new(self.py, &msg_schema_bytes)
                        .cast_as::<PyAny>()
                        .unwrap(),
                    PyBytes::new(self.py, &ctx_schema_bytes)
                        .cast_as::<PyAny>()
                        .unwrap(),
                    package_ids
                        .to_object(self.py)
                        .cast_as::<PyAny>(self.py)
                        .unwrap(),
                    package_messages
                        .to_object(self.py)
                        .cast_as::<PyAny>(self.py)
                        .unwrap(),
                    globals
                        .to_object(self.py)
                        .cast_as::<PyAny>(self.py)
                        .unwrap(),
                ]),
            )
            .unwrap();

        Ok(())
    }
}

// TODO: deduplicate with JS
fn schema_to_stream_bytes(schema: &Schema) -> Vec<u8> {
    let content = schema_to_bytes(schema, &default_ipc_fields(&schema.fields));
    let mut stream_bytes = arrow_continuation(content.len());
    stream_bytes.extend_from_slice(&content);
    stream_bytes
}
