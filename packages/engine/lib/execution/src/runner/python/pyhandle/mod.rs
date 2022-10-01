pub(crate) mod datasets;
pub(crate) mod flush;
pub(crate) mod init;
pub(crate) mod msg;
pub(crate) mod package;
pub(crate) mod start;
pub(crate) mod state;
pub(crate) mod sync;
pub(crate) mod task;

use std::collections::HashMap;

use arrow2::{
    array::Array,
    datatypes::DataType,
    ffi::{import_array_from_c, import_field_from_c, ArrowArray, ArrowSchema},
};
use pyo3::{ffi::Py_uintptr_t, prelude::*};

use self::init::py_runner::PyRunner;
use crate::{package::simulation::SimulationId, runner::common_to_runners::SimState};

/// This struct maintains a handle to the underlying [`Python`] interpreter.
// TODO: at various points use the PyO3 `intern!` macro when we access fields
pub struct PyHandle<'py> {
    py: Python<'py>,
    pyarrow: Py<PyModule>,
    py_functions: PyRunner,
    simulation_states: HashMap<SimulationId, SimState>,
}

impl<'py> PyHandle<'py> {
    pub(super) fn release_gil(self) -> SavedPyHandle {
        SavedPyHandle {
            pyarrow: self.pyarrow,
            py_functions: self.py_functions,
            simulation_states: self.simulation_states,
        }
    }
}

pub struct SavedPyHandle {
    pyarrow: Py<PyModule>,
    py_functions: PyRunner,
    simulation_states: HashMap<SimulationId, SimState>,
}

impl SavedPyHandle {
    pub(super) fn acquire_gil(self, py: Python) -> PyHandle {
        PyHandle {
            py,
            pyarrow: self.pyarrow,
            py_functions: self.py_functions,
            simulation_states: self.simulation_states,
        }
    }
}

impl<'py> PyHandle<'py> {
    /// Converts a Python (pyarrow) Arrow array to a Rust ([`arrow2`]) one.
    ///
    /// Note that no analagous function exists for Rust->Python because to
    /// transfer arrays the other way, Python simply reads them from the
    /// shared-memory segment.
    fn rust_of_python_array(
        &self,
        arrow_array: &PyAny,
        data_type: DataType,
    ) -> PyResult<Box<dyn Array>> {
        let array = Box::new(ArrowArray::empty());
        let schema = Box::new(ArrowSchema::empty());

        let array_ptr = &*array as *const ArrowArray;
        let schema_ptr = &*schema as *const ArrowSchema;

        arrow_array.call_method1(
            "_export_to_c",
            (array_ptr as Py_uintptr_t, schema_ptr as Py_uintptr_t),
        )?;

        unsafe {
            let field = import_field_from_c(&schema).unwrap();
            assert_eq!(field.data_type, data_type);
            let array: Box<dyn Array> = import_array_from_c(*array, data_type).unwrap();
            Ok(array)
        }
    }
}
