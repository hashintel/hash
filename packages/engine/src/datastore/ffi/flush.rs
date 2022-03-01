#![allow(
    clippy::module_name_repetitions,
    clippy::cast_sign_loss,
    clippy::cast_ptr_alignment,
    clippy::missing_safety_doc
)]

use super::{memory::CMemory, ArrowArray};
use crate::datastore::{
    batch::flush::{GrowableArrayData, GrowableBatch, GrowableColumn},
    prelude::*,
};

type Flag = usize;

const MEMORY_SIZE_UNCHANGED: usize = 0;
const MEMORY_WAS_RESIZED: usize = 1;
const ERROR_FLAG: usize = 2;
const OUT_OF_MEMORY: usize = 3;

#[repr(C)]
pub struct Changes {
    len: usize,
    indices: *const usize,
    columns: *const *const ArrowArray,
}

#[no_mangle]
unsafe extern "C" fn flush_changes(
    c_memory: *mut CMemory,
    dynamic_meta: *mut DynamicMeta,
    static_meta: *const StaticMeta,
    changes: *const Changes,
) -> Flag {
    let changes = &*changes;
    // Use this base lifetime for everything
    let static_meta_ref = &*static_meta;
    let num_changes = (*changes).len;
    let indices = std::slice::from_raw_parts(changes.indices, num_changes);
    let arrays = std::slice::from_raw_parts(changes.columns, num_changes);
    let prepared_columns: Vec<PreparedColumn<'_>> = match (0..num_changes)
        .map(|i| {
            let column_index = indices[i];
            let arrow_array = arrays[i];
            let node_index = static_meta_ref.get_column_meta()[column_index].node_start;
            let (prepared_array_data, _) =
                node_into_prepared_array_data(arrow_array, static_meta_ref, node_index)?;
            Ok(PreparedColumn {
                index: column_index,
                data: prepared_array_data,
            })
        })
        .collect::<Result<_>>()
    {
        Ok(v) => v,
        Err(why) => {
            println!("Error in `flush_changes`: {:?}", &why);
            return ERROR_FLAG;
        }
    };

    let memory = &mut *((*c_memory).memory as *mut _);

    let mut prepared = PreparedBatch {
        changes: prepared_columns,
        static_meta,
        dynamic_meta: &mut *dynamic_meta,
        memory,
    };

    let resized = match prepared.flush_changes() {
        Ok(resized) => resized,
        Err(Error::SharedMemory(shared_memory::ShmemError::DevShmOutOfMemory)) => {
            tracing::error!("Out of memory in `flush_changes`");
            return OUT_OF_MEMORY;
        }
        Err(err) => {
            tracing::error!("Error in `flush_changes`: {err}");
            return ERROR_FLAG;
        }
    };

    if resized {
        let ptr = memory.data.as_ptr();
        let len = memory.size as i64;
        let mut_c_memory = &mut *c_memory;
        mut_c_memory.ptr = ptr;
        mut_c_memory.len = len;
        MEMORY_WAS_RESIZED
    } else {
        MEMORY_SIZE_UNCHANGED
    }
}

// Assumes all buffers are properly aligned
unsafe fn node_into_prepared_array_data(
    arrow_array: *const ArrowArray,
    static_meta: &StaticMeta,
    node_index: usize,
) -> Result<(PreparedArrayData<'_>, usize)> {
    let arrow_array_ref = &*arrow_array;

    let meta = &static_meta.get_node_meta()[node_index];
    let num_elem = arrow_array_ref.length as usize;
    // Go over children
    let mut next_node_index = node_index + 1;
    let child_count = arrow_array_ref.n_children as usize;
    let mut child_data = Vec::with_capacity(child_count);
    (0..child_count).try_for_each::<_, Result<()>>(|i| {
        let child = *arrow_array_ref.children.add(i);
        let (prepared_child, next) =
            node_into_prepared_array_data(child, static_meta, next_node_index)?;
        next_node_index = next;
        child_data.push(prepared_child);
        Ok(())
    })?;
    // Simple debug check that we're dealing with an expected type
    let buffer_count = arrow_array_ref.n_buffers as usize;
    debug_assert_eq!(meta.get_data_types().len(), buffer_count);

    // Null buffer
    // Similar to `ImportNullBitmap` in the Arrow repo: cpp/src/arrow/c/bridge.cc
    // `buffers[0]` can equal the null pointer
    // If the null count is 0. But the number of buffers in a node is
    // always fixed (even if the null bitmap is null)
    let null_buffer = if buffer_count > 0
        && match &meta.get_data_types()[0] {
            crate::datastore::meta::BufferType::BitMap { is_null_bitmap } => *is_null_bitmap,
            _ => false,
        } {
        let null_buffer_is_null = (arrow_array_ref.buffers).is_null();
        let null_count = arrow_array_ref.null_count as usize;
        if null_count > 0 && null_buffer_is_null {
            return Err(Error::from(
                "The null buffer is null but the null count is non-zero",
            ));
        }

        if null_buffer_is_null {
            None
        } else {
            let ptr = (*arrow_array_ref.buffers) as *const u8;
            let byte_length = arrow_bit_util::ceil(num_elem, 8);
            let slice = std::slice::from_raw_parts(ptr, byte_length);
            Some(slice)
        }
    } else {
        None
    };

    let buffer_slice =
        std::slice::from_raw_parts(arrow_array_ref.buffers as *mut *const u8, buffer_count);
    // Other buffers (if exist)
    let buffers = if buffer_count > 1 {
        let mut buffers = Vec::with_capacity(buffer_count - 1);
        let mut data_size = num_elem;
        (1..buffer_count).try_for_each(|index| {
            let data_type = &meta.get_data_types()[index];
            let ptr = buffer_slice[index];
            let slice = match data_type {
                crate::datastore::meta::BufferType::BitMap { is_null_bitmap } => {
                    if *is_null_bitmap {
                        // The null bitmap should already be accounted for
                        return Err(Error::from(
                            "The null buffer is null but the null count is non-zero",
                        ));
                    }
                    let byte_length = arrow_bit_util::ceil(num_elem, 8);
                    std::slice::from_raw_parts(ptr, byte_length)
                }
                crate::datastore::meta::BufferType::Offset => {
                    let byte_length = (num_elem + 1) * std::mem::size_of::<i32>();
                    let slice = std::slice::from_raw_parts(ptr, byte_length);
                    let last_offset_byte_index = byte_length - std::mem::size_of::<i32>();
                    let last_offset =
                        *(slice.as_ptr().add(last_offset_byte_index) as *const u32) as usize;
                    data_size = last_offset;
                    slice
                }
                crate::datastore::meta::BufferType::Data { unit_byte_size } => {
                    let byte_length = data_size * unit_byte_size;
                    std::slice::from_raw_parts(ptr, byte_length)
                }
                _ => unimplemented!(),
            };

            buffers.push(slice);
            Ok(())
        })?;
        buffers
    } else {
        Vec::with_capacity(0)
    };
    let prepared = PreparedArrayData {
        inner: arrow_array,
        child_data,
        null_buffer,
        buffers,
    };

    Ok((prepared, next_node_index))
}

#[derive(Debug)]
pub struct PreparedArrayData<'a> {
    inner: *const ArrowArray,
    child_data: Vec<PreparedArrayData<'a>>,
    null_buffer: Option<&'a [u8]>,
    buffers: Vec<&'a [u8]>,
}

impl GrowableArrayData for PreparedArrayData<'_> {
    fn _len(&self) -> usize {
        unsafe { (*self.inner).length as usize }
    }

    fn _null_count(&self) -> usize {
        unsafe { (*self.inner).null_count as usize }
    }

    fn _null_buffer(&self) -> Option<&[u8]> {
        self.null_buffer
    }

    fn _get_buffer(&self, index: usize) -> &[u8] {
        self.buffers[index]
    }

    fn _get_non_null_buffer_count(&self) -> usize {
        self.buffers.len()
    }

    fn _child_data(&self) -> &[Self] {
        &self.child_data
    }
}

pub struct PreparedColumn<'a> {
    index: usize,
    data: PreparedArrayData<'a>,
}

impl<'a> GrowableColumn<PreparedArrayData<'a>> for PreparedColumn<'a> {
    fn get_column_index(&self) -> usize {
        self.index
    }

    fn get_data(&self) -> &PreparedArrayData<'a> {
        &self.data
    }
}

pub struct PreparedBatch<'a> {
    changes: Vec<PreparedColumn<'a>>,
    static_meta: *const StaticMeta,
    dynamic_meta: &'a mut DynamicMeta,
    memory: &'a mut Memory,
}

impl<'a> GrowableBatch<PreparedColumn<'a>, PreparedArrayData<'a>> for PreparedBatch<'a> {
    fn take_changes(&mut self) -> Vec<PreparedColumn<'a>> {
        std::mem::take(&mut self.changes)
    }

    fn static_meta(&self) -> &StaticMeta {
        unsafe { &*self.static_meta }
    }

    fn dynamic_meta(&self) -> &DynamicMeta {
        self.dynamic_meta
    }

    fn mut_dynamic_meta(&mut self) -> &mut DynamicMeta {
        self.dynamic_meta
    }

    fn memory(&self) -> &Memory {
        self.memory
    }

    fn mut_memory(&mut self) -> &mut Memory {
        self.memory
    }
}
