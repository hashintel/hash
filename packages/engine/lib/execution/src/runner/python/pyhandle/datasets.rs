//! Loads the datasets

// TODO: deduplicate with JS once https://github.com/hashintel/hash/pull/1001 lands

use pyo3::{types::PyDict, PyResult, Python};
use stateful::global::SharedStore;

use super::PyHandle;

impl<'py> PyHandle<'py> {
    /// Loads a Python dictionary whose key-value pairs are the contents of the datasets in the
    /// provided [`SharedStore`].
    ///
    /// Note: dataset data is JSON-encoded.
    pub(crate) fn load_datasets(
        py: Python<'py>,
        shared_ctx: &SharedStore,
    ) -> PyResult<&'py PyDict> {
        let dataset_dict = PyDict::new(py);
        for (name, value) in shared_ctx.datasets.iter() {
            let json_data = value.data();
            let json_data = std::str::from_utf8(json_data)
                .expect("the data segment's contents must be utf-8 encoded");
            dataset_dict.set_item(name, json_data)?;
        }
        Ok(dataset_dict)
    }
}
