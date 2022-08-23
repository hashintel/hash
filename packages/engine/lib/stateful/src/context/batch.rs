#![allow(clippy::cast_possible_wrap)]

use std::sync::Arc;

use arrow2::datatypes::Schema;
use memory::{
    arrow::{
        ipc::{
            self, calculate_ipc_header_data, write_record_batch_body,
            write_record_batch_message_header,
        },
        meta,
        record_batch::RecordBatch,
    },
    shared_memory::{MemoryId, Metaversion, Segment},
};
use rayon::iter::{
    IndexedParallelIterator, IntoParallelIterator, IntoParallelRefIterator, ParallelIterator,
};
use tracing::trace;

use crate::{context::ContextColumn, Error, Result};

// If required data size is 3 times less than current data size then shmem size will be readjusted.
const UPPER_BOUND_DATA_SIZE_MULTIPLIER: usize = 3;

/// Contains the information required to build the context, which is accessible in the language
/// runners.
///
/// Data within the `ContextBatch` can rely on the contents of the [`AgentBatchPool`] and
/// [`MessageBatchPool`] within the [`Context`] object. For example, the list of neighbors in the
/// [`ContextBatch`] is a collection of indices pointing to different agents within the
/// [`AgentBatchPool`].
///
/// [`AgentBatchPool`]: crate::agent::AgentBatchPool
/// [`MessageBatchPool`]: crate::message::MessageBatchPool
/// [`Context`]: crate::context::Context
pub struct ContextBatch {
    segment: Segment,
    batch: RecordBatch,
    loaded: Metaversion,
}

impl ContextBatch {
    pub fn segment(&self) -> &Segment {
        &self.segment
    }

    pub(in crate::context) fn from_record_batch(
        record_batch: &RecordBatch,
        schema: Arc<Schema>,
        memory_id: MemoryId,
    ) -> Result<Self> {
        trace!(
            "writing record batch with schema {:?} to shared memory segment {}",
            schema,
            memory_id
        );

        debug_assert_eq!(record_batch.schema(), schema);

        let header = Metaversion::default().to_le_bytes();

        let header_data = calculate_ipc_header_data(record_batch);

        let mut metadata = vec![];
        write_record_batch_message_header(&mut metadata, &header_data)?;

        let mut body_data = vec![0; header_data.body_len];

        write_record_batch_body(record_batch, &mut body_data, &header_data)?;

        let segment =
            Segment::from_batch_buffers(memory_id, &[], &header, &metadata, &body_data, false)?;

        Self::from_segment(segment, schema)
    }

    fn from_segment(segment: Segment, schema: Arc<Schema>) -> Result<Self> {
        let persisted = segment.try_read_persisted_metaversion()?;
        let batch = ipc::read_record_batch(&segment, schema)?;

        Ok(Self {
            segment,
            loaded: persisted,
            batch,
        })
    }

    /// Overwrite context batch with given columns.
    ///
    /// The underlying shared memory is resized if either the new data is bigger than the existing
    /// capacity, or the new data is much smaller than the existing capacity, so we can make the
    /// capacity smaller.
    ///
    /// The written data doesn't necessarily depend on the currently loaded data, so the loaded
    /// metaversion isn't checked. (If it does depend on the loaded data, then the metaversion
    /// should have already been checked earlier, when reading the loaded data.)
    ///
    /// The persisted metaversion is incremented after writing data and then the loaded metaversion
    /// is set to the new persisted metaversion after reloading.
    pub(in crate::context) fn write_from_context_datas(
        &mut self,
        column_writers: &[&ContextColumn],
        num_agents: usize,
    ) -> Result<()> {
        if column_writers.is_empty() {
            return Err(Error::from("Expected context datas to not be empty"));
        }

        let mut persisted = self.segment.read_persisted_metaversion();

        let column_dynamic_meta_list = column_writers
            .iter()
            .map(|column_writer| column_writer.dynamic_metadata())
            .collect::<Result<Vec<_>>>()?;
        let dynamic = meta::DynamicMetadata::from_column_dynamic_meta_list(
            &column_dynamic_meta_list,
            num_agents,
        );

        let current_data_size = self.segment.get_data_buffer_len()?;
        if current_data_size < dynamic.data_length {
            let change = self.segment.set_data_length(dynamic.data_length)?;
            persisted.increment_with(&change);
        } else if current_data_size > UPPER_BOUND_DATA_SIZE_MULTIPLIER * dynamic.data_length {
            // Shrink memory if it's getting to big
            let change = self
                .segment
                .shrink_memory_with_data_length(dynamic.data_length)?;
            // TODO: Don't shrink all the way to `data_length`? (to lower risk of
            //       having to expand memory again soon afterwards)
            persisted.increment_with(&change);
        }

        debug_assert!(
            self.segment.get_data_buffer_len()? >= dynamic.data_length,
            "Data buffer can't be smaller than new data, because we just checked its size"
        );
        let data = self.segment.get_mut_data_buffer()?;

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

        let meta_buffer = dynamic.get_flatbuffers()?;
        let change = self.segment.set_metadata(&meta_buffer)?;
        persisted.increment_with(&change);

        persisted.increment_batch();
        self.segment.persist_metaversion(persisted);

        // Reload batch
        self.batch = ipc::read_record_batch(&self.segment, self.batch.schema())?;
        self.loaded = persisted;

        Ok(())
    }
}
