/// Describes how a change to a buffer affected the memory layout, either by being moved, or by
/// having its length changed.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
#[must_use = "When memory is changed, the metaversion has to be incremented"]
pub struct BufferChange(bool, bool);

impl BufferChange {
    pub(in crate::shared_memory) fn new(shifted: bool, resized: bool) -> Self {
        Self(shifted, resized)
    }

    /// True if the buffer's starting address has shifted in memory. This isn't necessarily due to
    /// the actual buffer changing, but can indirectly be because another one grew or shrunk.
    pub fn shifted(&self) -> bool {
        self.0
    }

    /// True if the buffer's length changed
    pub fn resized(&self) -> bool {
        self.1
    }

    pub fn combine(self, rhs: Self) -> Self {
        Self(self.0 || rhs.0, self.1 || rhs.1)
    }
}
