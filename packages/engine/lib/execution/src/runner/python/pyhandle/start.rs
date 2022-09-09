use std::sync::Arc;

use pyo3::ToPyObject;

use super::PyHandle;
use crate::runner::{
    common_to_runners::SimState, comms::NewSimulationRun, python::error::PythonError,
};

impl<'py> PyHandle<'py> {
    pub(super) fn start_sim(&mut self, run: NewSimulationRun) -> Result<(), PythonError> {
        tracing::trace!("running start_sim");
        let agent_schema = &run.datastore.agent_batch_schema.arrow;
        let msg_schema = &run.datastore.message_batch_schema;
        let ctx_schema = &run.datastore.context_batch_schema;

        let mut package_ids = Vec::with_capacity(run.packages.0.len());
        let mut package_messages = Vec::with_capacity(run.packages.0.len());

        for (pkg_id, pkg_msg) in run.packages.0.iter() {
            package_ids.push(usize::from(pkg_id.as_usize()).to_object(self.py));
            package_messages.push(serde_json::to_string(&pkg_msg.payload).unwrap());
        }

        let globals = run.globals;
        let sim_id = run.short_id.to_string();

        self.py_functions.start_sim(
            self.py,
            sim_id.as_str(),
            &agent_schema,
            &msg_schema,
            &ctx_schema,
            &package_ids,
            &package_messages,
            &globals,
        )?;

        let state = SimState {
            agent_schema: Arc::clone(&run.datastore.agent_batch_schema.arrow),
            msg_schema: Arc::clone(&run.datastore.message_batch_schema),
        };
        self.simulation_states
            .try_insert(run.short_id, state)
            .map_err(|_| PythonError::DuplicateSimulationRun(run.short_id))?;

        tracing::trace!("succesfully finished start_sim");

        Ok(())
    }
}
