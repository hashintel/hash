#![allow(clippy::cast_possible_wrap)]

use std::sync::Arc;

use arrow::ipc::{
    reader::read_record_batch,
    writer::{DictionaryTracker, IpcDataGenerator, IpcWriteOptions},
};
use rayon::iter::{
    IndexedParallelIterator, IntoParallelIterator, IntoParallelRefIterator, ParallelIterator,
};

use super::Batch as BatchRepr;
use crate::{
    datastore::{arrow::meta_conversion::get_dynamic_meta_flatbuffers, prelude::*},
    proto::ExperimentId,
    simulation::package::context::ContextColumn,
};

// If required data size is 3 times less than current data size
// then shmem size will be readjusted
const UPPER_BOUND_DATA_SIZE_MULTIPLIER: usize = 3;

pub type AgentIndex = (u32, u32);
pub type MessageIndex = (u32, u32, u32);

/// Contains the information required to build the `context` object accessible in the language
/// runners.
///
/// Data within the `ContextBatch` can rely on the contents of the **Agent** and **Message
/// Pools** within the **Context** object. For example, the list of neighbors in the `ContextBatch`
/// is a collection of indices pointing to different agents within the **Agent Pool**.
pub struct ContextBatch {
    pub(crate) memory: Memory,
    pub(crate) metaversion: Metaversion,
    pub(crate) batch: RecordBatch,
}

impl BatchRepr for ContextBatch {
    fn memory(&self) -> &Memory {
        &self.memory
    }

    fn memory_mut(&mut self) -> &mut Memory {
        &mut self.memory
    }

    fn metaversion(&self) -> &Metaversion {
        &self.metaversion
    }

    fn metaversion_mut(&mut self) -> &mut Metaversion {
        &mut self.metaversion
    }

    fn maybe_reload(&mut self, _metaversion: Metaversion) -> Result<()> {
        Err(Error::from("`maybe_reload` is not implemented"))
    }

    fn reload(&mut self) -> Result<()> {
        Err(Error::from("`reload` is not implemented"))
    }
}

impl ContextBatch {
    pub fn from_record_batch(
        record_batch: &RecordBatch,
        schema: Option<&Arc<ArrowSchema>>,
        experiment_id: &ExperimentId,
    ) -> Result<Self> {
        let ipc_data_generator = IpcDataGenerator::default();
        let mut dictionary_tracker = DictionaryTracker::new(true);
        let (_, encoded_data) = ipc_data_generator.encoded_batch(
            record_batch,
            &mut dictionary_tracker,
            &IpcWriteOptions::default(),
        )?;

        let memory = Memory::from_batch_buffers(
            experiment_id,
            &[],
            &[],
            &encoded_data.ipc_message,
            &encoded_data.arrow_data,
            false,
        )?;
        Self::from_memory(memory, schema)
    }

    pub fn from_memory(memory: Memory, schema: Option<&Arc<ArrowSchema>>) -> Result<Self> {
        let (schema_buffer, _, meta_buffer, data_buffer) = memory.get_batch_buffers()?;
        let schema = if let Some(s) = schema {
            s.clone()
        } else {
            let message = arrow_ipc::root_as_message(schema_buffer)?;
            let ipc_schema = match message.header_as_schema() {
                Some(s) => s,
                None => return Err(Error::ArrowSchemaRead),
            };
            Arc::new(arrow_ipc::convert::fb_to_schema(ipc_schema))
        };
        let rb_msg = arrow_ipc::root_as_message(meta_buffer)?
            .header_as_record_batch()
            .ok_or(Error::InvalidRecordBatchIpcMessage)?;
        let batch = read_record_batch(data_buffer, rb_msg, schema, &[])?;

        Ok(Self {
            memory,
            metaversion: Metaversion::default(),
            batch,
        })
    }

    pub fn write_from_context_datas(
        &mut self,
        column_writers: &[&ContextColumn],
        num_elements: usize,
    ) -> Result<()> {
        if column_writers.is_empty() {
            return Err(Error::from("Expected context datas to not be empty"));
        }

        let column_dynamic_meta_list = column_writers
            .iter()
            .map(|column_writer| column_writer.get_dynamic_metadata())
            .collect::<Result<Vec<_>>>()?;
        let dynamic =
            DynamicMeta::from_column_dynamic_meta_list(&column_dynamic_meta_list, num_elements);

        let current_data_size = self.memory.get_data_buffer_len()?;
        if current_data_size < dynamic.data_length {
            self.metaversion
                .increment_with(&self.memory.set_data_length(dynamic.data_length)?);
        } else if current_data_size > UPPER_BOUND_DATA_SIZE_MULTIPLIER * dynamic.data_length {
            self.metaversion.increment_with(
                &self
                    .memory
                    .shrink_memory_with_data_length(dynamic.data_length)?,
            );
        }

        debug_assert!(self.memory.get_data_buffer_len()? >= dynamic.data_length);
        let data = self.memory.get_mut_data_buffer()?;

        let mut next_offset = 0;
        let writable_datas = column_dynamic_meta_list
            .iter()
            .map(move |column_meta| {
                let length = column_meta.byte_length();
                let old_offset = next_offset;
                next_offset = old_offset + length; // TODO: check this is correct
                unsafe { std::slice::from_raw_parts_mut(&mut data[old_offset] as *mut _, length) }
            })
            .collect::<Vec<_>>();

        // We need the span to be captured and entered within the parallel iterator
        let current_span = tracing::Span::current();
        column_writers
            .par_iter()
            .zip_eq(writable_datas.into_par_iter())
            .zip_eq(column_dynamic_meta_list.par_iter())
            .try_for_each(|((column_writer, buffer), meta)| {
                let _span = current_span.enter();
                column_writer.write(buffer, meta)
            })?;

        self.metaversion.increment_batch();

        let meta_buffer = get_dynamic_meta_flatbuffers(&dynamic)?;
        self.memory.set_metadata(&meta_buffer)?;

        // Reload batch
        let (_, _, meta_buffer, data_buffer) = self.memory.get_batch_buffers()?;
        let rb_msg = &arrow_ipc::root_as_message(meta_buffer)?
            .header_as_record_batch()
            .ok_or(Error::InvalidRecordBatchIpcMessage)?;
        self.batch = read_record_batch(data_buffer, *rb_msg, self.batch.schema(), &[])?;

        Ok(())
    }
}
