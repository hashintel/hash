use std::{self, ptr::NonNull};

use super::{new_js_string, Error, Result};

/// C representation of Arrow array data nodes
#[repr(C)]
#[derive(Debug)]
pub struct DataFfi<'s> {
    pub len: usize,
    pub null_count: usize,
    pub n_buffers: u32,
    // The number of valid pointers in buffer_ptrs and valid capacities in buffer_capacities is
    // equal to n_buffers, which is at most 2.
    pub buffer_ptrs: [*const u8; 2],
    pub buffer_capacities: [usize; 2],
    // This pointer can be null if the Arrow array doesn't have a null bitmap
    pub null_bits_ptr: *const u8,
    pub null_bits_capacity: usize,
    pub(crate) _phantom: std::marker::PhantomData<v8::Local<'s, ()>>,
}

impl<'s> DataFfi<'s> {
    pub(crate) fn new_from_js(
        scope: &mut v8::HandleScope<'s>,
        data: v8::Local<'s, v8::Object>,
    ) -> Result<DataFfi<'s>> {
        let len_num: v8::Local<'s, v8::Number> = get_data_property(scope, data, "len")?;
        let null_count_num: v8::Local<'s, v8::Number> =
            get_data_property(scope, data, "null_count")?;

        let buffers: v8::Local<'s, v8::Array> = get_data_property(scope, data, "buffers")?;
        let n_buffers = buffers.length();
        if n_buffers > 2 {
            return Err(Error::V8(format!(
                "Invalid buffers length ({}), expected no more than 2",
                buffers.length()
            )));
        }

        let mut buffer_ptrs = [std::ptr::null(); 2];
        let mut buffer_capacities = [0; 2];
        for i in 0..buffers.length() {
            let buffer_value = buffers
                .get_index(scope, i)
                .ok_or_else(|| Error::V8(format!("Could not access index {i} on buffers")))?;
            let buffer: v8::Local<'s, v8::ArrayBuffer> =
                buffer_value.try_into().map_err(|err| {
                    Error::V8(format!(
                        "Could not convert buffer_value from Value to ArrayBuffer: {err}"
                    ))
                })?;
            let contents = buffer.get_backing_store();
            buffer_ptrs[i as usize] = contents
                .data()
                .map(NonNull::as_ptr)
                .unwrap_or(std::ptr::null_mut())
                .cast();
            buffer_capacities[i as usize] = contents.byte_length();
        }

        let null_bits: v8::Local<'s, v8::ArrayBuffer> =
            get_data_property(scope, data, "null_bits")?;
        let contents = null_bits.get_backing_store();
        let null_bits_ptr = contents
            .data()
            .map(NonNull::as_ptr)
            .unwrap_or(std::ptr::null_mut())
            .cast();
        let null_bits_capacity = contents.byte_length();

        Ok(DataFfi {
            len: len_num.value() as usize,
            null_count: null_count_num.value() as usize,
            n_buffers,
            buffer_ptrs,
            buffer_capacities,
            null_bits_ptr,
            null_bits_capacity,
            _phantom: std::marker::PhantomData,
        })
    }
}

pub(crate) fn get_obj_property<'s>(
    scope: &mut v8::HandleScope<'s>,
    obj: v8::Local<'s, v8::Object>,
    key: impl AsRef<str>,
) -> Result<v8::Local<'s, v8::Value>> {
    let key = key.as_ref();
    let js_key = new_js_string(scope, key)?;

    obj.get(scope, js_key.into())
        .ok_or_else(|| Error::V8(format!("Could not get {key} property on obj")))
}

fn get_data_property<'s, T>(
    scope: &mut v8::HandleScope<'s>,
    data: v8::Local<'s, v8::Object>,
    property: &str,
) -> Result<v8::Local<'s, T>>
where
    v8::Local<'s, T>: TryFrom<v8::Local<'s, v8::Value>>,
    <v8::Local<'s, T> as TryFrom<v8::Local<'s, v8::Value>>>::Error: std::fmt::Display,
{
    let len_value = get_obj_property(scope, data, property)?;
    len_value.try_into().map_err(|err| {
        Error::V8(format!(
            "Could not convert {property} from Value to {}: {err}",
            std::any::type_name::<T>().rsplit_once(':').unwrap().1
        ))
    })
}
