//! Contains the code required to initialize a Python runner.

use std::path::PathBuf;

use pyo3::{
    types::{PyFunction, PyList, PyModule, PyTuple},
    IntoPy, Py, PyAny, PyResult, Python,
};

use super::{package::PyPackage, PyHandle};
use crate::runner::comms::ExperimentInitRunnerMsg;

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
    ) -> PyResult<PyHandle<'py>> {
        // first we load the datasets...
        let datasets = {
            let upgraded = init_msg.shared_context.upgrade().expect(
                "failed to obtain access to the shared store (this is a bug: it should not be \
                 possible for the ExperimentController to be dropped before a Javascript runner)",
            );
            PyHandle::load_datasets(py, upgraded.as_ref())
        }?;

        // ... now we load the package configurations ...
        let package_config = &init_msg.package_config.0;

        let (package_functions, package_names) = {
            let mut package_functions = Vec::with_capacity(package_config.len());
            let mut package_names = Vec::with_capacity(package_config.len());

            for package_init_msg in package_config.values() {
                let package = PyPackage::import_package(
                    py,
                    package_init_msg.name.to_string().as_str(),
                    package_init_msg.r#type,
                )?;

                package_functions.push(package);

                package_names.push(package_init_msg.name.to_string());
            }

            (package_functions, package_names)
        };

        // ... we now convert the package configurations into native Python code
        let package_functions = PyList::new(py, package_functions);
        let package_names = PyList::new(py, package_names);

        // ... here we import pyarrow
        // TODO: if we can't import it, we should abort and notify the user that they need to set up
        // the virtual environment
        let pyarrow = py.import("pyarrow")?;

        // ... now we load the Python functions
        let py_functions = Self::get_py_funcs(Self::import_runner_module(py));

        let args = vec![
            datasets.cast_as::<PyAny>().unwrap(),
            package_names.cast_as::<PyAny>().unwrap(),
            package_functions.cast_as::<PyAny>().unwrap(),
        ];

        py_functions
            .start_experiment
            .call1(py, PyTuple::new(py, args))?;

        Ok(Self {
            py,
            pyarrow: pyarrow.into_py(py),
            py_functions,
            simulation_states: Default::default(),
        })
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
    ) -> Result<&'py PyModule, pyo3::PyErr> {
        PyModule::from_code(
            python,
            &std::fs::read_to_string(&path).unwrap(),
            &path.to_string_lossy(),
            import_as,
        )
    }

    /// Imports `runner.py` as a module.
    pub(crate) fn import_runner_module(python: Python<'py>) -> &'py PyModule {
        Self::import_arbitrary_file(
            python,
            "./lib/execution/src/runner/python/runner.py".into(),
            "runner",
        )
    }

    /// Retrieves the Python functions we need (these are all defined in the runner module).
    pub(crate) fn get_py_funcs(runner: &PyModule) -> PyFunctions {
        let res = [
            "start_experiment",
            "start_sim",
            "run_task",
            "ctx_batch_sync",
            "state_sync",
            "state_interim_sync",
            "state_snapshot_sync",
        ]
        .into_iter()
        .map(|name| {
            let function = runner
                .getattr(name)
                .unwrap()
                .cast_as::<PyFunction>()
                .unwrap();

            function
        })
        .collect::<Vec<_>>();

        PyFunctions {
            start_experiment: res[0].into_py(runner.py()),
            start_sim: res[1].into_py(runner.py()),
            run_task: res[2].into_py(runner.py()),
            ctx_batch_sync: res[3].into_py(runner.py()),
            state_sync: res[4].into_py(runner.py()),
            state_interim_sync: res[5].into_py(runner.py()),
            state_snapshot_sync: res[6].into_py(runner.py()),
        }
    }
}

pub struct PyFunctions {
    pub(crate) start_experiment: Py<PyFunction>,
    pub(crate) start_sim: Py<PyFunction>,
    pub(crate) run_task: Py<PyFunction>,
    pub(crate) ctx_batch_sync: Py<PyFunction>,
    pub(crate) state_sync: Py<PyFunction>,
    pub(crate) state_interim_sync: Py<PyFunction>,
    pub(crate) state_snapshot_sync: Py<PyFunction>,
}
