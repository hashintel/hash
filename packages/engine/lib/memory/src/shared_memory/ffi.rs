use std::os::unix::io::RawFd;

use tracing::trace;

use crate::shared_memory::Segment;

#[repr(C)]
pub struct CSegment {
    pub ptr: *const u8,
    pub len: i64,
    pub segment: *const Segment,
}

#[no_mangle]
/// Loads a shared memory segment.
///
/// Callers should take care to ensure that the shared memory segment exists before calling this
/// function.
unsafe extern "C" fn load_shmem(id: *const u8, len: u64) -> *mut CSegment {
    let bytes = std::slice::from_raw_parts(id, len as usize);
    let message = match std::str::from_utf8(bytes) {
        Ok(val) => val,
        Err(_) => return std::ptr::null_mut(),
    };
    // `include_terminal_padding` = true because if external modules resize
    // the shared memory, then that means that this shared memory module
    // contains data subject to external resizing
    match Segment::open_unchecked(message, true, true) {
        Ok(segment) => {
            debug_assert!(!segment.data.is_owner());
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
/// Free memory and drop the shared-memory object.
unsafe extern "C" fn free_memory(c_memory: *mut CSegment) {
    let segment = Box::from_raw((*c_memory).segment as *mut Segment);
    trace!(
        "Python did call `free_memory` for segment {} (was owner: {})",
        segment.id(),
        segment.data.is_owner()
    );
    drop(segment);
}

const _: () = assert!(
    std::mem::size_of::<RawFd>() == 4,
    "RawFd must be 4 bytes in size"
);
