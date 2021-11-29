#![allow(clippy::cast_possible_wrap)]

use rayon::iter::{
    IndexedParallelIterator, IntoParallelIterator, IntoParallelRefIterator, ParallelIterator,
};

use crate::datastore::prelude::*;
use crate::{
    datastore::arrow::{
        ipc::{read_record_batch, static_record_batch_to_bytes},
        meta_conversion::get_dynamic_meta_flatbuffers,
    },
    simulation::package::context::ContextColumn,
};

use super::Batch as BatchRepr;

use crate::proto::ExperimentID;
use std::sync::Arc;

// If required data size is 3 times less than current data size
// then shmem size will be readjusted
const UPPER_BOUND_DATA_SIZE_MULTIPLIER: usize = 3;

pub type AgentIndex = (u32, u32);
pub type MessageIndex = (u32, u32, u32);

pub struct Batch {
    pub(crate) memory: Memory,
    pub(crate) metaversion: Metaversion,
    pub(crate) batch: RecordBatch,
    pub(crate) group_start_indices: Vec<usize>,
}

impl BatchRepr for Batch {
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

impl Batch {
    pub fn from_record_batch(
        record_batch: &RecordBatch,
        schema: Option<&Arc<ArrowSchema>>,
        experiment_run_id: &Arc<ExperimentID>,
        group_start_indices: Vec<usize>,
    ) -> Result<Batch> {
        let (meta_buffer, data_buffer) = static_record_batch_to_bytes(record_batch);

        let memory = Memory::from_batch_buffers(
            experiment_run_id,
            &[],
            &[],
            meta_buffer.as_ref(),
            &data_buffer,
            false,
        )?;
        Self::from_memory(memory, schema, group_start_indices)
    }

    pub fn from_memory(
        memory: Memory,
        schema: Option<&Arc<ArrowSchema>>,
        group_start_indices: Vec<usize>,
    ) -> Result<Batch> {
        let (schema_buffer, _, meta_buffer, data_buffer) = memory.get_batch_buffers()?;
        let schema = if let Some(s) = schema {
            s.clone()
        } else {
            let message = arrow_ipc::get_root_as_message(schema_buffer);
            let ipc_schema = match message.header_as_schema() {
                Some(s) => s,
                None => return Err(Error::ArrowSchemaRead),
            };
            let schema = Arc::new(arrow_ipc::convert::fb_to_schema(ipc_schema));

            schema
        };
        let rb_msg = arrow_ipc::get_root_as_message(meta_buffer)
            .header_as_record_batch()
            .ok_or(Error::InvalidRecordBatchIPCMessage)?;
        let batch = match read_record_batch(data_buffer, &rb_msg, schema, &[]) {
            Ok(rb) => rb.unwrap(),
            Err(e) => return Err(Error::from(e)),
        };

        Ok(Batch {
            memory,
            metaversion: Metaversion::default(),
            batch,
            group_start_indices,
        })
    }

    pub fn write_from_context_datas(
        &mut self,
        datas: &[ContextColumn],
        num_elements: usize,
    ) -> Result<()> {
        if datas.is_empty() {
            return Err(Error::from("Expected context datas to not be empty"));
        }

        let column_dynamic_meta_list = datas
            .iter()
            .map(|data| data.get_dynamic_metadata())
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
                next_offset = old_offset + length; // TODO check this is correct
                unsafe { std::slice::from_raw_parts_mut(&mut data[old_offset] as *mut _, length) }
            })
            .collect::<Vec<_>>();

        datas
            .par_iter()
            .zip_eq(writable_datas.into_par_iter())
            .zip_eq(column_dynamic_meta_list.par_iter())
            .try_for_each(|((data, buffer), meta)| data.write(buffer, meta))?;

        let meta_buffer = get_dynamic_meta_flatbuffers(&dynamic)?;
        self.memory.set_metadata(&meta_buffer)?;

        // Reload batch
        let (_, _, meta_buffer, data_buffer) = self.memory.get_batch_buffers()?;
        let rb_msg = &arrow_ipc::get_root_as_message(meta_buffer)
            .header_as_record_batch()
            .ok_or(Error::InvalidRecordBatchIPCMessage)?;
        log::debug!("Reading record batch");
        self.batch = match read_record_batch(data_buffer, rb_msg, self.batch.schema(), &[]) {
            Ok(rb) => rb.unwrap(),
            Err(e) => return Err(Error::from(e)),
        };

        Ok(())
    }
}
