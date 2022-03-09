#![allow(clippy::cast_possible_wrap)]

use std::{ops::Deref, sync::Arc};

use arrow::ipc::{
    reader::read_record_batch,
    writer::{DictionaryTracker, IpcDataGenerator, IpcWriteOptions},
};
use rayon::iter::{
    IndexedParallelIterator, IntoParallelIterator, IntoParallelRefIterator, ParallelIterator,
};

use crate::{
    datastore::{arrow::meta_conversion::get_dynamic_meta_flatbuffers, batch::Segment, prelude::*},
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
    segment: Segment,
    batch: RecordBatch,
    loaded: Metaversion,
}

impl Deref for ContextBatch {
    type Target = Segment;

    fn deref(&self) -> &Self::Target {
        &self.segment
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
        let header = Metaversion::default().to_le_bytes();
        let (_, encoded_data) = ipc_data_generator.encoded_batch(
            record_batch,
            &mut dictionary_tracker,
            &IpcWriteOptions::default(),
        )?;

        let memory = Memory::from_batch_buffers(
            experiment_id,
            &[],
            &header,
            &encoded_data.ipc_message,
            &encoded_data.arrow_data,
            false,
        )?;
        Self::from_memory(memory, schema)
    }

    pub fn from_memory(memory: Memory, schema: Option<&Arc<ArrowSchema>>) -> Result<Self> {
        let persisted = memory.get_metaversion()?;
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
            segment: Segment(memory),
            loaded: persisted,
            batch,
        })
    }

    /// Overwrite context batch with given columns.
    ///
    /// The underlying shared memory is resized if either the
    /// new data is bigger than the existing capacity, or the
    /// new data is much smaller than the existing capacity, so
    /// we can make the capacity smaller.
    ///
    /// The written data doesn't necessarily depend on the currently
    /// loaded data, so the loaded metaversion isn't checked. (If it
    /// does depend on the loaded data, then the metaversion should
    /// have already been checked earlier, when reading the loaded
    /// data.)
    ///
    /// The persisted metaversion is incremented after writing data
    /// and then the loaded metaversion is set to the new persisted
    /// metaversion after reloading.
    pub fn write_from_context_datas(
        &mut self,
        column_writers: &[&ContextColumn],
        num_agents: usize,
    ) -> Result<()> {
        if column_writers.is_empty() {
            return Err(Error::from("Expected context datas to not be empty"));
        }

        let mut persisted = self.persisted_metaversion();

        let column_dynamic_meta_list = column_writers
            .iter()
            .map(|column_writer| column_writer.get_dynamic_metadata())
            .collect::<Result<Vec<_>>>()?;
        let dynamic =
            DynamicMeta::from_column_dynamic_meta_list(&column_dynamic_meta_list, num_agents);

        let current_data_size = self.segment.memory().get_data_buffer_len()?;
        if current_data_size < dynamic.data_length {
            let change = self
                .segment
                .memory_mut()
                .set_data_length(dynamic.data_length)?;
            persisted.increment_with(&change);
        } else if current_data_size > UPPER_BOUND_DATA_SIZE_MULTIPLIER * dynamic.data_length {
            let change = self
                .segment
                .memory_mut()
                .shrink_memory_with_data_length(dynamic.data_length)?;
            // TODO: Don't shrink all the way to `data_length`? (to lower risk of
            //       having to expand memory again soon afterwards)
            persisted.increment_with(&change);
        }

        debug_assert!(self.segment.memory().get_data_buffer_len()? >= dynamic.data_length);
        let data = self.segment.memory_mut().get_mut_data_buffer()?;

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

        let meta_buffer = get_dynamic_meta_flatbuffers(&dynamic)?;
        self.segment.memory_mut().set_metadata(&meta_buffer)?;

        persisted.increment_batch();
        self.segment.set_persisted_metaversion(persisted);

        // Reload batch
        let (_, _, meta_buffer, data_buffer) = self.segment.memory().get_batch_buffers()?;
        let rb_msg = &arrow_ipc::root_as_message(meta_buffer)?
            .header_as_record_batch()
            .ok_or(Error::InvalidRecordBatchIpcMessage)?;
        self.batch = read_record_batch(data_buffer, *rb_msg, self.batch.schema(), &[])?;
        self.loaded = persisted;

        Ok(())
    }
}
