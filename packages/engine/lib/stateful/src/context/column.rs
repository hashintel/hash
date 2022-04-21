use memory::arrow::meta::ColumnDynamicMetadata;
use tracing::Span;

use crate::{field::RootFieldKey, Result};

/// Encapsulates the functionality of writing a specific column within the context batch.
///
/// Wrapping the logic within this struct allows the caller (i.e. the root context package) to
/// split up memory into relevant buffers and then independently write to them in any order, even
/// if a context package's columns aren't next to one another in memory. (It's necessary to reorder
/// by the [`RootFieldKey`] to match the schema for the batch)
pub struct ContextColumn {
    field_key: RootFieldKey,
    writer: Box<dyn ContextColumnWriter + Send + Sync>,
    span: Span,
}

impl ContextColumn {
    pub fn new(
        field_key: RootFieldKey,
        writer: Box<dyn ContextColumnWriter + Send + Sync>,
        span: Span,
    ) -> Self {
        Self {
            field_key,
            writer,
            span,
        }
    }

    pub fn dynamic_metadata(&self) -> Result<ColumnDynamicMetadata> {
        self.writer.dynamic_metadata()
    }

    pub fn field_key(&self) -> &RootFieldKey {
        &self.field_key
    }

    pub(in crate::context) fn write(
        &self,
        buffer: &mut [u8],
        meta: &ColumnDynamicMetadata,
    ) -> Result<()> {
        let _pkg_span = self.span.enter();
        let _write_span = tracing::trace_span!("column_write").entered();
        self.writer.write(buffer, meta)
    }
}

/// Provides the functionalities of writing a [`ContextColumn`] into the [`ContextBatch`].
///
/// Implementing this trait allows the creation of trait-objects so that the root context package
/// can call the writing functionality in whatever order it needs, and therefore the other context
/// packages do not need to be aware of one another.
///
/// [`ContextBatch`]: crate::context::ContextBatch
pub trait ContextColumnWriter {
    /// Gives the associated metadata for the column, describing the necessary memory layout and
    /// size.
    fn dynamic_metadata(&self) -> Result<ColumnDynamicMetadata>;

    /// Takes a mutable slice of memory to write into, a description of the expectations about
    /// that memory and writes the data for the context column.
    ///
    /// The expectations (i.e. the metadata) of the memory has to match
    /// [`self.get_dynamic_metadata()`].
    fn write(&self, buffer: &mut [u8], meta: &ColumnDynamicMetadata) -> Result<()>;
}
