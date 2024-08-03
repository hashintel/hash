use core::{
    fmt::{self, Display},
    num::NonZero,
};

/// The ID of a source file.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct FileId(Option<NonZero<u32>>);

impl FileId {
    pub const INLINE: Self = Self(None);
}

impl Display for FileId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self.0 {
            Some(id) => write!(f, "<file {}>", id.get()),
            None => f.write_str("<inline>"),
        }
    }
}
