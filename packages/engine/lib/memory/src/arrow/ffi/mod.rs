mod flush;
mod schema_conversion;
mod test;

use std::{ffi::c_void, os::raw::c_char, sync::Arc};

use arrow::ipc;

use crate::{
    arrow::meta::{
        self,
        conversion::{HashDynamicMeta, HashStaticMeta},
    },
    shared_memory::{CMemory, Memory},
    Error,
};

pub type ReleaseArrowArray = extern "C" fn(*mut ArrowArray);
pub type ReleaseArrowSchema = extern "C" fn(*mut ArrowSchema);

// See Arrow src: cpp/src/arrow/c/abi.h
#[repr(C)]
#[derive(Debug)]
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
unsafe extern "C" fn get_static_metadata(schema: usize) -> *const meta::Static {
    let schema = schema as *const ArrowSchema;
    match schema_conversion::c_schema_to_rust(&*schema) {
        Ok(rust_schema) => {
            let meta = Arc::new(rust_schema).get_static_metadata();
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
unsafe extern "C" fn free_static_metadata(ptr: *mut meta::Static) {
    if !ptr.is_null() {
        Box::from_raw(ptr);
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
unsafe extern "C" fn get_dynamic_metadata(memory_ptr: *const CMemory) -> *const meta::Dynamic {
    let c_memory = &*memory_ptr;
    let memory = &mut *(c_memory.memory as *mut Memory);
    match memory.get_metadata() {
        Ok(meta_buffer) => {
            let batch_message = match ipc::root_as_message(meta_buffer)
                .map_err(Error::from)
                .and_then(|message| {
                    message
                        .header_as_record_batch()
                        .ok_or_else(|| Error::ArrowBatch("Couldn't read message".into()))
                }) {
                Ok(ret) => ret,
                Err(why) => {
                    tracing::error!("Error in `get_dynamic_metadata`: {:?}", &why);
                    return std::ptr::null();
                }
            };
            // Can't fail if memory.get_metadata worked
            let data_buffer_len = memory.get_data_buffer_len().unwrap();
            let dynamic_meta = match batch_message.into_meta(data_buffer_len) {
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
unsafe extern "C" fn free_dynamic_metadata(ptr: *mut meta::Dynamic) {
    if !ptr.is_null() {
        Box::from_raw(ptr);
    }
}
