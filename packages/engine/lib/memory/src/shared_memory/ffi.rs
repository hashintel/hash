use std::os::unix::io::RawFd;

use crate::shared_memory::Segment;

#[repr(C)]
pub struct CSegment {
    pub ptr: *const u8,
    pub len: i64,
    pub segment: *const Segment,
}

#[no_mangle]
unsafe extern "C" fn load_shmem(id: *const u8, len: u64) -> *mut CSegment {
    let bytes = std::slice::from_raw_parts(id, len as usize);
    let message = match std::str::from_utf8(bytes) {
        Ok(val) => val,
        Err(_) => return std::ptr::null_mut(),
    };
    // `include_terminal_padding` = true because if external modules resize
    // the shared memory, then that means that this shared memory module
    // contains data subject to external resizing
    match Segment::from_shmem_os_id(message, true, true) {
        Ok(segment) => {
            let ptr = segment.data.as_ptr();
            let segment_size = segment.size as i64;
            let segment = Box::into_raw(Box::new(segment));
            Box::into_raw(Box::new(CSegment {
                ptr,
                len: segment_size,
                segment,
            }))
        }
        _ => std::ptr::null_mut(),
    }
}

#[no_mangle]
// Free memory and drop Memory object
unsafe extern "C" fn free_memory(c_memory: *mut CSegment) {
    Box::from_raw((*c_memory).segment as *mut Segment);
}

const _: () = assert!(
    std::mem::size_of::<RawFd>() == 4,
    "RawFd must be 4 bytes in size"
);
