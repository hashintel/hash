use core::fmt::{self, Display};

/// The ID of a source file.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct FileId(u32);

impl FileId {
    pub const INLINE: Self = Self(!0);
}

impl Display for FileId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        if *self == Self::INLINE {
            f.write_str("<inline>")
        } else {
            write!(f, "<file {}>", self.0)
        }
    }
}
