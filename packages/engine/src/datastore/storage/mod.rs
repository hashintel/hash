mod markers;
pub mod memory;
mod ptr;
mod visitor;
/// Describes how a change to a buffer affected the memory layout, either by being moved, or by
/// having its length changed
pub struct BufferChange(bool, bool);

impl BufferChange {
    /// True if the buffer's starting address has shifted in memory. This isn't necessarily due to
    /// the actual buffer changing, but can indirectly be because another one grew or shrunk.
    pub fn shifted(&self) -> bool {
        self.0
    }

    /// True if the buffer's length changed
    pub fn resized(&self) -> bool {
        self.1
    }
}
