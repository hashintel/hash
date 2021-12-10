mod markers;
pub mod memory;
mod ptr;
mod visitor;
pub struct BufferChange(bool, bool);

impl BufferChange {
    pub fn shifted(&self) -> bool {
        self.0
    }

    pub fn resized(&self) -> bool {
        self.1
    }
}
