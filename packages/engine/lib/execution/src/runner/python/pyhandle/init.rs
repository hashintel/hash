//! Contains the code required to initialize a Python runner.

use std::path::PathBuf;

use pyo3::{
    types::{PyDict, PyList, PyModule},
    IntoPy, PyErr, PyResult, Python, ToPyObject,
};

use self::py_runner::PyRunner;
use super::{package::PyPackage, PyHandle};
use crate::runner::{
    common_to_runners::UserProgramExecutionStatus, comms::ExperimentInitRunnerMsg,
};

impl<'py> PyHandle<'py> {
    /// Creates a new [`PyHandle`].
    ///
    /// Broadly speaking, this function does the following:
    /// 1. loads the datasets
    /// 2. loads the packages
    /// 3. calls the Python `start_experiment` function (in `runner.py`)
    /// 4. returns the [`PyHandle`]
    pub(crate) fn new(
        py: Python<'py>,
        init_msg: &ExperimentInitRunnerMsg,
    ) -> PyResult<(PyHandle<'py>, UserProgramExecutionStatus)> {
        tracing::trace!("loading shared datasets");
        let datasets = {
            let upgraded = init_msg.shared_context.upgrade().expect(
                "failed to obtain access to the shared store (this is a bug: it should not be \
                 possible for the ExperimentController to be dropped before a Python runner)",
            );
            PyHandle::load_datasets(py, upgraded.as_ref())
        }?;
        tracing::trace!("finished loading shared datasets");

        tracing::trace!("loading package configurations");
        let package_config = &init_msg.package_config.0;

        let (package_functions, package_msgs) = {
            let mut package_functions = Vec::with_capacity(package_config.len());
            let mut package_names = Vec::with_capacity(package_config.len());

            for package_init_msg in package_config.values() {
                let package = PyPackage::import_package(
                    py,
                    package_init_msg.name.to_string().as_str(),
                    package_init_msg.r#type,
                )?;

                package_functions.push(if package.is_some() {
                    package.to_object(py)
                } else {
                    // The Python runner expects the runner to supply the functions
                    // object as a dictionary (so we convert to a None to a
                    // dictionary of `None` if necessary)
                    let dict = PyDict::new(py);
                    dict.set_item("start_experiment", ())?;
                    dict.set_item("start_sim", ())?;
                    dict.set_item("run_task", ())?;
                    dict.into_py(py)
                });

                package_names.push({
                    let dict = PyDict::new(py);
                    dict.set_item("name", package_init_msg.name.to_string().to_object(py))?;
                    dict.set_item(
                        "payload",
                        package_init_msg.payload.to_string().to_object(py),
                    )?;
                    dict.set_item(
                        "id",
                        usize::from(package_init_msg.id.as_usize()).to_object(py),
                    )?;
                    dict.set_item("type", package_init_msg.r#type.to_string())?;
                    dict
                });
            }

            (package_functions, package_names)
        };
        tracing::trace!("finished loading package configurations");

        let package_functions = PyList::new(py, package_functions);
        let package_names = PyList::new(py, package_msgs);

        // ... here we import pyarrow
        // TODO: if we can't import it, we should abort and notify the user that they need to set up
        // the virtual environment
        tracing::trace!("importing pyarrow");
        let pyarrow = py.import("pyarrow")?;

        tracing::trace!("loading Python Runner class");
        let py_functions: py_runner::PyRunner =
            Self::get_py_funcs(Self::import_necessary_modules(py));
        tracing::trace!("finished loading Python Runner class");

        let status =
            py_functions.start_experiment(py, datasets, package_names, package_functions)?;
        let status = status.extract(py)?;

        tracing::trace!("created new PyHandle");

        Ok((
            Self {
                py,
                pyarrow: pyarrow.into_py(py),
                py_functions,
                simulation_states: Default::default(),
            },
            status,
        ))
    }

    /// Does the same thing as [`PyHandle::try_read_arbitrary_file`], except that it panics if it
    /// encounters an error.
    pub(crate) fn import_arbitrary_file(
        python: Python<'py>,
        path: PathBuf,
        import_as: &str,
    ) -> &'py PyModule {
        Self::try_import_arbitrary_file(python, path, import_as).unwrap()
    }

    /// Attempts to read an arbitrary Python file as a module with the desired name.
    pub(crate) fn try_import_arbitrary_file(
        python: Python<'py>,
        path: PathBuf,
        import_as: &str,
    ) -> Result<&'py PyModule, PyModuleImportError> {
        Ok(PyModule::from_code(
            python,
            &match std::fs::read_to_string(&path) {
                Ok(code) => code,
                Err(err) if matches!(err.kind(), std::io::ErrorKind::NotFound) => {
                    return Err(PyModuleImportError::FileNotFound);
                }
                Err(err) => {
                    panic!(
                        "Encountered an error when trying to read {} (exact error: {err:?})",
                        path.display()
                    );
                }
            },
            &path.to_string_lossy(),
            import_as,
        )?)
    }

    /// Imports the necessary modules which are required for the Python runner
    /// to function.
    ///
    /// The [`PyModule`] returned is a reference to
    /// `lib/execution/src/runner/python/runner.py` (imported as `runner`)
    pub(crate) fn import_necessary_modules(python: Python<'py>) -> &'py PyModule {
        Self::import_arbitrary_file(
            python,
            "./lib/execution/src/runner/python/shmem.py".into(),
            "shmem",
        );
        Self::import_arbitrary_file(
            python,
            "./lib/execution/src/runner/python/context.py".into(),
            "context",
        );
        Self::import_arbitrary_file(
            python,
            "./lib/execution/src/runner/python/util.py".into(),
            "util",
        );
        Self::import_arbitrary_file(
            python,
            "./lib/execution/src/runner/python/state.py".into(),
            "state",
        );
        Self::import_arbitrary_file(
            python,
            "./lib/execution/src/runner/python/sim.py".into(),
            "sim",
        );
        Self::import_arbitrary_file(
            python,
            "./lib/execution/src/runner/python/hash_util.py".into(),
            "hash_util",
        );
        Self::import_arbitrary_file(
            python,
            "./lib/execution/src/runner/python/batch.py".into(),
            "batch",
        );
        Self::import_arbitrary_file(
            python,
            "./lib/execution/src/runner/python/runner.py".into(),
            "runner",
        )
    }

    /// Constructs an instance of the Python `Runner` class (currently this is
    /// defined in `lib/execution/src/runner/python/runner.py`).
    pub(crate) fn get_py_funcs(runner: &PyModule) -> PyRunner {
        tracing::trace!("constructing Runner class");

        let class = runner.dict().get_item("Runner").unwrap();
        let class = class.getattr("__new__").unwrap().call1((class,)).unwrap();
        class.getattr("__init__").unwrap().call0().unwrap();

        py_runner::PyRunner {
            class: class.into_py(class.py()),
        }
    }
}

pub(crate) mod py_runner {
    use arrow2::{
        datatypes::Schema,
        io::ipc::write::{default_ipc_fields, schema_to_bytes},
    };
    use memory::shared_memory::arrow_continuation;
    use pyo3::{
        types::{PyBytes, PyDict, PyList, PyTuple},
        Py, PyAny, PyResult, Python, ToPyObject,
    };
    use stateful::global::Globals;

    use crate::package::simulation::SimulationId;

    /// This struct owns an instance (well, _the_ instance, because we only ever
    /// construct one instance of `PyRunner` per Python interpreter). By calling
    /// the various methods on this class, we can interface with the Python code.
    pub struct PyRunner {
        pub(crate) class: Py<PyAny>,
    }

    impl PyRunner {
        pub(crate) fn start_experiment(
            &self,
            py: Python<'_>,
            datasets: &PyDict,
            msg: &PyList,
            fns: &PyList,
        ) -> PyResult<Py<PyAny>> {
            tracing::trace!("calling Runner.start_experiment (in runner.py)");
            let result = self
                .class
                .getattr(py, "start_experiment")?
                .call1(
                    py,
                    PyTuple::new(py, &[
                        datasets.cast_as::<PyAny>().unwrap(),
                        msg.cast_as::<PyAny>().unwrap(),
                        fns.cast_as::<PyAny>().unwrap(),
                    ]),
                )
                .map_err(|e| {
                    e.print(py);
                    e
                })
                .unwrap();
            tracing::trace!("finished calling Runner.start_experiment (in runner.py)");

            Ok(result)
        }

        #[allow(clippy::too_many_arguments)]
        // TODO: we can reduce the number of arguments in this function by
        // creating new structs
        pub(crate) fn start_sim(
            &self,
            py: Python<'_>,
            sim_id: &str,
            agent_schema: &Schema,
            msg_schema: &Schema,
            ctx_schema: &Schema,
            package_ids: &[Py<PyAny>],
            package_msgs: &[String],
            globals: &Globals,
        ) -> PyResult<()> {
            let globals = serde_json::to_string(&globals).unwrap();

            self.class
                .getattr(py, "start_sim")?
                .call1(
                    py,
                    (
                        sim_id.to_object(py),
                        PyBytes::new(py, &schema_to_stream_bytes(agent_schema)),
                        PyBytes::new(py, &schema_to_stream_bytes(msg_schema)),
                        PyBytes::new(py, &schema_to_stream_bytes(ctx_schema)),
                        package_ids.to_object(py),
                        package_msgs.to_object(py),
                        globals.to_object(py),
                    ),
                )
                .map(|res| {
                    debug_assert!(res.is_none(py));
                })
        }

        pub(crate) fn ctx_batch_sync(
            &self,
            py: Python<'_>,
            sim_id: SimulationId,
            batch: &PyAny,
            indices: &[usize],
            current_step: usize,
        ) -> PyResult<()> {
            self.class
                .getattr(py, "ctx_batch_sync")?
                .call1(
                    py,
                    (
                        sim_id.as_u32().to_object(py),
                        batch,
                        indices.to_object(py),
                        current_step.to_object(py),
                    ),
                )
                .map(|res| {
                    debug_assert!(res.is_none(py));
                })
        }

        pub(crate) fn state_sync(
            &self,
            py: Python<'_>,
            sim_id: SimulationId,
            agent_pool: &PyList,
            msg_pool: &PyList,
        ) -> PyResult<()> {
            self.class
                .getattr(py, "state_sync")?
                .call1(py, (sim_id.as_u32().to_object(py), agent_pool, msg_pool))
                .map(|r| {
                    debug_assert!(r.is_none(py));
                })
        }

        pub(crate) fn state_interim_sync(
            &self,
            py: Python<'_>,
            sim_id: SimulationId,
            indices: &[usize],
            agent_batches: &PyList,
            msg_batches: &PyList,
        ) -> PyResult<()> {
            self.class
                .getattr(py, "state_interim_sync")?
                .call1(
                    py,
                    (
                        sim_id.as_u32().to_object(py),
                        indices.to_object(py),
                        agent_batches,
                        msg_batches,
                    ),
                )
                .map(|res| {
                    debug_assert!(res.is_none(py));
                })
        }

        pub(crate) fn state_snapshot_sync(
            &self,
            py: Python<'_>,
            sim_id: SimulationId,
            agent_pool: &PyList,
            msg_pool: &PyList,
        ) -> PyResult<()> {
            self.class
                .getattr(py, "state_snapshot_sync")?
                .call1(py, (sim_id.as_u32().to_object(py), agent_pool, msg_pool))
                .map(|res| {
                    debug_assert!(res.is_none(py));
                })
        }

        pub(crate) fn run_task(&self, py: Python<'_>, args: &[Py<PyAny>]) -> PyResult<Py<PyAny>> {
            self.class
                .getattr(py, "run_task")?
                .call1(py, PyTuple::new(py, args))
        }
    }

    fn schema_to_stream_bytes(schema: &Schema) -> Vec<u8> {
        let content = schema_to_bytes(schema, &default_ipc_fields(&schema.fields));
        let mut stream_bytes = arrow_continuation(content.len());
        stream_bytes.extend_from_slice(&content);
        stream_bytes
    }
}

#[derive(Debug)]
pub enum PyModuleImportError {
    PyErr(PyErr),
    FileNotFound,
}

impl From<PyErr> for PyModuleImportError {
    fn from(py_err: PyErr) -> Self {
        Self::PyErr(py_err)
    }
}
