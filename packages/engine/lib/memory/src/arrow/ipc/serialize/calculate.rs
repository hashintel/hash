//! This code has been copied from the arrow2 repository, and modified.
//!
//! This module has been modified to take arrow arrays, and compute the number of bytes they will
//! occupy in memory. This is necessary, because we need to allocate the sizes of shared-memory
//! segments up-front, so that we can then write the Arrow data (from
//! [`crate::arrow::record_batch::RecordBatch`]es) into the shared-memory data segment without
//! having to allocate and copy the entire data (this cost is likely to be prohibitive for larger
//! simulations, and thus the additional code complexity is worth it).

#![allow(clippy::ptr_arg)] // false positive in clippy, see https://github.com/rust-lang/rust-clippy/issues/8463
use arrow2::{
    array::*, bitmap::Bitmap, datatypes::PhysicalType, trusted_len::TrustedLen, types::NativeType,
};
use arrow_format::ipc;

use crate::{arrow::ipc::serialize::assert_buffer_monotonicity, shared_memory::padding::pad_to_8};

/// This function has been modified to never write any data, and instead only compute the data
/// necessary to write the IPC header message (i.e. body length in bytes, buffers and nodes).
fn write_primitive<T: NativeType>(
    array: &PrimitiveArray<T>,
    buffers: &mut Vec<ipc::Buffer>,
    arrow_data_len: &mut usize,
    offset: &mut i64,
    is_little_endian: bool,
) {
    write_bitmap(
        array.validity(),
        array.len(),
        buffers,
        arrow_data_len,
        offset,
    );

    write_buffer(
        array.values(),
        buffers,
        arrow_data_len,
        offset,
        is_little_endian,
    )
}

/// This function has been modified to never write any data, and instead only compute the data
/// necessary to write the IPC header message (i.e. body length in bytes, buffers and nodes).
fn write_boolean(
    array: &BooleanArray,
    buffers: &mut Vec<ipc::Buffer>,
    arrow_data_len: &mut usize,
    offset: &mut i64,
    _: bool,
) {
    write_bitmap(
        array.validity(),
        array.len(),
        buffers,
        arrow_data_len,
        offset,
    );
    write_bitmap(
        Some(&array.values().clone()),
        array.len(),
        buffers,
        arrow_data_len,
        offset,
    );
}

#[allow(clippy::too_many_arguments)]
/// This function has been modified to never write any data, and instead only compute the data
/// necessary to write the IPC header message (i.e. body length in bytes, buffers and nodes).
fn write_generic_binary<O: Offset>(
    validity: Option<&Bitmap>,
    offsets: &[O],
    values: &[u8],
    buffers: &mut Vec<ipc::Buffer>,
    arrow_data_len: &mut usize,
    offset: &mut i64,
    is_little_endian: bool,
) {
    write_bitmap(validity, offsets.len() - 1, buffers, arrow_data_len, offset);

    let first = *offsets.first().unwrap();
    let last = *offsets.last().unwrap();
    if first == O::default() {
        write_buffer(offsets, buffers, arrow_data_len, offset, is_little_endian);
    } else {
        write_buffer_from_iter(
            offsets.iter().map(|x| *x - first),
            buffers,
            arrow_data_len,
            offset,
            is_little_endian,
        );
    }

    write_bytes(
        &values[first.to_usize()..last.to_usize()],
        buffers,
        arrow_data_len,
        offset,
    );
}

/// This function has been modified to never write any data, and instead only compute the data
/// necessary to write the IPC header message (i.e. body length in bytes, buffers and nodes).
fn write_binary<O: Offset>(
    array: &BinaryArray<O>,
    buffers: &mut Vec<ipc::Buffer>,
    arrow_data_len: &mut usize,
    offset: &mut i64,
    is_little_endian: bool,
) {
    write_generic_binary(
        array.validity(),
        array.offsets(),
        array.values(),
        buffers,
        arrow_data_len,
        offset,
        is_little_endian,
    );
}

/// This function has been modified to never write any data, and instead only compute the data
/// necessary to write the IPC header message (i.e. body length in bytes, buffers and nodes).
fn write_utf8<O: Offset>(
    array: &Utf8Array<O>,
    buffers: &mut Vec<ipc::Buffer>,
    arrow_data_len: &mut usize,
    offset: &mut i64,
    is_little_endian: bool,
) {
    write_generic_binary(
        array.validity(),
        array.offsets(),
        array.values(),
        buffers,
        arrow_data_len,
        offset,
        is_little_endian,
    );
}

/// This function has been modified to never write any data, and instead only compute the data
/// necessary to write the IPC header message (i.e. body length in bytes, buffers and nodes).
fn write_fixed_size_binary(
    array: &FixedSizeBinaryArray,
    buffers: &mut Vec<ipc::Buffer>,
    arrow_data_len: &mut usize,
    offset: &mut i64,
    _is_little_endian: bool,
) {
    write_bitmap(
        array.validity(),
        array.len(),
        buffers,
        arrow_data_len,
        offset,
    );
    let start = *arrow_data_len;
    write_bytes(array.values(), buffers, arrow_data_len, offset);
    debug_assert!(*arrow_data_len > start);
}

/// This function has been modified to never write any data, and instead only compute the data
/// necessary to write the IPC header message (i.e. body length in bytes, buffers and nodes).
fn write_list<O: Offset>(
    array: &ListArray<O>,
    buffers: &mut Vec<ipc::Buffer>,
    arrow_data_len: &mut usize,
    nodes: &mut Vec<ipc::FieldNode>,
    offset: &mut i64,
    is_little_endian: bool,
) {
    let offsets = array.offsets();
    let validity = array.validity();

    write_bitmap(validity, offsets.len() - 1, buffers, arrow_data_len, offset);

    let first = *offsets.first().unwrap();
    let last = *offsets.last().unwrap();
    if first == O::default() {
        write_buffer(offsets, buffers, arrow_data_len, offset, is_little_endian);
    } else {
        write_buffer_from_iter(
            offsets.iter().map(|x| *x - first),
            buffers,
            arrow_data_len,
            offset,
            is_little_endian,
        );
    }

    write(
        array
            .values()
            .slice(first.to_usize(), last.to_usize() - first.to_usize())
            .as_ref(),
        buffers,
        arrow_data_len,
        nodes,
        offset,
        is_little_endian,
    );
}

/// This function has been modified to never write any data, and instead only compute the data
/// necessary to write the IPC header message (i.e. body length in bytes, buffers and nodes).
pub fn write_struct(
    array: &StructArray,
    buffers: &mut Vec<ipc::Buffer>,
    arrow_data_len: &mut usize,
    nodes: &mut Vec<ipc::FieldNode>,
    offset: &mut i64,
    is_little_endian: bool,
) {
    write_bitmap(
        array.validity(),
        array.len(),
        buffers,
        arrow_data_len,
        offset,
    );
    array.values().iter().for_each(|array| {
        write(
            array.as_ref(),
            buffers,
            arrow_data_len,
            nodes,
            offset,
            is_little_endian,
        );
    });
}

/// This function has been modified to never write any data, and instead only compute the data
/// necessary to write the IPC header message (i.e. body length in bytes, buffers and nodes).
pub fn write_union(
    array: &UnionArray,
    buffers: &mut Vec<ipc::Buffer>,
    arrow_data_len: &mut usize,
    nodes: &mut Vec<ipc::FieldNode>,
    offset: &mut i64,
    is_little_endian: bool,
) {
    write_buffer(
        array.types(),
        buffers,
        arrow_data_len,
        offset,
        is_little_endian,
    );

    if let Some(offsets) = array.offsets() {
        write_buffer(offsets, buffers, arrow_data_len, offset, is_little_endian);
    }
    array.fields().iter().for_each(|array| {
        write(
            array.as_ref(),
            buffers,
            arrow_data_len,
            nodes,
            offset,
            is_little_endian,
        )
    });
}

/// This function has been modified to never write any data, and instead only compute the data
/// necessary to write the IPC header message (i.e. body length in bytes, buffers and nodes).
fn write_map(
    array: &MapArray,
    buffers: &mut Vec<ipc::Buffer>,
    arrow_data_len: &mut usize,
    nodes: &mut Vec<ipc::FieldNode>,
    offset: &mut i64,
    is_little_endian: bool,
) {
    let offsets = array.offsets();
    let validity = array.validity();

    write_bitmap(validity, offsets.len() - 1, buffers, arrow_data_len, offset);

    let first = *offsets.first().unwrap();
    let last = *offsets.last().unwrap();
    if first == 0 {
        write_buffer(offsets, buffers, arrow_data_len, offset, is_little_endian);
    } else {
        write_buffer_from_iter(
            offsets.iter().map(|x| *x - first),
            buffers,
            arrow_data_len,
            offset,
            is_little_endian,
        );
    }

    write(
        array
            .field()
            .slice(first as usize, last as usize - first as usize)
            .as_ref(),
        buffers,
        arrow_data_len,
        nodes,
        offset,
        is_little_endian,
    );
}

/// This function has been modified to never write any data, and instead only compute the data
/// necessary to write the IPC header message (i.e. body length in bytes, buffers and nodes).
fn write_fixed_size_list(
    array: &FixedSizeListArray,
    buffers: &mut Vec<ipc::Buffer>,
    arrow_data_len: &mut usize,
    nodes: &mut Vec<ipc::FieldNode>,
    offset: &mut i64,
    is_little_endian: bool,
) {
    write_bitmap(
        array.validity(),
        array.len(),
        buffers,
        arrow_data_len,
        offset,
    );
    write(
        array.values().as_ref(),
        buffers,
        arrow_data_len,
        nodes,
        offset,
        is_little_endian,
    );
}

// use `write_keys` to either write keys or values
#[allow(clippy::too_many_arguments)]
/// This function has been modified to never write any data, and instead only compute the data
/// necessary to write the IPC header message (i.e. body length in bytes, buffers and nodes).
pub(super) fn write_dictionary<K: DictionaryKey>(
    array: &DictionaryArray<K>,
    buffers: &mut Vec<ipc::Buffer>,
    arrow_data_len: &mut usize,
    nodes: &mut Vec<ipc::FieldNode>,
    offset: &mut i64,
    is_little_endian: bool,
    write_keys: bool,
) -> usize {
    if write_keys {
        write_primitive(
            array.keys(),
            buffers,
            arrow_data_len,
            offset,
            is_little_endian,
        );
        array.keys().len()
    } else {
        write(
            array.values().as_ref(),
            buffers,
            arrow_data_len,
            nodes,
            offset,
            is_little_endian,
        );
        array.values().len()
    }
}

/// Writes an [`Array`] to `arrow_data`
///
/// This function has been modified to never write any data, and instead only compute the data
/// necessary to write the IPC header message (i.e. body length in bytes, buffers and nodes).
pub fn write(
    array: &dyn Array,
    buffers: &mut Vec<ipc::Buffer>,
    arrow_data_len: &mut usize,
    nodes: &mut Vec<ipc::FieldNode>,
    offset: &mut i64,
    is_little_endian: bool,
) {
    nodes.push(ipc::FieldNode {
        length: array.len() as i64,
        null_count: array.null_count() as i64,
    });
    use PhysicalType::*;
    match array.data_type().to_physical_type() {
        Null => (),
        Boolean => write_boolean(
            array.as_any().downcast_ref().unwrap(),
            buffers,
            arrow_data_len,
            offset,
            is_little_endian,
        ),
        Primitive(primitive) => {
            crate::with_match_primitive_type!(primitive, |$T| {
                let array = array.as_any().downcast_ref().unwrap();
                write_primitive::<$T>(array, buffers, arrow_data_len, offset, is_little_endian)
            })
        }
        Binary => write_binary::<i32>(
            array.as_any().downcast_ref().unwrap(),
            buffers,
            arrow_data_len,
            offset,
            is_little_endian,
        ),
        LargeBinary => write_binary::<i64>(
            array.as_any().downcast_ref().unwrap(),
            buffers,
            arrow_data_len,
            offset,
            is_little_endian,
        ),
        FixedSizeBinary => write_fixed_size_binary(
            array.as_any().downcast_ref().unwrap(),
            buffers,
            arrow_data_len,
            offset,
            is_little_endian,
        ),
        Utf8 => write_utf8::<i32>(
            array.as_any().downcast_ref().unwrap(),
            buffers,
            arrow_data_len,
            offset,
            is_little_endian,
        ),
        LargeUtf8 => write_utf8::<i64>(
            array.as_any().downcast_ref().unwrap(),
            buffers,
            arrow_data_len,
            offset,
            is_little_endian,
        ),
        List => write_list::<i32>(
            array.as_any().downcast_ref().unwrap(),
            buffers,
            arrow_data_len,
            nodes,
            offset,
            is_little_endian,
        ),
        LargeList => write_list::<i64>(
            array.as_any().downcast_ref().unwrap(),
            buffers,
            arrow_data_len,
            nodes,
            offset,
            is_little_endian,
        ),
        FixedSizeList => write_fixed_size_list(
            array.as_any().downcast_ref().unwrap(),
            buffers,
            arrow_data_len,
            nodes,
            offset,
            is_little_endian,
        ),
        Struct => write_struct(
            array.as_any().downcast_ref().unwrap(),
            buffers,
            arrow_data_len,
            nodes,
            offset,
            is_little_endian,
        ),
        Dictionary(key_type) => crate::match_integer_type!(key_type, |$T| {
            write_dictionary::<$T>(
                array.as_any().downcast_ref().unwrap(),
                buffers,
                arrow_data_len,
                nodes,
                offset,
                is_little_endian,

                true,
            );
        }),
        Union => {
            write_union(
                array.as_any().downcast_ref().unwrap(),
                buffers,
                arrow_data_len,
                nodes,
                offset,
                is_little_endian,
            );
        }
        Map => {
            write_map(
                array.as_any().downcast_ref().unwrap(),
                buffers,
                arrow_data_len,
                nodes,
                offset,
                is_little_endian,
            );
        }
    }

    assert_buffer_monotonicity(buffers);
}

#[inline]
/// This function has been taken, unmodified from [`arrow2`]
fn pad_buffer_to_8(buffer: &mut usize, length: usize) {
    let pad_len = pad_to_8(length);
    *buffer += pad_len;
}

/// writes `bytes` to `arrow_data` updating `buffers` and `offset` and guaranteeing a 8 byte
/// boundary.
fn write_bytes(
    bytes: &[u8],
    buffers: &mut Vec<ipc::Buffer>,
    arrow_data_len: &mut usize,
    offset: &mut i64,
) {
    let start = *arrow_data_len;

    *arrow_data_len += bytes.len();

    buffers.push(finish_buffer(arrow_data_len, start, offset));
}

/// This function has been modified to never write any data, and instead only compute the data
/// necessary to write the IPC header message (i.e. body length in bytes, buffers and nodes).
fn write_bitmap(
    bitmap: Option<&Bitmap>,
    length: usize,
    buffers: &mut Vec<ipc::Buffer>,
    arrow_data_len: &mut usize,
    offset: &mut i64,
) {
    match bitmap {
        Some(bitmap) => {
            assert_eq!(bitmap.len(), length);
            let (slice, slice_offset, _) = bitmap.as_slice();
            if slice_offset != 0 {
                // case where we can't slice the bitmap as the offsets are not multiple of 8
                let bytes = Bitmap::from_trusted_len_iter(bitmap.iter());
                let (slice, ..) = bytes.as_slice();
                write_bytes(slice, buffers, arrow_data_len, offset)
            } else {
                write_bytes(slice, buffers, arrow_data_len, offset)
            }
        }
        None => {
            buffers.push(ipc::Buffer {
                offset: *offset,
                length: 0,
            });
        }
    }
}

/// writes `bytes` to `arrow_data` updating `buffers` and `offset` and guaranteeing a 8 byte
/// boundary.
///
/// This function has been modified to never write any data, and instead only compute the data
/// necessary to write the IPC header message (i.e. body length in bytes, buffers and nodes).
fn write_buffer<T: NativeType>(
    buffer: &[T],
    buffers: &mut Vec<ipc::Buffer>,
    arrow_data_len: &mut usize,
    offset: &mut i64,
    is_little_endian: bool,
) {
    let start = *arrow_data_len;
    _write_buffer(buffer, arrow_data_len, is_little_endian);

    buffers.push(finish_buffer(arrow_data_len, start, offset));
}

#[inline]
/// This function has been modified to never write any data, and instead only compute the data
/// necessary to write the IPC header message (i.e. body length in bytes, buffers and nodes).
fn _write_buffer_from_iter<T: NativeType, I: TrustedLen<Item = T>>(
    buffer: I,
    arrow_data_len: &mut usize,
    is_little_endian: bool,
) {
    if is_little_endian {
        buffer
            .map(|x| T::to_le_bytes(&x))
            .for_each(|x| *arrow_data_len += x.as_ref().len())
    } else {
        buffer
            .map(|x| T::to_be_bytes(&x))
            .for_each(|x| *arrow_data_len += x.as_ref().len())
    }
}

/// This function has been modified to never write any data, and instead only compute the data
/// necessary to write the IPC header message (i.e. body length in bytes, buffers and nodes).
fn _write_buffer<T: NativeType>(buffer: &[T], arrow_data_len: &mut usize, is_little_endian: bool) {
    if is_little_endian == cfg!(target_endian = "little") {
        // in native endianess we can use the bytes directly.
        let buffer: &[u8] = bytemuck::cast_slice(buffer);
        *arrow_data_len += buffer.len();
    } else {
        _write_buffer_from_iter(buffer.iter().copied(), arrow_data_len, is_little_endian)
    }
}

/// writes `bytes` to `arrow_data` updating `buffers` and `offset` and guaranteeing a 8 byte
/// boundary.
///
/// This function has been modified to never write any data, and instead only compute the data
/// necessary to write the IPC header message (i.e. body length in bytes, buffers and nodes).
#[inline]
fn write_buffer_from_iter<T: NativeType, I: TrustedLen<Item = T>>(
    buffer: I,
    buffers: &mut Vec<ipc::Buffer>,
    arrow_data_len: &mut usize,
    offset: &mut i64,
    is_little_endian: bool,
) {
    let start = *arrow_data_len;

    _write_buffer_from_iter(buffer, arrow_data_len, is_little_endian);

    buffers.push(finish_buffer(arrow_data_len, start, offset));
}

/// This function has been modified to never write any data, and instead only compute the data
/// necessary to write the IPC header message (i.e. body length in bytes, buffers and nodes).
fn finish_buffer(arrow_data_len: &mut usize, start: usize, offset: &mut i64) -> ipc::Buffer {
    let buffer_len = (*arrow_data_len - start) as i64;

    pad_buffer_to_8(arrow_data_len, *arrow_data_len - start);
    let total_len = (*arrow_data_len - start) as i64;

    let buffer = ipc::Buffer {
        offset: *offset,
        length: buffer_len,
    };
    *offset += total_len;
    buffer
}
