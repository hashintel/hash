use std::{ptr::NonNull, slice};

use arrow2::{
    array::{
        BooleanArray, FixedSizeBinaryArray, FixedSizeListArray, ListArray, PrimitiveArray,
        StructArray, Utf8Array,
    },
    bitmap::Bitmap,
    buffer::Buffer,
    datatypes::DataType,
    types::NativeType,
};
use memory::arrow::util::bit_util;
use num::Num;

use super::{get_child_data, ThreadLocalRunner};
use crate::runner::{
    javascript::{data_ffi, error::JavaScriptResult, Value},
    JavaScriptError,
};

impl<'s> ThreadLocalRunner<'s> {
    /// Creates a new buffer from the provided `data_ptr` and `data_capacity` with at least
    /// `data_len` elements copied from `data_ptr` and a size of `target_len` elements.
    ///
    /// # SAFETY
    ///
    /// - `data_ptr` must be valid for `data_len` reads of `T`
    unsafe fn read_primitive_buffer<T: NativeType + Num>(
        &self,
        data_ptr: NonNull<T>,
        data_len: usize,
        _data_capacity: usize, // for future use to create a `Buffer::from_raw_parts`
        target_len: usize,
    ) -> Buffer<T> {
        // TODO: OPTIM: We currently copy the buffers because the JavaScript representation of
        //   arrays does not match the Rust implementation. Try to reduce copies where possible by
        //   reusing it, i.e. check, if `target_len` >= `data_capacity` and constructing it from raw
        //   parts.
        // Create a buffer for `target_len` elements
        let mut builder = Vec::with_capacity(target_len);

        // Read data from JS
        builder.extend_from_slice(slice::from_raw_parts(data_ptr.as_ptr(), data_len));

        // Ensure we don't subtract a larger unsigned number from a smaller
        // TODO: Use `buffer.resize()` instead of `builder.advance()`
        debug_assert!(
            target_len >= data_len,
            "Expected length is smaller than the actual length for buffer: {:?}",
            slice::from_raw_parts(data_ptr.as_ptr(), data_len)
        );
        // make the buffer larger as needed
        builder.resize(builder.len() + (target_len - data_len), T::zero());
        Buffer::from(builder)
    }

    /// Creates a new offset buffer from the provided `data_ptr` and `data_capacity` with at least a
    /// with `data_len` elements copied from `ptr` and a size of `target_len` elements.
    ///
    /// Returns the buffer and the last offset.
    ///
    /// # SAFETY
    ///
    /// - `ptr` must be valid for `data_len + 1` reads of `i32`
    unsafe fn read_offset_buffer(
        &self,
        data_ptr: NonNull<i32>,
        data_len: usize,
        _data_capacity: usize, // for future use to create a `Buffer::from_raw_parts`
        target_len: usize,
    ) -> (Buffer<i32>, usize) {
        // TODO: OPTIM: We currently copy the buffers because the JavaScript representation of
        //   arrays does not match the Rust implementation. Try to reduce copies where possible by
        //   reusing it, i.e. check, if `target_len` <= `data_capacity` and constructing it from raw
        //   parts.

        // For each value in the buffer, we have a start offset and an end offset. The start offset
        // is equal to the end offset of the previous value, thus we need `num_values + 1`
        // offset values.
        let mut builder = Vec::with_capacity(target_len + 1);

        let offsets = slice::from_raw_parts(data_ptr.as_ptr(), data_len + 1);
        debug_assert_eq!(offsets[0], 0, "Offset buffer does not start with `0`");
        debug_assert!(
            offsets.iter().all(|o| *o >= 0),
            "Offset buffer contains negative values"
        );
        debug_assert!(offsets.is_sorted(), "Offsets are not ordered");

        // Read data from JS
        builder.extend_from_slice(offsets);

        let last = offsets[data_len];

        // Ensure we don't subtract a larger unsigned number from a smaller
        debug_assert!(
            target_len >= data_len,
            "Expected offset count is smaller than the actual buffer: {:?}",
            slice::from_raw_parts(data_ptr.as_ptr(), data_len + 1)
        );
        builder.resize(target_len + 1, 0);
        (Buffer::from_iter(builder), last as usize)
    }

    /// Creates a new packed buffer from the provided `data_ptr` and `data_capacity` with at least
    /// `data_len` elements copied from `data_ptr` and a size of `target_len` elements.
    ///
    /// # SAFETY
    ///
    /// - `data_ptr` must be valid for `ceil(data_len/8)` reads of `u8`
    unsafe fn read_boolean_buffer(
        &self,
        data_ptr: NonNull<u8>,
        data_len: usize,
        _data_capacity: usize, // for future use to create a `Buffer::from_raw_parts`
        target_len: usize,
    ) -> Bitmap {
        // TODO: OPTIM: We currently copy the buffers because the JavaScript representation of
        //   arrays does not match the Rust implementation. Try to reduce copies where possible by
        //   reusing it, i.e. check, if `target_len` <= `data_capacity` and constructing it from raw
        //   parts.

        let mut mutable_bitmap = Bitmap::from_u8_slice(
            slice::from_raw_parts(data_ptr.as_ptr(), bit_util::ceil(data_len, 8)),
            data_len,
        )
        .into_mut()
        .unwrap_right();

        assert!(target_len >= data_len);
        mutable_bitmap.extend_constant(target_len - data_len, false);
        mutable_bitmap.into()
    }

    /// TODO: DOC, flushing from a single column
    ///
    /// TODO: investigate whether it is possible to use the Arrow FFI interface here
    pub(in crate::runner::javascript) fn array_data_from_js(
        &mut self,
        scope: &mut v8::HandleScope<'s>,
        data: Value<'s>,
        data_type: &DataType,
        len: Option<usize>,
    ) -> JavaScriptResult<Box<dyn arrow2::array::Array>> {
        // `data` must not be dropped until flush is over, because
        // pointers returned from FFI point inside `data`'s ArrayBuffers' memory.
        let obj = data.to_object(scope).ok_or_else(|| {
            JavaScriptError::Embedded(format!("Flush data not object for field {data_type:?}"))
        })?;

        // `data_node_from_js` isn't recursive -- doesn't convert children.
        let data = data_ffi::DataFfi::new_from_js(scope, obj)?;

        // The JS Arrow implementation tries to be efficient with the allocation of the values
        // buffers. If you have a null value at the end, it doesn't always allocate that
        // within the buffer. Rust expects that to be explicitly there though, so there's a
        // mismatch in the expected lengths. `target_len` is the number of elements the Rust
        // implementation of Arrow expects in the resulting `ArrayData`.
        //
        // Example:
        // Considering a column of fixed-size-lists with two elements each: [[1, 2], [3, 4], null]
        // JavaScript will only provide a value-array for the child data containing [1, 2, 3, 4]
        // (data.len == 4), but Rust expects it to be [1, 2, 3, 4, ?, ?] (target_len == 6) where `?`
        // means an unspecified value. We read [1, 2, 3, 4] from the JS data by using `data.len` and
        // then resize the buffer to `target_len`.
        let target_len = len.unwrap_or(data.len);

        let validity = NonNull::new(data.null_bits_ptr as *mut u8).map(|null_bits_ptr| {
            // SAFETY: null-bits are provided by arrow
            unsafe {
                self.read_boolean_buffer(
                    null_bits_ptr,
                    data.len,
                    data.null_bits_capacity,
                    target_len,
                )
            }
        });

        Ok(match data_type {
            DataType::Boolean => unsafe {
                // SAFETY: `data` is provided by arrow
                debug_assert!(
                    !data.buffer_ptrs[0].is_null(),
                    "Required pointer for `Boolean` (`buffers[0]`) is null"
                );
                BooleanArray::from_data(
                    DataType::Boolean,
                    self.read_boolean_buffer(
                        NonNull::new_unchecked(data.buffer_ptrs[0] as *mut u8),
                        data.len,
                        data.buffer_capacities[0],
                        target_len,
                    ),
                    validity,
                )
                .boxed()
            },
            DataType::UInt16 => unsafe {
                // SAFETY: `data` is provided by arrow and the type is `u16`
                debug_assert!(
                    !data.buffer_ptrs[0].is_null(),
                    "Required pointer for `UInt16` (`buffers[0]`) is null"
                );
                PrimitiveArray::<u16>::from_data(
                    DataType::UInt16,
                    self.read_primitive_buffer(
                        NonNull::new_unchecked(data.buffer_ptrs[0] as *mut u8).cast::<u16>(),
                        data.len,
                        data.buffer_capacities[0],
                        target_len,
                    ),
                    validity,
                )
                .boxed()
            },
            DataType::UInt32 => unsafe {
                // SAFETY: `data` is provided by arrow and the type is `u32`
                debug_assert!(
                    !data.buffer_ptrs[0].is_null(),
                    "Required pointer for `UInt32` (`buffers[0]`) is null"
                );
                PrimitiveArray::<u32>::from_data(
                    DataType::UInt32,
                    self.read_primitive_buffer(
                        NonNull::new_unchecked(data.buffer_ptrs[0] as *mut u8).cast::<u32>(),
                        data.len,
                        data.buffer_capacities[0],
                        target_len,
                    ),
                    validity,
                )
                .boxed()
            },
            DataType::Float64 => unsafe {
                debug_assert!(
                    !data.buffer_ptrs[0].is_null(),
                    "Required pointer for `Float64` (`buffers[0]`) is null"
                );
                // SAFETY: `data` is provided by arrow and the type is `f64`
                PrimitiveArray::<f64>::from_data(
                    DataType::Float64,
                    self.read_primitive_buffer(
                        NonNull::new_unchecked(data.buffer_ptrs[0] as *mut u8).cast::<f64>(),
                        data.len,
                        data.buffer_capacities[0],
                        target_len,
                    ),
                    validity,
                )
                .boxed()
            },
            DataType::Utf8 => {
                // Utf8 is stored in two buffers:
                //   [0]: The offset buffer (i32)
                //   [1]: The value buffer (u8)

                // SAFETY: Offset `data` is provided by arrow.
                let (offsets, last_offset) = unsafe {
                    debug_assert!(
                        !data.buffer_ptrs[0].is_null(),
                        "Required pointer for `Utf8` (`buffers[0]`) is null"
                    );
                    self.read_offset_buffer(
                        NonNull::new_unchecked(data.buffer_ptrs[0] as *mut u8).cast::<i32>(),
                        data.len,
                        data.buffer_capacities[0],
                        target_len,
                    )
                };

                debug_assert!(
                    offsets.len() > data.len,
                    "the offsets array was too short! offsets.len()={} but data.len={}. Note: we \
                     should have at least values + 1 offsets",
                    offsets.len(),
                    data.len
                );

                // SAFETY: `data` is provided by arrow, the length is provided by `offsets`, and the
                //   type for strings is `u8`
                let values = unsafe {
                    debug_assert!(
                        !data.buffer_ptrs[1].is_null(),
                        "Required pointer for `Utf8` (`buffers[1]`) is null"
                    );
                    self.read_primitive_buffer(
                        NonNull::new_unchecked(data.buffer_ptrs[1] as *mut u8),
                        last_offset,
                        data.buffer_capacities[1],
                        last_offset,
                    )
                };

                Utf8Array::from_data(DataType::Utf8, offsets, values, validity).boxed()
            }
            DataType::List(inner_field) => {
                // List is stored in one buffer and child data containing the indexed values:
                //   buffer: The offset buffer (i32)
                //   child_data: The value data

                // SAFETY: Offset `data` is provided by arrow.
                let (offsets, last_offset) = unsafe {
                    debug_assert!(
                        !data.buffer_ptrs[0].is_null(),
                        "Required pointer for `List` (`buffers[0]`) is null"
                    );
                    self.read_offset_buffer(
                        NonNull::new_unchecked(data.buffer_ptrs[0] as *mut u8).cast::<i32>(),
                        data.len,
                        data.buffer_capacities[0],
                        target_len,
                    )
                };

                let child_data = get_child_data(scope, obj)?;

                let child = child_data.get_index(scope, 0).ok_or_else(|| {
                    JavaScriptError::V8("Could not access index 0 on child_data".to_string())
                })?;
                let child = self.array_data_from_js(
                    scope,
                    child,
                    inner_field.data_type(),
                    Some(last_offset),
                )?;

                ListArray::new(
                    DataType::List(inner_field.clone()),
                    offsets,
                    child,
                    validity,
                )
                .boxed()
            }
            DataType::FixedSizeList(inner_field, size) => {
                // FixedSizeListList is only stored by child data, as offsets are not required
                // because the size is known.
                let child_data = get_child_data(scope, obj)?;

                let child = child_data.get_index(scope, 0).ok_or_else(|| {
                    JavaScriptError::V8("Could not access index 0 on child_data".to_string())
                })?;
                let values = self.array_data_from_js(
                    scope,
                    child,
                    inner_field.data_type(),
                    Some(*size as usize * target_len),
                )?;
                FixedSizeListArray::new(
                    DataType::FixedSizeList(inner_field.clone(), *size),
                    values,
                    validity,
                )
                .boxed()
            }
            DataType::Struct(inner_fields) => {
                // Structs are only defined by child data
                let child_data = get_child_data(scope, obj)?;
                debug_assert_eq!(
                    child_data.length() as usize,
                    inner_fields.len(),
                    "Number of fields provided by JavaScript does not match expected number of \
                     fields"
                );
                let mut arrays = Vec::with_capacity(inner_fields.len());
                for (i, inner_field) in (0..child_data.length()).zip(inner_fields) {
                    let child = child_data.get_index(scope, i as u32).ok_or_else(|| {
                        JavaScriptError::V8(format!("Could not access index {i} on child_data"))
                    })?;
                    arrays.push(self.array_data_from_js(
                        scope,
                        child,
                        inner_field.data_type(),
                        Some(target_len),
                    )?);
                }
                StructArray::new(DataType::Struct(inner_fields.clone()), arrays, validity).boxed()
            }
            DataType::FixedSizeBinary(size) => {
                // FixedSizeBinary is only stored as a buffer (u8), offsets are not required because
                // the size is known

                // SAFETY: `data` is provided by arrow
                let values = unsafe {
                    debug_assert!(
                        !data.buffer_ptrs[0].is_null(),
                        "Required pointer for `FixedSizeBinary` (`buffers[0]`) is null"
                    );
                    self.read_primitive_buffer(
                        NonNull::new_unchecked(data.buffer_ptrs[0] as *mut u8),
                        *size as usize * data.len,
                        data.buffer_capacities[0],
                        *size as usize * target_len,
                    )
                };
                FixedSizeBinaryArray::new(DataType::FixedSizeBinary(*size), values, validity)
                    .boxed()
            }
            // TODO: More types?
            data_type => return Err(JavaScriptError::FlushType(data_type.clone())),
        })
    }
}
