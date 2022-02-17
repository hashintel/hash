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
use std::sync::Arc;

use arrow::{
    array::{
        ArrayData, ArrayRef, BinaryArray, BooleanArray, Date32Array, Date64Array, DictionaryArray,
        DurationMicrosecondArray, DurationMillisecondArray, DurationNanosecondArray,
        DurationSecondArray, FixedSizeBinaryArray, FixedSizeListArray, Float32Array, Float64Array,
        Int16Array, Int32Array, Int64Array, Int8Array, IntervalDayTimeArray,
        IntervalYearMonthArray, ListArray, NullArray, StringArray, StructArray,
        Time32MillisecondArray, Time32SecondArray, Time64MicrosecondArray, Time64NanosecondArray,
        TimestampMicrosecondArray, TimestampMillisecondArray, TimestampNanosecondArray,
        TimestampSecondArray, UInt16Array, UInt32Array, UInt64Array, UInt8Array, UnionArray,
    },
    buffer::{Buffer, MutableBuffer},
    datatypes::{
        DataType, Int16Type, Int32Type, Int64Type, Int8Type, IntervalUnit, TimeUnit, UInt16Type,
        UInt32Type, UInt64Type, UInt8Type,
    },
    ipc,
    record_batch::RecordBatch,
    util::bit_util,
};
use flatbuffers_arrow::FlatBufferBuilder;

use super::padding;

// COPY: ::array::array.rs
/// Constructs an array using the input `data`.
/// Returns a reference-counted `Array` instance.
#[must_use]
pub fn make_array(data: ArrayData) -> ArrayRef {
    match data.data_type() {
        DataType::Boolean => Arc::new(BooleanArray::from(data)),
        DataType::Int8 => Arc::new(Int8Array::from(data)),
        DataType::Int16 => Arc::new(Int16Array::from(data)),
        DataType::Int32 => Arc::new(Int32Array::from(data)),
        DataType::Int64 => Arc::new(Int64Array::from(data)),
        DataType::UInt8 => Arc::new(UInt8Array::from(data)),
        DataType::UInt16 => Arc::new(UInt16Array::from(data)),
        DataType::UInt32 => Arc::new(UInt32Array::from(data)),
        DataType::UInt64 => Arc::new(UInt64Array::from(data)),
        DataType::Float16 => panic!("Float16 datatype not supported"),
        DataType::Float32 => Arc::new(Float32Array::from(data)),
        DataType::Float64 => Arc::new(Float64Array::from(data)),
        DataType::Date32 => Arc::new(Date32Array::from(data)),
        DataType::Date64 => Arc::new(Date64Array::from(data)),
        DataType::Time32(TimeUnit::Second) => Arc::new(Time32SecondArray::from(data)),
        DataType::Time32(TimeUnit::Millisecond) => Arc::new(Time32MillisecondArray::from(data)),
        DataType::Time64(TimeUnit::Microsecond) => Arc::new(Time64MicrosecondArray::from(data)),
        DataType::Time64(TimeUnit::Nanosecond) => Arc::new(Time64NanosecondArray::from(data)),
        DataType::Timestamp(TimeUnit::Second, _) => Arc::new(TimestampSecondArray::from(data)),
        DataType::Timestamp(TimeUnit::Millisecond, _) => {
            Arc::new(TimestampMillisecondArray::from(data))
        }
        DataType::Timestamp(TimeUnit::Microsecond, _) => {
            Arc::new(TimestampMicrosecondArray::from(data))
        }
        DataType::Timestamp(TimeUnit::Nanosecond, _) => {
            Arc::new(TimestampNanosecondArray::from(data))
        }
        DataType::Interval(IntervalUnit::YearMonth) => Arc::new(IntervalYearMonthArray::from(data)),
        DataType::Interval(IntervalUnit::DayTime) => Arc::new(IntervalDayTimeArray::from(data)),
        DataType::Duration(TimeUnit::Second) => Arc::new(DurationSecondArray::from(data)),
        DataType::Duration(TimeUnit::Millisecond) => Arc::new(DurationMillisecondArray::from(data)),
        DataType::Duration(TimeUnit::Microsecond) => Arc::new(DurationMicrosecondArray::from(data)),
        DataType::Duration(TimeUnit::Nanosecond) => Arc::new(DurationNanosecondArray::from(data)),
        DataType::Binary => Arc::new(BinaryArray::from(data)),
        DataType::FixedSizeBinary(_) => Arc::new(FixedSizeBinaryArray::from(data)),
        DataType::Utf8 => Arc::new(StringArray::from(data)),
        DataType::List(_) => Arc::new(ListArray::from(data)),
        DataType::Struct(_) => Arc::new(StructArray::from(data)),
        DataType::Union(_) => Arc::new(UnionArray::from(data)),
        DataType::FixedSizeList(..) => Arc::new(FixedSizeListArray::from(data)),
        DataType::Dictionary(ref key_type, _) => match key_type.as_ref() {
            DataType::Int8 => Arc::new(DictionaryArray::<Int8Type>::from(data)),
            DataType::Int16 => Arc::new(DictionaryArray::<Int16Type>::from(data)),
            DataType::Int32 => Arc::new(DictionaryArray::<Int32Type>::from(data)),
            DataType::Int64 => Arc::new(DictionaryArray::<Int64Type>::from(data)),
            DataType::UInt8 => Arc::new(DictionaryArray::<UInt8Type>::from(data)),
            DataType::UInt16 => Arc::new(DictionaryArray::<UInt16Type>::from(data)),
            DataType::UInt32 => Arc::new(DictionaryArray::<UInt32Type>::from(data)),
            DataType::UInt64 => Arc::new(DictionaryArray::<UInt64Type>::from(data)),
            dt => panic!("Unexpected dictionary key type {:?}", dt),
        },
        DataType::Null => Arc::new(NullArray::from(data)),
        dt => panic!("Unexpected data type {:?}", dt),
    }
}

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
            &array_data,
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
        offset = write_array_data_owned(&array_data, buffer, offset, 0, array.len());
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
