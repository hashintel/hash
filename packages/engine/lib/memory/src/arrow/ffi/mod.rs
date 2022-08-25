//! This module contains code which enables the engine to work with the Arrow C foreign function
//! interface (FFI). This is useful primarily when interacting with the language runners, where we
//! use the C FFI to pass Arrow data across the language boundary.

mod flush;
mod schema_conversion;
mod test;

use std::{ffi::c_void, os::raw::c_char, sync::Arc};

use arrow_format::ipc::planus::ReadAsRoot;

use super::meta::{DynamicMetadata, StaticMetadata};
use crate::{
    arrow::meta,
    shared_memory::{CSegment, Segment},
    Error,
};

pub type ReleaseArrowArray = extern "C" fn(*mut ArrowArray);
pub type ReleaseArrowSchema = extern "C" fn(*mut ArrowSchema);

// See Arrow src: cpp/src/arrow/c/abi.h
#[repr(C)]
#[derive(Debug)]
/// An arrow schema in C form.
pub struct ArrowSchema {
    // Array type description
    format: *const c_char,
    name: *const c_char,
    metadata: *const c_char,
    flags: i64,
    n_children: i64,
    children: *const *const ArrowSchema,
    dictionary: *const ArrowSchema,

    // Release callback
    release: ReleaseArrowSchema,
    // Opaque producer-specific data
    private_data: *const c_void,
}

// See Arrow src: cpp/src/arrow/c/abi.h
#[repr(C)]
#[derive(Debug)]
pub struct ArrowArray {
    // Array data description
    length: i64,
    null_count: i64,
    offset: i64,
    n_buffers: i64,
    n_children: i64,
    buffers: *mut *mut c_void,
    children: *mut *mut ArrowArray,
    dictionary: *mut *mut ArrowArray,

    // Release callback
    release: ReleaseArrowArray,
    // Opaque producer-specific data
    private_data: *mut c_void,
}

// Call this at the beginning of the experiment runs
#[no_mangle]
unsafe extern "C" fn get_static_metadata(schema: usize) -> *const meta::StaticMetadata {
    let schema = schema as *const ArrowSchema;
    match schema_conversion::c_schema_to_rust(&*schema) {
        Ok(rust_schema) => {
            let meta = StaticMetadata::from_schema(Arc::new(rust_schema));
            let boxed = Box::new(meta);
            Box::into_raw(boxed)
        }
        Err(why) => {
            tracing::error!("Error in `get_static_metadata`: {:?}", &why);
            std::ptr::null()
        }
    }
}

#[no_mangle]
unsafe extern "C" fn free_static_metadata(ptr: *mut meta::StaticMetadata) {
    if !ptr.is_null() {
        drop(Box::from_raw(ptr));
    }
}

#[no_mangle]
unsafe extern "C" fn free_c_arrow_schema(schema: usize) {
    let ptr = schema as *mut ArrowSchema;
    ((*ptr).release)(ptr);
}

#[no_mangle]
unsafe extern "C" fn free_c_arrow_array(array: usize) {
    let ptr = array as *mut ArrowArray;
    ((*ptr).release)(ptr);
}

// Call this when a new batch is loaded
// Lifetime: lifetime of batch
#[no_mangle]
unsafe extern "C" fn get_dynamic_metadata(
    memory_ptr: *const CSegment,
) -> *const meta::DynamicMetadata {
    let c_memory = &*memory_ptr;
    let segment = &mut *(c_memory.segment as *mut Segment);
    match segment.get_metadata() {
        Ok(meta_buffer) => {
            let batch_message = match arrow_format::ipc::MessageRef::read_as_root(meta_buffer)
                .map_err(Error::from)
                .and_then(|message| {
                    let header_ref = message.header()?.ok_or_else(|| {
                        Error::ArrowBatch(format!("Couldn't read message: {:#?}", &message))
                    })?;

                    match header_ref {
                        arrow_format::ipc::MessageHeaderRef::RecordBatch(record_batch) => {
                            Ok(record_batch)
                        }
                        _ => Err(Error::ArrowBatch(format!(
                            "Couldn't read message: {:#?}",
                            &message
                        ))),
                    }
                }) {
                Ok(ret) => ret,
                Err(why) => {
                    tracing::error!("Error in `get_dynamic_metadata`: {:?}", &why);
                    return std::ptr::null();
                }
            };
            // Can't fail if memory.get_metadata worked
            let data_buffer_len = segment.get_data_buffer_len().unwrap();
            let dynamic_meta =
                match DynamicMetadata::from_record_batch(&batch_message, data_buffer_len) {
                    Ok(ret) => ret,
                    Err(why) => {
                        tracing::error!("Error in `get_dynamic_metadata`: {:?}", &why);
                        return std::ptr::null();
                    }
                };
            let boxed = Box::new(dynamic_meta);
            Box::into_raw(boxed)
        }
        Err(why) => {
            tracing::error!("Error in `get_dynamic_metadata`: {:?}", &why);
            std::ptr::null()
        }
    }
}

#[no_mangle]
unsafe extern "C" fn free_dynamic_metadata(ptr: *mut meta::DynamicMetadata) {
    if !ptr.is_null() {
        drop(Box::from_raw(ptr));
    }
}
