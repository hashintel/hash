use std::sync::Arc;

use arrow2::{
    array::ArrayRef,
    chunk::Chunk,
    datatypes::Schema,
    io::ipc::{write::default_ipc_fields, IpcSchema},
};

/// A record batch is a common abstraction introduced to handle Arrow columns (particularly moving
/// them over the IPC boundary).
#[derive(Debug, PartialEq)]
pub struct RecordBatch {
    /// The schema which describes the columns in this [`RecordBatch`].
    schema: Arc<Schema>,
    /// The underlying columns. Each column stores the data for a specific field.
    columns: Chunk<ArrayRef>,
}

impl RecordBatch {
    /// Creates a new [`RecordBatch`]
    ///
    /// When compiled in debug mode, this struct will check that the [`RecordBatch`] is well-formed.
    pub fn new(schema: Arc<Schema>, columns: Chunk<ArrayRef>) -> Self {
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

        self.columns.get(0)
            .map(|col| col.len())
            // if there are no columns then we definitely don't have any rows, so return 0
            .unwrap_or(0)
    }

    /// Returns the schema of the RecordBatch.
    pub fn schema(&self) -> Arc<Schema> {
        self.schema.clone()
    }

    /// Returns a reference to the columns in the RecordBatch.
    pub fn columns(&self) -> &[ArrayRef] {
        self.columns.as_ref()
    }

    /// Retrieves the column at the provided index in the [`RecordBatch`]. This function will panic
    /// if the requested index cannot be found. [`RecordBatch::try_column`] will return [`None`]
    /// instead of panicking.
    pub fn column(&self, index: usize) -> &ArrayRef {
        &self.columns[index]
    }

    /// Retrieve
    pub fn try_column(&self, index: usize) -> Option<&ArrayRef> {
        self.columns.get(index)
    }
}
