pub mod padding;

mod buffer_change;
mod continuation;
mod ffi;
mod markers;
mod metaversion;
mod ptr;
mod segment;
// reason: will be removed in a follow-up task
#[allow(clippy::module_inception)]
mod shared_memory;
mod visitor;

pub(in crate) use self::ffi::CMemory;
pub use self::{
    buffer_change::BufferChange,
    continuation::arrow_continuation,
    metaversion::Metaversion,
    segment::Segment,
    shared_memory::{shmem_id_prefix, Memory},
};
