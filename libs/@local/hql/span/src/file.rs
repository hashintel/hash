/// The ID of a source file.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct FileId(u32);

impl FileId {
    pub const INLINE: Self = Self(!0 - 1);
}
