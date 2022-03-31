pub mod padding;

mod buffer_change;
mod continuation;
mod ffi;
mod markers;
mod metaversion;
mod ptr;
mod segment;
mod visitor;

pub(in crate) use self::ffi::CSegment;
pub use self::{
    buffer_change::BufferChange,
    continuation::arrow_continuation,
    metaversion::Metaversion,
    segment::{MemoryId, Segment},
};
