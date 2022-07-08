// This file contains code copied from the Arrow implementation in Rust
//
// Multiple functions in this file have been modified to support in-place
// modifications. For example, getting an Arrow RecordBatch from a SharedBatch
// needs to contain refrences to SharedBatch segments. Currently the Arrow
// implementation does not support this as it copies data from IPC files.
//
// All modifications of functions have been marked by "MOD" and include a brief
// description of what changes were made.
//
// Every function that has been copied is marked by "COPY" and includes the source
// file.
//
// Every function that has been added for extra functionality is marked by "ADD".
//
// Every additional comment is marked by "COM"

// ADD: use central source of information
use arrow::{
    array::{Array, ArrayRef},
    buffer::Buffer,
    io::ipc::write::{StreamWriter, WriteOptions},
};
use flatbuffers::FlatBufferBuilder;

use super::RecordBatch;
use crate::shared_memory::padding;

// ADD
/// Walks through the process of serializing the record batch to bytes in the arrow format to
/// calculate the necessary size.
#[must_use]
pub fn simulate_record_batch_to_bytes(batch: &RecordBatch) -> (Vec<u8>, usize) {
    let mut buf = &mut vec![];

    let writer = StreamWriter::new(&mut buf, WriteOptions { compression: None });

    writer
        .start(batch.schema, None)
        .expect("writing to a vec should be infallible");

    for batch in batch.batches() {
        writer
            .write(batch, None)
            .expect("writing to a vec should be infallible");
    }

    writer
        .finish()
        .expect("writing to a vec should be infallible");

    // todo: offset
    (buf, 0)
}

// ADD
// Assumes buffer is at least the right length
/// This should be safe because the assumption is that the [`simulate_record_batch_to_bytes`]
/// method was called to create the correct buffer length.
pub fn record_batch_data_to_bytes_owned_unchecked(batch: &RecordBatch, buffer: &mut [u8]) {
    let mut offset = 0;
    for array in batch.columns() {
        let array_data = array.data();
        offset = write_array_data_owned(array_data, buffer, offset, 0, array.len());
    }
}

// ADD
fn write_array_data_owned(
    array_data: &ArrayRef,
    arrow_data: &mut [u8],
    mut offset: i64,
    mut buffer_count: usize,
    num_rows: usize,
) -> i64 {
    // write null buffer if exists
    let null_buffer = match array_data.null_buffer() {
        // COM: Even if field is not nullable, a null_buffer is
        //      always written
        None => {
            // create a buffer and fill it with valid bits
            let num_bytes = num_rows.div_ceil(8);
            let buffer = Vec::with_capacity(num_bytes);
            let buffer = buffer.with_bitset(num_bytes, true);
            buffer.into()
        }
        Some(buffer) => buffer.clone(),
    };
    offset = write_buffer_owned(&null_buffer, arrow_data, offset);
    buffer_count += 1;

    array_data.buffers().iter().for_each(|buffer| {
        offset = write_buffer_owned(buffer, arrow_data, offset);
        buffer_count += 1;
    });

    // recursively write out nested structures
    // COM: Unless the parent array_data is part of a `StructArray`,
    //      then array_data.child_data() contains either nothing or
    //      a single child array
    array_data.child_data().iter().for_each(|data_ref| {
        // write the nested data (e.g list data)
        offset = write_array_data_owned(data_ref, arrow_data, offset, buffer_count, data_ref.len());
    });
    offset
}

// ADD
fn simulate_write_buffer(
    buffer_size: usize,
    buffers: &mut Vec<arrow_format::ipc::Buffer>,
    offset: i64,
) -> i64 {
    let total_len = padding::get_dynamic_buffer_length(buffer_size) as i64;
    buffers.push(arrow_format::ipc::Buffer::new {
        offset,
        buffer_size: buffer_size as i64,
    });
    offset + total_len
}

// ADD
fn write_buffer_owned(buffer: &Buffer<u8>, arrow_data: &mut [u8], offset: i64) -> i64 {
    let len = buffer.len();
    let total_len = padding::get_dynamic_buffer_length(len) as i64;
    let offset_usize = offset as usize;
    arrow_data[offset_usize..offset_usize + len].copy_from_slice(buffer.as_slice());
    offset + total_len
}
