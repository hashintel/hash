#![allow(clippy::module_name_repetitions, clippy::missing_safety_doc)]
use std::os::unix::io::RawFd;

use crate::memory::Memory;

#[repr(C)]
pub struct CMemory {
    pub ptr: *const u8,
    pub len: i64,
    pub memory: *const Memory,
}

#[no_mangle]
pub unsafe extern "C" fn load_shmem(id: *const u8, len: u64) -> *mut CMemory {
    let bytes = std::slice::from_raw_parts(id, len as usize);
    let message = match std::str::from_utf8(bytes) {
        Ok(val) => val,
        Err(_) => return std::ptr::null_mut(),
    };
    // `include_terminal_padding` = true because if external modules resize
    // the shared memory, then that means that this shared memory module
    // contains data subject to external resizing
    match Memory::from_shmem_os_id(message, true, true) {
        Ok(memory) => {
            let ptr = memory.data.as_ptr();
            let memory_size = memory.size as i64;
            let memory = Box::into_raw(Box::new(memory));
            Box::into_raw(Box::new(CMemory {
                ptr,
                len: memory_size,
                memory,
            }))
        }
        _ => std::ptr::null_mut(),
    }
}

#[no_mangle]
// Free memory and drop Memory object
pub unsafe extern "C" fn free_memory(c_memory: *mut CMemory) {
    Box::from_raw((*c_memory).memory as *mut Memory);
}

// Hack to get a compile-time error if the Raw File
// descriptor is of an unexpected size
fn _size_check() {
    unsafe {
        std::mem::transmute::<RawFd, i32>(0);
    }
}
