/// An amount of memory or disk space, in bytes.
///
/// It displays as `<n> bytes`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, derive_more::Display)]
#[display("{_0} bytes")]
pub struct ByteSize(u64);

impl ByteSize {
    #[must_use]
    pub const fn from_bytes(bytes: u64) -> Self {
        Self(bytes)
    }

    /// Returns the size in the form DuckDB reads for a size setting.
    pub(crate) fn setting(self) -> Box<str> {
        format!("{} bytes", self.0).into_boxed_str()
    }
}
