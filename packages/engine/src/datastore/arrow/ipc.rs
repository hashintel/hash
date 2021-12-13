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
        ArrayData, ArrayDataRef, ArrayRef, BinaryArray, BooleanArray, Date32Array, Date64Array,
        DictionaryArray, DurationMicrosecondArray, DurationMillisecondArray,
        DurationNanosecondArray, DurationSecondArray, FixedSizeBinaryArray, FixedSizeListArray,
        Float32Array, Float64Array, Int16Array, Int32Array, Int64Array, Int8Array,
        IntervalDayTimeArray, IntervalYearMonthArray, ListArray, NullArray, StringArray,
        StructArray, Time32MillisecondArray, Time32SecondArray, Time64MicrosecondArray,
        Time64NanosecondArray, TimestampMicrosecondArray, TimestampMillisecondArray,
        TimestampNanosecondArray, TimestampSecondArray, UInt16Array, UInt32Array, UInt64Array,
        UInt8Array, UnionArray,
    },
    buffer::{Buffer, MutableBuffer},
    compute::cast,
    datatypes::{
        DataType,
        DataType::{
            Binary, Boolean, Date32, Date64, Duration, FixedSizeBinary, Float32, Float64, Int16,
            Int32, Int64, Int8, Interval, Time32, Time64, Timestamp, UInt16, UInt32, UInt64, UInt8,
            Utf8,
        },
        DateUnit, Int16Type, Int32Type, Int64Type, Int8Type, IntervalUnit, Schema, TimeUnit,
        UInt16Type, UInt32Type, UInt64Type, UInt8Type,
    },
    error::{ArrowError, Result},
    ipc,
    record_batch::RecordBatch,
    util::bit_util,
};
use flatbuffers_arrow::FlatBufferBuilder;

use super::{padding, util::FlatBufferWrapper};

// MOD: Changed to zero-copy Buffer, i.e. Buffer::from -> Buffer::from_unowned
//      debug_assert
// COPY: ::ipc::reader.rs
/// Read a buffer based on offset and length
fn read_buffer(buf: &ipc::Buffer, a_data: &[u8]) -> Buffer {
    let start_offset = buf.offset() as usize;
    debug_assert_eq!(padding::get_static_buffer_pad(start_offset), 0);
    let end_offset = start_offset + buf.length() as usize;
    let buf_data = &a_data[start_offset..end_offset];
    let len = end_offset - start_offset;
    unsafe { Buffer::from_unowned(buf_data.as_ptr(), len, len) }
}

// COPY: ::ipc::reader.rs
/// Coordinates reading arrays based on data types.
///
/// Notes:
/// * In the IPC format, null buffers are always set, but may be empty. We discard them if an array
///   has 0 nulls
/// * Numeric values inside list arrays are often stored as 64-bit values regardless of their data
///   type size. We thus:
///     - check if the bit width of non-64-bit numbers is 64, and
///     - read the buffer as 64-bit (signed integer or float), and
///     - cast the 64-bit array to the appropriate data type
fn create_array(
    nodes: &[ipc::FieldNode],
    data_type: &DataType,
    data: &[u8],
    buffers: &[ipc::Buffer],
    dictionaries: &[Option<ArrayRef>],
    mut node_index: usize,
    mut buffer_index: usize,
) -> (ArrayRef, usize, usize) {
    use DataType::{Dictionary, FixedSizeList, List, Null, Struct};
    let array = match data_type {
        Utf8 | Binary => {
            let array = create_primitive_array(
                &nodes[node_index],
                data_type,
                buffers[buffer_index..buffer_index + 3]
                    .iter()
                    .map(|buf| read_buffer(buf, data))
                    .collect(),
            );
            node_index += 1;
            buffer_index += 3;
            array
        }
        FixedSizeBinary(_) => {
            let array = create_primitive_array(
                &nodes[node_index],
                data_type,
                buffers[buffer_index..buffer_index + 2]
                    .iter()
                    .map(|buf| read_buffer(buf, data))
                    .collect(),
            );
            node_index += 1;
            buffer_index += 2;
            array
        }
        List(ref list_data_type) => {
            let list_node = &nodes[node_index];
            let list_buffers: Vec<Buffer> = buffers[buffer_index..buffer_index + 2]
                .iter()
                .map(|buf| read_buffer(buf, data))
                .collect();
            node_index += 1;
            buffer_index += 2;
            let triple = create_array(
                nodes,
                list_data_type,
                data,
                buffers,
                dictionaries,
                node_index,
                buffer_index,
            );
            node_index = triple.1;
            buffer_index = triple.2;

            create_list_array(list_node, data_type, &list_buffers[..], triple.0)
        }
        FixedSizeList(ref list_data_type, _) => {
            let list_node = &nodes[node_index];
            let list_buffers: Vec<Buffer> = buffers[buffer_index..=buffer_index]
                .iter()
                .map(|buf| read_buffer(buf, data))
                .collect();
            node_index += 1;
            buffer_index += 1;
            let triple = create_array(
                nodes,
                list_data_type,
                data,
                buffers,
                dictionaries,
                node_index,
                buffer_index,
            );
            node_index = triple.1;
            buffer_index = triple.2;

            create_list_array(list_node, data_type, &list_buffers[..], triple.0)
        }
        Struct(struct_fields) => {
            let struct_node = &nodes[node_index];
            let null_buffer: Buffer = read_buffer(&buffers[buffer_index], data);
            node_index += 1;
            buffer_index += 1;

            // read the arrays for each field
            let mut struct_arrays = vec![];
            // TODO: investigate whether just knowing the number of buffers could still work
            for struct_field in struct_fields {
                let triple = create_array(
                    nodes,
                    struct_field.data_type(),
                    data,
                    buffers,
                    dictionaries,
                    node_index,
                    buffer_index,
                );
                node_index = triple.1;
                buffer_index = triple.2;
                struct_arrays.push((struct_field.clone(), triple.0));
            }
            let null_count = struct_node.null_count() as usize;
            let struct_array = if null_count > 0 {
                // create struct array from fields, arrays and null data
                StructArray::from((
                    struct_arrays,
                    null_buffer,
                    struct_node.null_count() as usize,
                ))
            } else {
                StructArray::from(struct_arrays)
            };
            Arc::new(struct_array)
        }
        // Create dictionary array from RecordBatch
        Dictionary(..) => {
            let index_node = &nodes[node_index];
            let index_buffers: Vec<Buffer> = buffers[buffer_index..buffer_index + 2]
                .iter()
                .map(|buf| read_buffer(buf, data))
                .collect();
            let value_array = dictionaries[node_index].clone().unwrap();
            node_index += 1;
            buffer_index += 2;

            create_dictionary_array(index_node, data_type, &index_buffers[..], value_array)
        }
        Null => {
            let length = nodes[node_index].length() as usize;
            let data = ArrayData::builder(data_type.clone())
                .len(length)
                .null_count(length)
                .null_bit_buffer({
                    // create a buffer and fill it with invalid bits
                    let num_bytes = bit_util::ceil(length, 8);
                    let buffer = MutableBuffer::new(num_bytes);
                    let buffer = buffer.with_bitset(num_bytes, false);
                    buffer.freeze()
                })
                .offset(0)
                .build();
            node_index += 1;
            // no buffer increases
            make_array(data)
        }
        _ => {
            let array = create_primitive_array(
                &nodes[node_index],
                data_type,
                buffers[buffer_index..buffer_index + 2]
                    .iter()
                    .map(|buf| read_buffer(buf, data))
                    .collect(),
            );
            node_index += 1;
            buffer_index += 2;
            array
        }
    };
    (array, node_index, buffer_index)
}

// COPY: ::ipc::reader.rs
/// Reads the correct number of buffers based on data type and null_count, and creates a
/// primitive array ref
fn create_primitive_array(
    field_node: &ipc::FieldNode,
    data_type: &DataType,
    buffers: Vec<Buffer>,
) -> ArrayRef {
    let length = field_node.length() as usize;
    let null_count = field_node.null_count() as usize;
    let array_data = match data_type {
        Utf8 | Binary => {
            // read 3 buffers
            let mut builder = ArrayData::builder(data_type.clone())
                .len(length)
                .buffers(buffers[1..3].to_vec())
                .offset(0);
            if null_count > 0 {
                builder = builder
                    .null_count(null_count)
                    .null_bit_buffer(buffers[0].clone())
            }
            builder.build()
        }
        FixedSizeBinary(_) => {
            // read 3 buffers
            let mut builder = ArrayData::builder(data_type.clone())
                .len(length)
                .buffers(buffers[1..2].to_vec())
                .offset(0);
            if null_count > 0 {
                builder = builder
                    .null_count(null_count)
                    .null_bit_buffer(buffers[0].clone())
            }
            builder.build()
        }
        Int8
        | Int16
        | Int32
        | UInt8
        | UInt16
        | UInt32
        | Time32(_)
        | Date32(_)
        | Interval(IntervalUnit::YearMonth) => {
            if buffers[1].len() / 8 == length {
                // interpret as a signed i64, and cast appropriately
                let mut builder = ArrayData::builder(DataType::Int64)
                    .len(length)
                    .buffers(buffers[1..].to_vec())
                    .offset(0);
                if null_count > 0 {
                    builder = builder
                        .null_count(null_count)
                        .null_bit_buffer(buffers[0].clone())
                }
                let values = Arc::new(Int64Array::from(builder.build())) as ArrayRef;
                // this cast is infallible, the unwrap is safe
                let casted = cast(&values, data_type).unwrap();
                casted.data()
            } else {
                let mut builder = ArrayData::builder(data_type.clone())
                    .len(length)
                    .buffers(buffers[1..].to_vec())
                    .offset(0);
                if null_count > 0 {
                    builder = builder
                        .null_count(null_count)
                        .null_bit_buffer(buffers[0].clone())
                }
                builder.build()
            }
        }
        Float32 => {
            if buffers[1].len() / 8 == length {
                // interpret as a f64, and cast appropriately
                let mut builder = ArrayData::builder(DataType::Float64)
                    .len(length)
                    .buffers(buffers[1..].to_vec())
                    .offset(0);
                if null_count > 0 {
                    builder = builder
                        .null_count(null_count)
                        .null_bit_buffer(buffers[0].clone())
                }
                let values = Arc::new(Float64Array::from(builder.build())) as ArrayRef;
                // this cast is infallible, the unwrap is safe
                let casted = cast(&values, data_type).unwrap();
                casted.data()
            } else {
                let mut builder = ArrayData::builder(data_type.clone())
                    .len(length)
                    .buffers(buffers[1..].to_vec())
                    .offset(0);
                if null_count > 0 {
                    builder = builder
                        .null_count(null_count)
                        .null_bit_buffer(buffers[0].clone())
                }
                builder.build()
            }
        }
        Boolean
        | Int64
        | UInt64
        | Float64
        | Time64(_)
        | Timestamp(..)
        | Date64(_)
        | Duration(_)
        | Interval(IntervalUnit::DayTime) => {
            let mut builder = ArrayData::builder(data_type.clone())
                .len(length)
                .buffers(buffers[1..].to_vec())
                .offset(0);
            if null_count > 0 {
                builder = builder
                    .null_count(null_count)
                    .null_bit_buffer(buffers[0].clone())
            }
            builder.build()
        }
        t => panic!("Data type {:?} either unsupported or not primitive", t),
    };

    make_array(array_data)
}

// COPY: ::ipc::reader.rs
/// Reads the correct number of buffers based on list type and null_count, and creates a
/// list array ref
fn create_list_array(
    field_node: &ipc::FieldNode,
    data_type: &DataType,
    buffers: &[Buffer],
    child_array: ArrayRef,
) -> ArrayRef {
    if let DataType::List(_) = *data_type {
        let null_count = field_node.null_count() as usize;
        let mut builder = ArrayData::builder(data_type.clone())
            .len(field_node.length() as usize)
            .buffers(buffers[1..2].to_vec())
            .offset(0)
            .child_data(vec![child_array.data()]);
        if null_count > 0 {
            builder = builder
                .null_count(null_count)
                .null_bit_buffer(buffers[0].clone())
        }
        make_array(builder.build())
    } else if let DataType::FixedSizeList(..) = *data_type {
        let null_count = field_node.null_count() as usize;
        let mut builder = ArrayData::builder(data_type.clone())
            .len(field_node.length() as usize)
            .buffers(buffers[1..1].to_vec())
            .offset(0)
            .child_data(vec![child_array.data()]);
        if null_count > 0 {
            builder = builder
                .null_count(null_count)
                .null_bit_buffer(buffers[0].clone())
        }
        make_array(builder.build())
    } else {
        panic!("Cannot create list array from {:?}", data_type)
    }
}

// COPY: ::ipc::reader.rs
/// Reads the correct number of buffers based on list type and null_count, and creates a
/// list array ref
fn create_dictionary_array(
    field_node: &ipc::FieldNode,
    data_type: &DataType,
    buffers: &[Buffer],
    value_array: ArrayRef,
) -> ArrayRef {
    if let DataType::Dictionary(..) = *data_type {
        let null_count = field_node.null_count() as usize;
        let mut builder = ArrayData::builder(data_type.clone())
            .len(field_node.length() as usize)
            .buffers(buffers[1..2].to_vec())
            .offset(0)
            .child_data(vec![value_array.data()]);
        if null_count > 0 {
            builder = builder
                .null_count(null_count)
                .null_bit_buffer(buffers[0].clone())
        }
        make_array(builder.build())
    } else {
        unreachable!("Cannot create dictionary array from {:?}", data_type)
    }
}

// COPY: ::ipc::reader.rs
// MOD: take `batch` as reference
/// Creates a record batch from binary data using the `ipc::RecordBatch` indexes and the `Schema`
pub(crate) fn read_record_batch(
    buf: &[u8],
    batch: &ipc::RecordBatch<'_>,
    schema: Arc<Schema>,
    dictionaries: &[Option<ArrayRef>],
) -> Result<Option<RecordBatch>> {
    let buffers = batch.buffers().ok_or_else(|| {
        ArrowError::IoError("Unable to get buffers from IPC RecordBatch".to_string())
    })?;
    let field_nodes = batch.nodes().ok_or_else(|| {
        ArrowError::IoError("Unable to get field nodes from IPC RecordBatch".to_string())
    })?;
    // keep track of buffer and node index, the functions that create arrays mutate these
    let mut buffer_index = 0;
    let mut node_index = 0;
    let mut arrays = vec![];

    // keep track of index as lists require more than one node
    for field in schema.fields() {
        let triple = create_array(
            field_nodes,
            field.data_type(),
            &buf,
            buffers,
            dictionaries,
            node_index,
            buffer_index,
        );
        node_index = triple.1;
        buffer_index = triple.2;
        arrays.push(triple.0);
    }

    RecordBatch::try_new(schema, arrays).map(Some)
}

// COPY: ::array::array.rs
/// Constructs an array using the input `data`.
/// Returns a reference-counted `Array` instance.
#[must_use]
pub fn make_array(data: ArrayDataRef) -> ArrayRef {
    match data.data_type() {
        DataType::Boolean => Arc::new(BooleanArray::from(data)) as ArrayRef,
        DataType::Int8 => Arc::new(Int8Array::from(data)) as ArrayRef,
        DataType::Int16 => Arc::new(Int16Array::from(data)) as ArrayRef,
        DataType::Int32 => Arc::new(Int32Array::from(data)) as ArrayRef,
        DataType::Int64 => Arc::new(Int64Array::from(data)) as ArrayRef,
        DataType::UInt8 => Arc::new(UInt8Array::from(data)) as ArrayRef,
        DataType::UInt16 => Arc::new(UInt16Array::from(data)) as ArrayRef,
        DataType::UInt32 => Arc::new(UInt32Array::from(data)) as ArrayRef,
        DataType::UInt64 => Arc::new(UInt64Array::from(data)) as ArrayRef,
        DataType::Float16 => panic!("Float16 datatype not supported"),
        DataType::Float32 => Arc::new(Float32Array::from(data)) as ArrayRef,
        DataType::Float64 => Arc::new(Float64Array::from(data)) as ArrayRef,
        DataType::Date32(DateUnit::Day) => Arc::new(Date32Array::from(data)) as ArrayRef,
        DataType::Date64(DateUnit::Millisecond) => Arc::new(Date64Array::from(data)) as ArrayRef,
        DataType::Time32(TimeUnit::Second) => Arc::new(Time32SecondArray::from(data)) as ArrayRef,
        DataType::Time32(TimeUnit::Millisecond) => {
            Arc::new(Time32MillisecondArray::from(data)) as ArrayRef
        }
        DataType::Time64(TimeUnit::Microsecond) => {
            Arc::new(Time64MicrosecondArray::from(data)) as ArrayRef
        }
        DataType::Time64(TimeUnit::Nanosecond) => {
            Arc::new(Time64NanosecondArray::from(data)) as ArrayRef
        }
        DataType::Timestamp(TimeUnit::Second, _) => {
            Arc::new(TimestampSecondArray::from(data)) as ArrayRef
        }
        DataType::Timestamp(TimeUnit::Millisecond, _) => {
            Arc::new(TimestampMillisecondArray::from(data)) as ArrayRef
        }
        DataType::Timestamp(TimeUnit::Microsecond, _) => {
            Arc::new(TimestampMicrosecondArray::from(data)) as ArrayRef
        }
        DataType::Timestamp(TimeUnit::Nanosecond, _) => {
            Arc::new(TimestampNanosecondArray::from(data)) as ArrayRef
        }
        DataType::Interval(IntervalUnit::YearMonth) => {
            Arc::new(IntervalYearMonthArray::from(data)) as ArrayRef
        }
        DataType::Interval(IntervalUnit::DayTime) => {
            Arc::new(IntervalDayTimeArray::from(data)) as ArrayRef
        }
        DataType::Duration(TimeUnit::Second) => {
            Arc::new(DurationSecondArray::from(data)) as ArrayRef
        }
        DataType::Duration(TimeUnit::Millisecond) => {
            Arc::new(DurationMillisecondArray::from(data)) as ArrayRef
        }
        DataType::Duration(TimeUnit::Microsecond) => {
            Arc::new(DurationMicrosecondArray::from(data)) as ArrayRef
        }
        DataType::Duration(TimeUnit::Nanosecond) => {
            Arc::new(DurationNanosecondArray::from(data)) as ArrayRef
        }
        DataType::Binary => Arc::new(BinaryArray::from(data)) as ArrayRef,
        DataType::FixedSizeBinary(_) => Arc::new(FixedSizeBinaryArray::from(data)) as ArrayRef,
        DataType::Utf8 => Arc::new(StringArray::from(data)) as ArrayRef,
        DataType::List(_) => Arc::new(ListArray::from(data)) as ArrayRef,
        DataType::Struct(_) => Arc::new(StructArray::from(data)) as ArrayRef,
        DataType::Union(_) => Arc::new(UnionArray::from(data)) as ArrayRef,
        DataType::FixedSizeList(..) => Arc::new(FixedSizeListArray::from(data)) as ArrayRef,
        DataType::Dictionary(ref key_type, _) => match key_type.as_ref() {
            DataType::Int8 => Arc::new(DictionaryArray::<Int8Type>::from(data)) as ArrayRef,
            DataType::Int16 => Arc::new(DictionaryArray::<Int16Type>::from(data)) as ArrayRef,
            DataType::Int32 => Arc::new(DictionaryArray::<Int32Type>::from(data)) as ArrayRef,
            DataType::Int64 => Arc::new(DictionaryArray::<Int64Type>::from(data)) as ArrayRef,
            DataType::UInt8 => Arc::new(DictionaryArray::<UInt8Type>::from(data)) as ArrayRef,
            DataType::UInt16 => Arc::new(DictionaryArray::<UInt16Type>::from(data)) as ArrayRef,
            DataType::UInt32 => Arc::new(DictionaryArray::<UInt32Type>::from(data)) as ArrayRef,
            DataType::UInt64 => Arc::new(DictionaryArray::<UInt64Type>::from(data)) as ArrayRef,
            dt => panic!("Unexpected dictionary key type {:?}", dt),
        },
        DataType::Null => Arc::new(NullArray::from(data)) as ArrayRef,
        dt => panic!("Unexpected data type {:?}", dt),
    }
}

// COPY: ::ipc::writer.rs
// MOD: added continuation bytes for Python read
//      FlatBufferWrapper
pub(crate) fn schema_to_bytes<'fbb>(schema: &Schema) -> FlatBufferWrapper<'fbb> {
    let mut fbb = FlatBufferBuilder::new();
    let schema = {
        let fb = ipc::convert::schema_to_fb_offset(&mut fbb, schema);
        fb.as_union_value()
    };

    let mut message = ipc::MessageBuilder::new(&mut fbb);
    message.add_version(ipc::MetadataVersion::V4);
    message.add_header_type(ipc::MessageHeader::Schema);
    message.add_bodyLength(0);
    message.add_header(schema);
    // TODO: custom metadata
    let data = message.finish();
    fbb.finish(data, None);

    fbb.into()
}

// MOD:`record_batch_to_bytes` -> `static_record_batch_to_bytes`
//      FlatBufferWrapper
// COPY: ::ipc::writer.rs
/// Write a `RecordBatch` into a tuple of bytes, one for the header (ipc::Message) and the other for
/// the batch's data
pub(crate) fn static_record_batch_to_bytes<'fbb>(
    batch: &RecordBatch,
) -> (FlatBufferWrapper<'fbb>, Vec<u8>) {
    let mut fbb = FlatBufferBuilder::new();

    let mut nodes: Vec<ipc::FieldNode> = vec![];
    let mut buffers: Vec<ipc::Buffer> = vec![];
    let mut arrow_data: Vec<u8> = vec![];
    let mut offset = 0;
    for array in batch.columns() {
        let array_data = array.data();
        offset = write_static_array_data(
            &array_data,
            &mut buffers,
            &mut arrow_data,
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
    message.add_bodyLength(arrow_data.len() as i64);
    message.add_header(root);
    let root = message.finish();
    fbb.finish(root, None);

    (fbb.into(), arrow_data)
}

// MOD: Added padding_meta
//      FlatBufferWrapper
// COPY: ::ipc::writer.rs
/// Write a `RecordBatch` into a tuple of bytes, one for the header (ipc::Message) and the other for
/// the batch's data
pub(crate) fn record_batch_to_bytes<'fbb>(
    batch: &RecordBatch,
) -> (FlatBufferWrapper<'fbb>, Vec<u8>) {
    let mut fbb = FlatBufferBuilder::new();

    let mut nodes: Vec<ipc::FieldNode> = vec![];
    let mut buffers: Vec<ipc::Buffer> = vec![];
    let mut arrow_data: Vec<u8> = vec![];
    let mut offset = 0;
    for array in batch.columns() {
        let array_data = array.data();
        offset = write_array_data(
            &array_data,
            &mut buffers,
            &mut arrow_data,
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
    message.add_bodyLength(arrow_data.len() as i64);
    message.add_header(root);
    let root = message.finish();
    fbb.finish(root, None);

    (fbb.into(), arrow_data)
}

// ADD
#[must_use]
pub fn simulate_record_batch_to_bytes<'fbb>(
    batch: &RecordBatch,
) -> (FlatBufferWrapper<'fbb>, usize) {
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

    (fbb.into(), offset as usize)
}

// ADD
fn simulate_write_array_data(
    array_data: &ArrayDataRef,
    mut buffers: &mut Vec<ipc::Buffer>,
    mut nodes: &mut Vec<ipc::FieldNode>,
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

    offset = simulate_write_buffer(null_buffer_len, &mut buffers, offset);

    array_data.buffers().iter().for_each(|buffer| {
        offset = simulate_write_buffer(buffer.len(), &mut buffers, offset);
    });

    // recursively write out nested structures
    // COM: Unless the parent array_data is part of a `StructArray`,
    //      then array_data.child_data() contains either nothing or
    //      a single child array
    array_data.child_data().iter().for_each(|data_ref| {
        // write the nested data (e.g list data)
        offset = simulate_write_array_data(
            data_ref,
            &mut buffers,
            &mut nodes,
            offset,
            data_ref.len(),
            data_ref.null_count(),
        );
    });
    offset
}

// ADD
// Assumes buffer is at least the right length
pub fn record_batch_data_to_bytes_owned_unchecked(batch: &RecordBatch, buffer: &mut [u8]) {
    let mut offset = 0;
    for array in batch.columns() {
        let array_data = array.data();
        offset = write_array_data_owned(&array_data, buffer, offset, 0, array.len());
    }
}

// ADD
fn write_array_data_owned(
    array_data: &ArrayDataRef,
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
            buffer.freeze()
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

// MOD: add `padding_meta`
// COPY: ::ipc::writer.rs
/// Write array data to a vector of bytes
fn write_array_data(
    array_data: &ArrayDataRef,
    mut buffers: &mut Vec<ipc::Buffer>,
    mut arrow_data: &mut Vec<u8>,
    mut nodes: &mut Vec<ipc::FieldNode>,
    offset: i64,
    num_rows: usize,
    null_count: usize,
) -> i64 {
    let mut offset = offset;
    nodes.push(ipc::FieldNode::new(num_rows as i64, null_count as i64));
    // write null buffer if exists
    let null_buffer = match array_data.null_buffer() {
        // COM: Even if field is not nullable, a null_buffer is
        //      always written
        None => {
            // create a buffer and fill it with valid bits
            let num_bytes = bit_util::ceil(num_rows, 8);
            let buffer = MutableBuffer::new(num_bytes);
            let buffer = buffer.with_bitset(num_bytes, true);
            buffer.freeze()
        }
        Some(buffer) => buffer.clone(),
    };
    offset = write_buffer(&null_buffer, &mut buffers, &mut arrow_data, offset);

    array_data.buffers().iter().for_each(|buffer| {
        offset = write_buffer(buffer, &mut buffers, &mut arrow_data, offset);
    });

    // recursively write out nested structures
    // COM: Unless the parent array_data is part of a `StructArray`,
    //      then array_data.child_data() contains either nothing or
    //      a single child array
    array_data.child_data().iter().for_each(|data_ref| {
        // write the nested data (e.g list data)
        offset = write_array_data(
            data_ref,
            &mut buffers,
            &mut arrow_data,
            &mut nodes,
            offset,
            data_ref.len(),
            data_ref.null_count(),
        );
    });
    offset
}

// MOD: `write_array_data` -> `write_static_array_data`
// COPY: ::ipc::writer.rs
/// Write array data to a vector of bytes
fn write_static_array_data(
    array_data: &ArrayDataRef,
    mut buffers: &mut Vec<ipc::Buffer>,
    mut arrow_data: &mut Vec<u8>,
    mut nodes: &mut Vec<ipc::FieldNode>,
    offset: i64,
    num_rows: usize,
    null_count: usize,
) -> i64 {
    let mut offset = offset;
    nodes.push(ipc::FieldNode::new(num_rows as i64, null_count as i64));
    // write null buffer if exists
    let null_buffer = match array_data.null_buffer() {
        // COM: Even if field is not nullable, a null_buffer is
        //      always written
        None => {
            // create a buffer and fill it with valid bits
            let num_bytes = bit_util::ceil(num_rows, 8);
            let buffer = MutableBuffer::new(num_bytes);
            let buffer = buffer.with_bitset(num_bytes, true);
            buffer.freeze()
        }
        Some(buffer) => buffer.clone(),
    };
    offset = write_static_buffer(&null_buffer, &mut buffers, &mut arrow_data, offset);

    array_data.buffers().iter().for_each(|buffer| {
        offset = write_static_buffer(buffer, &mut buffers, &mut arrow_data, offset);
    });

    // recursively write out nested structures
    // COM: Unless the parent array_data is part of a `StructArray`,
    //      then array_data.child_data() contains either nothing or
    //      a single child array
    array_data.child_data().iter().for_each(|data_ref| {
        // write the nested data (e.g list data)
        offset = write_static_array_data(
            data_ref,
            &mut buffers,
            &mut arrow_data,
            &mut nodes,
            offset,
            data_ref.len(),
            data_ref.null_count(),
        );
    });
    offset
}

// MOD: `write_buffer` -> `write_static_buffer`
//      total_len -> len for buffer length
// COPY: ::ipc::writer.rs
/// Write a buffer to a vector of bytes, and add its ipc Buffer to a vector
fn write_static_buffer(
    buffer: &Buffer,
    buffers: &mut Vec<ipc::Buffer>,
    arrow_data: &mut Vec<u8>,
    offset: i64,
) -> i64 {
    let len = buffer.len();
    let total_len = padding::get_static_buffer_length(len);

    // assert_eq!(len % 8, 0, "Buffer width not a multiple of 8 bytes");
    buffers.push(ipc::Buffer::new(offset, len as i64));
    arrow_data.extend_from_slice(buffer.data());
    arrow_data.extend_from_slice(&vec![0_u8; total_len - len][..]);
    offset + total_len as i64
}

// MOD: pad_to_8 -> pad_to_sys_align (required so in-memory RecordBatch can be loaded)
//      total_len -> len for buffer length
//      extra padding for growable buffers
// COPY: ::ipc::writer.rs
/// Write a buffer to a vector of bytes, and add its ipc Buffer to a vector
fn write_buffer(
    buffer: &Buffer,
    buffers: &mut Vec<ipc::Buffer>,
    arrow_data: &mut Vec<u8>,
    offset: i64,
) -> i64 {
    let len = buffer.len();
    let total_len = padding::get_dynamic_buffer_length(len);

    // assert_eq!(len % 8, 0, "Buffer width not a multiple of 8 bytes");
    buffers.push(ipc::Buffer::new(offset, len as i64));
    arrow_data.extend_from_slice(buffer.data());
    arrow_data.extend_from_slice(&vec![0_u8; total_len - len][..]);
    offset + total_len as i64
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
    arrow_data[offset_usize..offset_usize + len].copy_from_slice(buffer.data());
    offset + total_len
}
