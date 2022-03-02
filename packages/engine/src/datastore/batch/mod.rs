pub mod agent;
pub mod boolean;
pub mod change;
pub mod context;
pub mod dataset;
pub mod flush;
pub mod iterators;
pub mod message;
pub mod metaversion;
pub mod migration;

pub use agent::AgentBatch;
pub use context::{AgentIndex, ContextBatch, MessageIndex};
pub use dataset::Dataset;
pub use message::MessageBatch;
pub use metaversion::Metaversion;

use super::{
    arrow::ipc::{record_batch_data_to_bytes_owned_unchecked, simulate_record_batch_to_bytes},
    prelude::*,
};
use crate::datastore::batch::change::ArrayChange;

pub trait Batch: Sized {
    fn memory(&self) -> &Memory;
    fn memory_mut(&mut self) -> &mut Memory;
    fn metaversion(&self) -> &Metaversion;
    fn metaversion_mut(&mut self) -> &mut Metaversion;
    fn maybe_reload(&mut self, metaversion: Metaversion) -> Result<()>;
    fn reload(&mut self) -> Result<()>;

    fn get_batch_id(&self) -> &str {
        self.memory().get_id()
    }
}

pub trait ArrowBatch: Batch {
    /// Reload the recordbatch
    fn reload_record_batch(&mut self) -> Result<()> {
        debug_assert!(self.memory().validate_markers());
        let rb_msg = load::record_batch_message(self)?;
        *self.record_batch_mut() = load::record_batch(self, rb_msg, self.record_batch().schema())?;
        Ok(())
    }

    fn record_batch(&self) -> &RecordBatch;
    fn record_batch_mut(&mut self) -> &mut RecordBatch;
}

pub trait DynamicBatch: ArrowBatch {
    fn push_change(&mut self, change: ArrayChange) -> Result<()>;
    fn flush_changes(&mut self) -> Result<()>;

    fn reload_record_batch_and_dynamic_meta(&mut self) -> Result<()> {
        let rb_msg = load::record_batch_message(self)?;
        let dynamic_meta = rb_msg.into_meta(self.memory().get_data_buffer()?.len())?;
        *self.record_batch_mut() = load::record_batch(self, rb_msg, self.record_batch().schema())?;
        *self.dynamic_meta_mut() = dynamic_meta;
        Ok(())
    }

    fn copy_from_record_batch(&mut self, record_batch: &RecordBatch) -> Result<()> {
        // Get arrow meta buffer and data length
        let (meta_buffer, data_len) = simulate_record_batch_to_bytes(record_batch);

        // Ensure that data length is correct
        let change = &self.memory_mut().set_data_length(data_len)?;
        self.metaversion_mut().increment_with(change);
        // Write the metadata
        self.memory_mut().set_metadata(&meta_buffer)?;

        // Write data_len
        let data_buffer = self.memory_mut().get_mut_data_buffer()?;
        // Write new data
        record_batch_data_to_bytes_owned_unchecked(record_batch, data_buffer);
        self.reload_record_batch()?;
        self.metaversion_mut().increment_batch();

        // Reload dynamic meta
        let batch_message = arrow_ipc::root_as_message(meta_buffer.as_ref())?
            .header_as_record_batch()
            .ok_or_else(|| Error::ArrowBatch("Couldn't read message".into()))?;

        *self.dynamic_meta_mut() = batch_message.into_meta(data_len)?;

        Ok(())
    }

    fn sync(&mut self, batch: &Self) -> Result<()> {
        if self.memory().size < batch.memory().size {
            self.memory_mut().resize(batch.memory().size)?;
            self.metaversion_mut().increment();
        }
        let src = batch.memory().get_contents_bytes()?;
        debug_assert!(src.len() <= batch.memory().size);
        debug_assert!(
            self.memory().size >= src.len(),
            "self.size ({}) !>= src.len() ({})",
            self.memory().size,
            src.len()
        );
        self.memory_mut().overwrite_no_bounds_check(src)?;
        *self.dynamic_meta_mut() = batch.dynamic_meta().clone();
        self.reload_record_batch()?;
        self.metaversion_mut().increment_batch();
        Ok(())
    }

    fn dynamic_meta(&self) -> &DynamicMeta;
    fn dynamic_meta_mut(&mut self) -> &mut DynamicMeta;
}

mod load {
    use std::sync::Arc;

    use arrow::ipc::reader::read_record_batch;

    use super::*;

    /// Read the Arrow RecordBatch metadata from memory
    pub fn record_batch_message<K: Batch>(batch: &K) -> Result<RecordBatchMessage<'_>> {
        let (_, _, meta_buffer, _) = batch.memory().get_batch_buffers()?;
        arrow_ipc::root_as_message(meta_buffer)?
            .header_as_record_batch()
            .ok_or(Error::InvalidRecordBatchIpcMessage)
    }

    pub fn record_batch<'a, K: Batch>(
        batch: &'a K,
        rb_msg: RecordBatchMessage<'a>,
        schema: Arc<ArrowSchema>,
    ) -> Result<RecordBatch> {
        let (_, _, _, data_buffer) = batch.memory().get_batch_buffers()?;
        Ok(read_record_batch(data_buffer, rb_msg, schema, &[])?)
    }
}
