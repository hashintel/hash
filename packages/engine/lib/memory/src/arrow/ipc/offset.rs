//! This module contains code to calculate the offset and length of an Arrow buffer.

use arrow::{
    array::{
        Array, BinaryArray, BooleanArray, DictionaryArray, DictionaryKey, FixedSizeListArray,
        ListArray, MapArray, Offset, PrimitiveArray, StructArray, UnionArray, Utf8Array,
    },
    bitmap::Bitmap,
    buffer::Buffer,
    datatypes::{PhysicalType, PrimitiveType},
    types::{days_ms, months_days_ns, NativeType},
};

use crate::shared_memory::padding::pad_to_8;

/// Calculates the offset of this array, in bytes. It also adds the needed types for serialization
/// to `buffers` and `nodes`.
///
/// The offset is the number of bytes between the current array and the start of the file - i.e. if
/// you pass `offset=x` to this function, and the length of the array is `l`, then this function
/// will set `offset=x + l` before it returns.
// todo: find a better name for this function
pub(crate) fn calculate_array_offset(
    array: &dyn Array,
    buffers: &mut Vec<arrow_format::ipc::Buffer>,
    nodes: &mut Vec<arrow_format::ipc::FieldNode>,
    offset: &mut i64,
    len: usize,
    arrow_data_len: &mut usize,
) {
    // we add this information so that we then have access to it when we serialize the RecordBatch
    // header in `record_batch_msg_bytes`
    nodes.push(arrow_format::ipc::FieldNode {
        length: array.len() as i64,
        null_count: array.null_count() as i64,
    });

    match array.data_type().to_physical_type() {
        PhysicalType::Null => (),
        PhysicalType::Boolean => calculate_bool_array_offset(
            array.as_any().downcast_ref().unwrap(),
            buffers,
            offset,
            arrow_data_len,
        ),
        PhysicalType::Primitive(ty) => {
            // genererates code to match the given expression against a PrimitiveType, and if it
            // matches it then downcasts to the correct type and calculates the offset
            macro_rules! match_primitive_type {
                ($to_match_on:expr, $array:expr, $($predicate:path => $conclusion:ty ),*) => {
                    match $to_match_on {
                        $(
                            $predicate => {
                                calculate_primitive_array_offset::<$conclusion>(
                                    $array . as_any().downcast_ref::<PrimitiveArray<$conclusion>>().unwrap(),
                                    buffers,
                                    arrow_data_len,
                                    offset,
                                );
                            }
                        ),*
                    }
                };
            }

            match_primitive_type! {
                ty, array,
                PrimitiveType::Int8 => i8,
                PrimitiveType::Int16 => i16,
                PrimitiveType::Int32 => i32,
                PrimitiveType::Int64 => i64,
                PrimitiveType::Int128 => i128,
                PrimitiveType::UInt8 => u8,
                PrimitiveType::UInt16 => u16,
                PrimitiveType::UInt32 => u32,
                PrimitiveType::UInt64 => u64,
                PrimitiveType::Float32 => f32,
                PrimitiveType::Float64 => f64,
                PrimitiveType::DaysMs => days_ms,
                PrimitiveType::MonthDayNano => months_days_ns
            }
        }
        PhysicalType::Binary => calculate_binary_array_offset::<i32>(
            array.as_any().downcast_ref().unwrap(),
            buffers,
            arrow_data_len,
            offset,
        ),
        PhysicalType::FixedSizeBinary => calculate_binary_array_offset::<i32>(
            array.as_any().downcast_ref().unwrap(),
            buffers,
            arrow_data_len,
            offset,
        ),
        PhysicalType::LargeBinary => calculate_binary_array_offset::<i64>(
            array.as_any().downcast_ref().unwrap(),
            buffers,
            arrow_data_len,
            offset,
        ),
        PhysicalType::Utf8 => calculate_utf8_array_offset::<i32>(
            array.as_any().downcast_ref().unwrap(),
            len,
            buffers,
            arrow_data_len,
            offset,
        ),
        PhysicalType::LargeUtf8 => calculate_utf8_array_offset::<i64>(
            array.as_any().downcast_ref().unwrap(),
            len,
            buffers,
            arrow_data_len,
            offset,
        ),
        PhysicalType::List => calculate_list_array_offset::<i32>(
            array.as_any().downcast_ref().unwrap(),
            len,
            buffers,
            arrow_data_len,
            offset,
        ),
        PhysicalType::FixedSizeList => calculate_fixed_size_list_offset(
            array.as_any().downcast_ref().unwrap(),
            len,
            buffers,
            nodes,
            arrow_data_len,
            offset,
        ),
        PhysicalType::LargeList => calculate_list_array_offset::<i64>(
            array.as_any().downcast_ref().unwrap(),
            len,
            buffers,
            arrow_data_len,
            offset,
        ),
        PhysicalType::Struct => calculate_struct_offset(
            array.as_any().downcast_ref().unwrap(),
            buffers,
            nodes,
            arrow_data_len,
            offset,
        ),
        PhysicalType::Union => calculate_union_offset(
            array.as_any().downcast_ref().unwrap(),
            len,
            buffers,
            nodes,
            arrow_data_len,
            offset,
        ),
        PhysicalType::Map => calculate_map_offset(
            array.as_any().downcast_ref().unwrap(),
            len,
            buffers,
            nodes,
            arrow_data_len,
            offset,
        ),
        PhysicalType::Dictionary(val) => match val {
            arrow::datatypes::IntegerType::Int8 => calculate_dictionary_offset::<i8>(
                array.as_any().downcast_ref().unwrap(),
                buffers,
                arrow_data_len,
                offset,
            ),
            arrow::datatypes::IntegerType::Int16 => calculate_dictionary_offset::<i16>(
                array.as_any().downcast_ref().unwrap(),
                buffers,
                arrow_data_len,
                offset,
            ),
            arrow::datatypes::IntegerType::Int32 => calculate_dictionary_offset::<i32>(
                array.as_any().downcast_ref().unwrap(),
                buffers,
                arrow_data_len,
                offset,
            ),
            arrow::datatypes::IntegerType::Int64 => calculate_dictionary_offset::<i64>(
                array.as_any().downcast_ref().unwrap(),
                buffers,
                arrow_data_len,
                offset,
            ),
            arrow::datatypes::IntegerType::UInt8 => calculate_dictionary_offset::<u8>(
                array.as_any().downcast_ref().unwrap(),
                buffers,
                arrow_data_len,
                offset,
            ),
            arrow::datatypes::IntegerType::UInt16 => calculate_dictionary_offset::<u16>(
                array.as_any().downcast_ref().unwrap(),
                buffers,
                arrow_data_len,
                offset,
            ),
            arrow::datatypes::IntegerType::UInt32 => calculate_dictionary_offset::<u32>(
                array.as_any().downcast_ref().unwrap(),
                buffers,
                arrow_data_len,
                offset,
            ),
            arrow::datatypes::IntegerType::UInt64 => calculate_dictionary_offset::<u64>(
                array.as_any().downcast_ref().unwrap(),
                buffers,
                arrow_data_len,
                offset,
            ),
        },
    }
}

pub(crate) fn calculate_bool_array_offset(
    array: &BooleanArray,
    buffers: &mut Vec<arrow_format::ipc::Buffer>,
    offset: &mut i64,
    arrow_data_len: &mut usize,
) {
    calculate_bitmap_offset(
        array.validity(),
        array.len(),
        offset,
        arrow_data_len,
        buffers,
    );
    calculate_bitmap_offset(
        Some(array.values()),
        array.len(),
        offset,
        arrow_data_len,
        buffers,
    );
}

pub(crate) fn calculate_primitive_array_offset<T: NativeType>(
    array: &PrimitiveArray<T>,
    buffers: &mut Vec<arrow_format::ipc::Buffer>,
    arrow_data_len: &mut usize,
    offset: &mut i64,
) {
    calculate_bitmap_offset(
        array.validity(),
        array.len(),
        offset,
        arrow_data_len,
        buffers,
    );

    calculate_buffer_offset(array.values(), arrow_data_len, buffers, offset);
}

pub(crate) fn calculate_binary_array_offset<O: Offset>(
    array: &BinaryArray<O>,
    buffers: &mut Vec<arrow_format::ipc::Buffer>,
    arrow_data_len: &mut usize,
    offset: &mut i64,
) {
    calculate_bitmap_offset(
        array.validity(),
        array.len() - 1,
        offset,
        arrow_data_len,
        buffers,
    );

    let first = *array.offsets().first().unwrap();
    let last = *array.offsets().first().unwrap();

    if first == O::default() {
        calculate_buffer_offset(array.offsets(), arrow_data_len, buffers, offset)
    } else {
        if cfg!(target = "little_endian") {
            for item in array.offsets().iter().map(|x| *x - first) {
                *arrow_data_len += item.to_le_bytes().as_ref().len();
            }
        } else {
            for item in array.offsets().iter().map(|x| *x - first) {
                *arrow_data_len += item.to_be_bytes().as_ref().len();
            }
        }
    }

    calculate_bytes(
        &array.values()[first.to_usize()..last.to_usize()],
        buffers,
        arrow_data_len,
        offset,
    );
}

pub(crate) fn calculate_utf8_array_offset<O: Offset>(
    array: &Utf8Array<O>,
    len: usize,
    buffers: &mut Vec<arrow_format::ipc::Buffer>,
    arrow_data_len: &mut usize,
    offset: &mut i64,
) {
    calculate_bitmap_offset(array.validity(), len, offset, arrow_data_len, buffers);

    calculate_buffer_offset(array.values(), arrow_data_len, buffers, offset);
}

pub(crate) fn calculate_list_array_offset<O: Offset>(
    array: &ListArray<O>,
    len: usize,
    buffers: &mut Vec<arrow_format::ipc::Buffer>,
    arrow_data_len: &mut usize,
    offset: &mut i64,
) {
    calculate_bitmap_offset(array.validity(), len, offset, arrow_data_len, buffers);
    calculate_buffer_offset(array.offsets(), arrow_data_len, buffers, offset);
}

pub(crate) fn calculate_fixed_size_list_offset(
    array: &FixedSizeListArray,
    len: usize,
    buffers: &mut Vec<arrow_format::ipc::Buffer>,
    nodes: &mut Vec<arrow_format::ipc::FieldNode>,
    arrow_data_len: &mut usize,
    offset: &mut i64,
) {
    calculate_bitmap_offset(array.validity(), len, offset, arrow_data_len, buffers);
    calculate_array_offset(
        array.values().as_ref(),
        buffers,
        nodes,
        offset,
        len,
        arrow_data_len,
    );
}

pub(crate) fn calculate_struct_offset(
    array: &StructArray,
    buffers: &mut Vec<arrow_format::ipc::Buffer>,
    nodes: &mut Vec<arrow_format::ipc::FieldNode>,
    arrow_data_len: &mut usize,
    offset: &mut i64,
) {
    calculate_bitmap_offset(
        array.validity(),
        array.len(),
        offset,
        arrow_data_len,
        buffers,
    );
    for col in array.values() {
        calculate_array_offset(
            col.as_ref(),
            buffers,
            nodes,
            offset,
            col.len(),
            arrow_data_len,
        )
    }
}

pub(crate) fn calculate_union_offset(
    array: &UnionArray,
    len: usize,
    buffers: &mut Vec<arrow_format::ipc::Buffer>,
    nodes: &mut Vec<arrow_format::ipc::FieldNode>,
    arrow_data_len: &mut usize,
    offset: &mut i64,
) {
    calculate_buffer_offset(array.types(), arrow_data_len, buffers, offset);
    if let Some(offsets) = array.offsets() {
        calculate_buffer_offset(offsets, arrow_data_len, buffers, offset);
    }
    for field in array.fields() {
        calculate_array_offset(field.as_ref(), buffers, nodes, offset, len, arrow_data_len)
    }
}

fn calculate_map_offset(
    array: &MapArray,
    len: usize,
    buffers: &mut Vec<arrow_format::ipc::Buffer>,
    nodes: &mut Vec<arrow_format::ipc::FieldNode>,
    arrow_data_len: &mut usize,
    offset: &mut i64,
) {
    calculate_bitmap_offset(
        array.validity(),
        array.len() - 1,
        offset,
        arrow_data_len,
        buffers,
    );

    let first = *array.offsets().first().unwrap();
    let last = *array.offsets().last().unwrap();

    if first == 0 {
        calculate_buffer_offset(array.offsets(), arrow_data_len, buffers, offset);
    } else {
        // todo: do we build for any targets which are not little endian (maybe ARM, some of the
        // time)
        if cfg!(target = "little_endian") {
            for item in array.offsets().iter().map(|x| *x - first) {
                *arrow_data_len += item.to_le_bytes().as_ref().len();
            }
        } else {
            for item in array.offsets().iter().map(|x| *x - first) {
                *arrow_data_len += item.to_be_bytes().as_ref().len();
            }
        }
    }

    calculate_array_offset(
        array
            .field()
            .slice(first as usize, last as usize - first as usize)
            .as_ref(),
        buffers,
        nodes,
        offset,
        len,
        arrow_data_len,
    )
}

pub(crate) fn calculate_dictionary_offset<K: DictionaryKey>(
    dictionary: &DictionaryArray<K>,
    buffers: &mut Vec<arrow_format::ipc::Buffer>,
    arrow_data_len: &mut usize,
    offset: &mut i64,
) {
    calculate_primitive_array_offset(dictionary.keys(), buffers, arrow_data_len, offset)
}

/// Calculates the length of a [`arrow::bitmap::Bitmap`], in bytes.
///
/// `len` refers here to the number of items in the array
pub(crate) fn calculate_bitmap_offset(
    bitmap: Option<&Bitmap>,
    len: usize,
    offset: &mut i64,
    arrow_data_len: &mut usize,
    buffers: &mut Vec<arrow_format::ipc::Buffer>,
) {
    if let Some(bitmap) = bitmap {
        debug_assert_eq!(len, bitmap.len());
        let start = *arrow_data_len;
        let (slice, offset_inside_slice, _) = bitmap.as_slice();
        if offset_inside_slice == 0 {
            *arrow_data_len += slice.len();
        } else {
            let iter = Bitmap::from_trusted_len_iter(bitmap.iter());
            let slice = iter.as_slice();
            *arrow_data_len += slice.0.len();
        }
        buffers.push(calculate_buffer_fb(arrow_data_len, start, offset))
    } else {
        buffers.push(arrow_format::ipc::Buffer {
            offset: *offset,
            length: 0,
        })
    }
}

/// Calculates the length of a given [`arrow::buffer::Buffer`].
fn calculate_buffer_offset<T: NativeType>(
    buffer: &Buffer<T>,
    arrow_data_len: &mut usize,
    buffers: &mut Vec<arrow_format::ipc::Buffer>,
    offset: &mut i64,
) {
    let start = *arrow_data_len;
    if cfg!(target_endian = "little") {
        let cast = bytemuck::cast_slice::<T, u8>(buffer.as_slice());
        *arrow_data_len += cast.len();
    } else {
        for item in buffer.as_slice() {
            *arrow_data_len += item.to_le_bytes().as_ref().len();
        }
    }

    buffers.push(calculate_buffer_fb(arrow_data_len, start, offset))
}

/// Calculates the [`arrow_format::ipc::Buffer`] needed. This function also increments
/// `arrow_data_len` and `offset` as necessary.
fn calculate_buffer_fb(
    arrow_data_len: &mut usize,
    start: usize,
    offset: &mut i64,
) -> arrow_format::ipc::Buffer {
    let buffer_length = (*arrow_data_len - start) as i64;

    let pad_len = pad_to_8(buffer_length as usize);
    let total_len = (*arrow_data_len + pad_len - start) as i64;

    let buffer = arrow_format::ipc::Buffer {
        offset: *offset,
        length: buffer_length,
    };

    *offset += total_len;

    buffer
}

/// Adds the needed buffer for the given number of bytes to `buffers`. This method also increments
/// `offset` and `arrow_data_len` as needed.
fn calculate_bytes(
    bytes: &[u8],
    buffers: &mut Vec<arrow_format::ipc::Buffer>,
    arrow_data_len: &mut usize,
    offset: &mut i64,
) {
    let start = *arrow_data_len;
    *arrow_data_len += bytes.len();
    buffers.push(calculate_buffer_fb(arrow_data_len, start, offset));
}
