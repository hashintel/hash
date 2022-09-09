//! Converts between values between their Python and Rust representations.

use memory::shared_memory::Segment;
use pyo3::{
    types::{PyDict, PyList},
    PyAny, PyResult, ToPyObject,
};
use stateful::{agent::AgentBatch, message::MessageBatch};

use super::PyHandle;

impl<'py> PyHandle<'py> {
    /// Converts the state ([`AgentBatch`]es and [`MessageBatch`]es) into their Python
    /// representations.
    ///
    /// This creates two lists (the first for the agent batches and the second
    /// for the message batches). Both lists have the following structure
    ///
    /// ```ignore
    /// List[Dictionary { "id": <the batch id>, "mem": <a Python SharedMemory object> }]
    /// ```
    pub(super) fn python_of_state<'a>(
        &self,
        agent_batches: impl Iterator<Item = &'a AgentBatch>,
        message_batches: impl Iterator<Item = &'a MessageBatch>,
    ) -> PyResult<(&'py PyList, &'py PyList)> {
        let mut py_agent_batches = vec![];
        let mut py_message_batches = vec![];
        for (agent_batch, message_batch) in
            agent_batches.into_iter().zip(message_batches.into_iter())
        {
            let agent_batch = self.create_batch_object(agent_batch.batch.segment())?;
            py_agent_batches.push(agent_batch);
            let message_batch = self.create_batch_object(message_batch.batch.segment())?;
            py_message_batches.push(message_batch);
        }
        Ok((
            PyList::new(self.py, py_agent_batches),
            PyList::new(self.py, py_message_batches),
        ))
    }

    /// Creates a Python batch object.
    ///
    /// This is a dictionary with the following keys
    ///     - "id": <string> (this is the shared memory segment id)
    ///     - "mem": <multiprocessing.shared_memory.SharedMemory> (this is the shared memory
    ///       segment)
    pub(super) fn create_batch_object(&self, segment: &Segment) -> PyResult<&'py PyAny> {
        let shared_memory = self.shmem_to_py(segment)?;
        let id = segment.id();
        let dict = PyDict::new(self.py);
        dict.set_item("mem", shared_memory)?;
        dict.set_item("id", id)?;
        Ok(dict
            .cast_as::<PyAny>()
            .expect("should not fail converting concrete Python type to any type"))
    }

    /// Creates a Python pointer to the given shared-memory segment.
    fn shmem_to_py(&self, segment: &Segment) -> PyResult<&'py PyAny> {
        let py_shmem = self
            .py
            .import("multiprocessing.shared_memory")?
            .getattr("SharedMemory")?;
        let py_shmem = py_shmem.getattr("__new__")?.call1((py_shmem,))?;
        py_shmem
            .getattr("__init__")?
            .call((), {
                let dict = PyDict::new(self.py);
                dict.set_item("name", segment.id()).unwrap();
                dict.set_item("create", false.to_object(self.py)).unwrap();
                Some(dict)
            })
            .expect("failed to create the shared memory segment");
        Ok(py_shmem)
    }
}
