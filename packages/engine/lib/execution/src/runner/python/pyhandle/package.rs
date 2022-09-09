use pyo3::{
    exceptions::{PyAttributeError, PyTypeError},
    prelude::*,
    types::{PyDict, PyFunction},
};

use super::{init::PyModuleImportError, PyHandle};
use crate::package::simulation::PackageType;

/// This struct is the Python representation of an Engine package. It contains
/// the three functions which packages may define.
///
/// This type implements [`ToPyObject`] which converts it to a Python
/// dictionary with the relevant fields.
pub(crate) struct PyPackage<'py> {
    pub(crate) start_experiment: Option<&'py PyFunction>,
    pub(crate) start_sim: Option<&'py PyFunction>,
    pub(crate) run_task: Option<&'py PyFunction>,
}

impl<'py> PyPackage<'py> {
    /// Creates a new [`PyPackage`] referencing the relevant the package object.
    ///
    /// This imports the file containing the code for the package (if it exists)
    /// and extracts the necessary functions.
    pub(crate) fn import_package(
        py: Python<'py>,
        package_name: &str,
        package_type: PackageType,
    ) -> PyResult<Option<PyPackage<'py>>> {
        let path = get_pkg_path(package_name, package_type);

        let module = match PyHandle::try_import_arbitrary_file(py, path.into(), package_name) {
            Ok(module) => module,
            Err(PyModuleImportError::FileNotFound) => {
                tracing::debug!(
                    "Could not read Python package file for package `{}` (note: the package may \
                     intentionally not exist).`",
                    package_name
                );
                return Ok(None);
            }
            Err(e) => {
                panic!("{e:?}");
            }
        };

        let functions = ["start_experiment", "start_sim", "run_task"];

        let functions: Vec<Option<&PyFunction>> = functions
            .into_iter()
            .map(|name: &str| {
                let attr = match module.getattr(name) {
                    Ok(attr) => attr,
                    // TODO: does this check need to be more fine-grained?
                    Err(py_err) if py_err.is_instance_of::<PyAttributeError>(py) => {
                        return Ok(None);
                    }
                    e @ Err(_) => e?,
                };

                if let Ok(func) = attr.cast_as::<PyFunction>() {
                    Ok(Some(func))
                } else if attr.is_none() {
                    Ok(None)
                } else {
                    Err(PyErr::new::<PyTypeError, _>("type error"))
                }
            })
            .collect::<Result<_, _>>()?;

        Ok(Some(PyPackage {
            start_experiment: functions[0],
            start_sim: functions[1],
            run_task: functions[2],
        }))
    }
}

impl<'py> ToPyObject for PyPackage<'py> {
    fn to_object(&self, py: Python<'_>) -> PyObject {
        let object = PyDict::new(py);
        object
            .set_item("start_experiment", self.start_experiment)
            .unwrap();
        object.set_item("start_sim", self.start_sim).unwrap();
        object.set_item("run_task", self.run_task).unwrap();
        object.to_object(py)
    }
}

/// Retrieves the path at which the given package resides.
fn get_pkg_path(pkg_name: &str, pkg_type: PackageType) -> String {
    format!("./lib/execution/src/package/simulation/{pkg_type}/{pkg_name}/package.py")
}
