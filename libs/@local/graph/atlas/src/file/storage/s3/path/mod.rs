use core::{fmt, str::FromStr};

use zerocopy::{FromZeros as _, Unalign};

use crate::file::storage::path::error::{FilePathError, PathComponent};

#[cfg(test)]
mod tests;

/// A bucket and object key in their original spelling.
///
/// Parsing treats the key as literal text, preserving percent escapes and path components.
#[derive(zerocopy::FromZeros, zerocopy::KnownLayout, zerocopy::Immutable)]
#[repr(C)]
pub(crate) struct S3Path {
    separator: Unalign<usize>,
    path: str,
}

#[expect(
    clippy::string_slice,
    reason = "the separator is the byte offset of an ASCII slash"
)]
impl S3Path {
    pub(crate) fn bucket(&self) -> &str {
        &self.path[..self.separator.get()]
    }

    pub(crate) fn key(&self) -> &str {
        &self.path[(self.separator.get() + 1)..]
    }
}

impl AsRef<str> for S3Path {
    fn as_ref(&self) -> &str {
        &self.path
    }
}

impl fmt::Debug for S3Path {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.debug_struct("S3Path")
            .field("bucket", &self.bucket())
            .field("key", &self.key())
            .finish()
    }
}

impl fmt::Display for S3Path {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(fmt, "s3://{}", self.as_ref())
    }
}

impl FromStr for Box<S3Path> {
    type Err = FilePathError;

    fn from_str(path: &str) -> Result<Self, Self::Err> {
        let path = path.strip_prefix("s3://").ok_or(FilePathError::Scheme)?;
        let position = path.find('/').ok_or(FilePathError::MissingKey)?;

        if position == 0 {
            return Err(FilePathError::Empty {
                component: PathComponent::Bucket,
            });
        }
        if position + 1 == path.len() {
            return Err(FilePathError::Empty {
                component: PathComponent::Key,
            });
        }

        let mut s3_path = S3Path::new_box_zeroed_with_elems(path.len())?;
        s3_path.separator.set(position);
        s3_path.path.copy_from_str(path);
        Ok(s3_path)
    }
}
