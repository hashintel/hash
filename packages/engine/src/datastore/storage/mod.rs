mod markers;
pub mod memory;
mod ptr;
mod visitor;
pub struct BufferChange(bool, bool);

impl BufferChange {
    /// TODO: DOC possibly that this buffer itself didn't change but moved in memory due to another
    ///   buffer possibly growing or shrinking
    pub fn shifted(&self) -> bool {
        self.0
    }

    pub fn resized(&self) -> bool {
        self.1
    }
}
