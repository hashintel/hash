use pyo3::{types::PyDict, Py, PyAny, PyResult};
use stateful::field::PackageId;

use super::PyHandle;
use crate::{
    package::simulation::SimulationId,
    runner::{
        comms::{RunnerTaskMessage, TargetedRunnerTaskMsg},
        python::error::PythonError,
        MessageTarget,
    },
    task::{TaskId, TaskMessage, TaskSharedStore},
};

impl<'py> PyHandle<'py> {
    pub(super) fn run_task(
        &mut self,
        args: &[Py<PyAny>],
        sim_id: SimulationId,
        group_index: Option<usize>,
        package_id: PackageId,
        task_id: TaskId,
        wrapper: &serde_json::Value,
        mut shared_store: TaskSharedStore,
    ) -> crate::Result<TargetedRunnerTaskMsg> {
        tracing::trace!("Running task (Rust `run_task` function)");

        shared_store.reload_data_if_necessary();

        let return_val = self
            .py_functions
            .run_task(self.py, args)
            .map(|obj| {
                assert!(
                    !obj.is_none(self.py),
                    "Runner.next_task did not return the next target (this is a bug!)"
                );
                obj
            })
            .map_err(|e| {
                e.print(self.py);
                e
            })
            .expect("Python runner supplied incorrect data to engine (this is a bug)");
        let return_val = return_val
            .cast_as::<PyDict>(self.py)
            .expect("Python runner supplied incorrect data to engine (this is a bug)");

        let (next_target, next_task_payload) =
            self.get_next_task(return_val).map_err(PythonError::from)?;
        tracing::trace!(
            "obtained next target ({next_target:?}) with payload `{next_task_payload}`"
        );

        let next_inner_task_msg: serde_json::Value = serde_json::from_str(&next_task_payload)?;
        let next_task_payload =
            TaskMessage::try_from_inner_msg_and_wrapper(next_inner_task_msg, wrapper.clone())
                .map_err(|err| {
                    PythonError::Unique(format!(
                        "Failed to wrap and create a new TaskMessage, perhaps the inner: \
                         {next_task_payload}, was formatted incorrectly. Underlying error: {err}"
                    ))
                })?;

        self.flush(sim_id, &mut shared_store, return_val)?;

        let next_task_msg = TargetedRunnerTaskMsg {
            target: next_target,
            msg: RunnerTaskMessage {
                package_id,
                task_id,
                group_index,
                shared_store,
                payload: next_task_payload,
            },
        };

        Ok(next_task_msg)
    }

    fn get_next_task(&self, val: &PyDict) -> PyResult<(MessageTarget, String)> {
        let target = match val.get_item("target") {
            Some(target) => {
                let target_name: String = target.extract().unwrap();
                match target_name.as_str() {
                    "JavaScript" => MessageTarget::JavaScript,
                    "Python" => MessageTarget::Python,
                    "Rust" => MessageTarget::Rust,
                    "Dynamic" => MessageTarget::Dynamic,
                    "Main" => MessageTarget::Main,
                    _ => {
                        panic!("unrecognized target")
                    }
                }
            }
            None => MessageTarget::Main,
        };
        let string = val
            .get_item("task")
            .expect(
                "misshapen Python object was supplied to engine by the Python runner (or the \
                 engine assumed the structure of the object incorrectly) - in either case, this \
                 is a bug!",
            )
            .extract::<String>()
            .expect(
                "misshapen Python object was supplied to engine by the Python runner (or the \
                 engine assumed the structure of the object incorrectly) - in either case, this \
                 is a bug!",
            );
        Ok((target, string))
    }
}
