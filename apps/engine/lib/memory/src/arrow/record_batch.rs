use std::sync::Arc;

use arrow2::{
    array::Array,
    chunk::Chunk,
    datatypes::Schema,
    io::ipc::{write::default_ipc_fields, IpcSchema},
};

/// A record batch is a common abstraction introduced to manipulate Arrow
/// columns which belong together. All the columns must have the same length;
/// this restriction makes is possible to store values which belong together
/// logically, but are likely to be accessed separately in a manner which takes
/// advantage of the design of modern CPU caches.
///
/// **Usually the ith entry of every column corresponds to the same logical
/// X** (X could be a number of things, e.g. an agent or a message). For
/// example, we have a record batch which stores agent state. Each agent has
/// a number of different fields (e.g. name, position, direction, velocity,
/// etc.) We are unlikely to access all these fields at the same time, so it
/// makes sense to store them in separate columns (as this increases the
/// percentage of memory accesses are cache hits if, for example, we were to
/// iterate through the positions of all the agents in the agent batch), but we
/// do want to be able to access all the fields of an arbitrary agent (provided
/// we have its index, this is relatively uncomplicated because we can just
/// select the ith entry of all the columns in the record batch to get all the
/// fields of the ith agent - here `i` denotes the index of the agent in
/// question).
///
/// A [`RecordBatch`] is not technically part of the Arrow specification (only
/// the IPC format - i.e. the format we use to (de)serialize Arrow columns into
/// raw bytes).
#[derive(Debug, PartialEq)]
pub struct RecordBatch {
    /// The schema which describes the columns in this [`RecordBatch`].
    schema: Arc<Schema>,
    /// The underlying columns. Each column stores the data for a specific
    /// field. Note that all columns must have the same length.
    columns: Chunk<Box<dyn Array>>,
}

impl RecordBatch {
    /// Creates a new [`RecordBatch`]
    ///
    /// When compiled in debug mode, this struct will check that the
    /// actual [`Array`]s in the [`RecordBatch`] match the [`Schema`].
    pub fn new(schema: Arc<Schema>, columns: Chunk<Box<dyn Array>>) -> Self {
        #[cfg(debug_assertions)]
        {
            for (i, (field, array)) in schema.fields.iter().zip(columns.iter()).enumerate() {
                assert_eq!(
                    field.data_type(),
                    array.data_type(),
                    "the datatype declared in the schema for column {i} and the datatype of the \
                     array in the position do not match"
                )
            }
        }

        Self { schema, columns }
    }

    /// Computes the needed [`IpcSchema`] for the given [`RecordBatch`]
    pub fn ipc_schema(&self) -> IpcSchema {
        IpcSchema {
            fields: default_ipc_fields(&self.schema.fields),
            is_little_endian: true,
        }
    }

    /// Calculates the number of rows the [`RecordBatch`] has.
    pub fn num_rows(&self) -> usize {
        // we can just check the first column here because (this is TODO) when we create the
        // [`RecordBatch`] we check that all the columns have the same length

        // if there are no columns then we definitely don't have any rows, so return 0
        self.columns.get(0).map(|col| col.len()).unwrap_or(0)
    }

    /// Returns the schema of the RecordBatch.
    pub fn schema(&self) -> Arc<Schema> {
        self.schema.clone()
    }

    /// Returns a reference to the columns in the RecordBatch.
    pub fn columns(&self) -> &[Box<dyn Array>] {
        self.columns.as_ref()
    }

    /// Retrieves the column at the provided index in the [`RecordBatch`]. This function will panic
    /// if the requested index cannot be found. [`RecordBatch::try_column`] will return [`None`]
    /// instead of panicking.
    // this is necessary, because GrowableArrayData is implemented for Box<dyn Array> but not
    // &dyn Array
    #[allow(clippy::borrowed_box)]
    pub fn column(&self, index: usize) -> &Box<dyn Array> {
        &self.columns[index]
    }

    /// Attempt to retrieve a column, returning `None` if the column at the provided index could not
    /// be found.
    // this is necessary, because GrowableArrayData is implemented for Box<dyn Array> but not
    // &dyn Array
    #[allow(clippy::borrowed_box)]
    pub fn try_column(&self, index: usize) -> Option<&Box<dyn Array>> {
        self.columns.get(index)
    }
}
