#![allow(
    clippy::cast_sign_loss,
    clippy::too_many_lines,
    clippy::doc_markdown,
    clippy::needless_pass_by_value,
    clippy::extra_unused_lifetimes,
    clippy::too_many_arguments
)]
// uncomment this beast when you feel ready to apache devs whos boss

// This file contains copied code from the Arrow implementation in Rust
//
// Multiple functions in this file have been modified to support in-place
// modifications. For example, getting an Arrow RecordBatch from a SharedBatch
// needs to contain refrences to SharedBatch segments. Currently the Arrow
// implementation does not support this, it actually copies data from IPC files.
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
    array::ArrayData,
    buffer::{Buffer, MutableBuffer},
    ipc,
    record_batch::RecordBatch,
    util::bit_util,
};
use flatbuffers::FlatBufferBuilder;

use super::padding;

// ADD
/// Walks through the process of serializing the record batch to bytes in the arrow format to
/// calculate the necessary size.
#[must_use]
pub fn simulate_record_batch_to_bytes(batch: &RecordBatch) -> (Vec<u8>, usize) {
    let mut fbb = FlatBufferBuilder::new();

    let mut nodes: Vec<ipc::FieldNode> = vec![];
    let mut buffers: Vec<ipc::Buffer> = vec![];

    let mut offset = 0;
    for array in batch.columns() {
        let array_data = array.data();
        offset = simulate_write_array_data(
            array_data,
            &mut buffers,
            &mut nodes,
            offset,
            array.len(),
            array.null_count(),
        );
    }

    // write data
    let buffers = fbb.create_vector(&buffers);
    let nodes = fbb.create_vector(&nodes);

    let root = {
        let mut batch_builder = ipc::RecordBatchBuilder::new(&mut fbb);
        batch_builder.add_length(batch.num_rows() as i64);
        batch_builder.add_nodes(nodes);
        batch_builder.add_buffers(buffers);
        let b = batch_builder.finish();
        b.as_union_value()
    };
    // create an ipc::Message
    let mut message = ipc::MessageBuilder::new(&mut fbb);
    message.add_version(ipc::MetadataVersion::V4);
    message.add_header_type(ipc::MessageHeader::RecordBatch);
    message.add_bodyLength(offset);
    message.add_header(root);
    let root = message.finish();
    fbb.finish(root, None);
    let finished_data = fbb.finished_data();

    (finished_data.to_vec(), offset as usize)
}

// ADD
fn simulate_write_array_data(
    array_data: &ArrayData,
    buffers: &mut Vec<ipc::Buffer>,
    nodes: &mut Vec<ipc::FieldNode>,
    offset: i64,
    num_rows: usize,
    null_count: usize,
) -> i64 {
    let mut offset = offset;
    nodes.push(ipc::FieldNode::new(num_rows as i64, null_count as i64));

    let null_buffer_len = match array_data.null_buffer() {
        None => bit_util::ceil(num_rows, 8),
        Some(buffer) => buffer.len(),
    };

    offset = simulate_write_buffer(null_buffer_len, buffers, offset);

    array_data.buffers().iter().for_each(|buffer| {
        offset = simulate_write_buffer(buffer.len(), buffers, offset);
    });

    // recursively write out nested structures
    // COM: Unless the parent array_data is part of a `StructArray`,
    //      then array_data.child_data() contains either nothing or
    //      a single child array
    array_data.child_data().iter().for_each(|data_ref| {
        // write the nested data (e.g list data)
        offset = simulate_write_array_data(
            data_ref,
            buffers,
            nodes,
            offset,
            data_ref.len(),
            data_ref.null_count(),
        );
    });
    offset
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
    array_data: &ArrayData,
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
            let num_bytes = bit_util::ceil(num_rows, 8);
            let buffer = MutableBuffer::new(num_bytes);
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
fn simulate_write_buffer(buffer_size: usize, buffers: &mut Vec<ipc::Buffer>, offset: i64) -> i64 {
    let total_len = padding::get_dynamic_buffer_length(buffer_size) as i64;
    buffers.push(ipc::Buffer::new(offset, buffer_size as i64));
    offset + total_len
}

// ADD
fn write_buffer_owned(buffer: &Buffer, arrow_data: &mut [u8], offset: i64) -> i64 {
    let len = buffer.len();
    let total_len = padding::get_dynamic_buffer_length(len) as i64;
    let offset_usize = offset as usize;
    arrow_data[offset_usize..offset_usize + len].copy_from_slice(buffer.as_slice());
    offset + total_len
}
