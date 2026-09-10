use core::{clone::CloneToUninit, fmt, str::FromStr};

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

// SAFETY: CloneToUninit requires a valid Self at dest on normal return. Cloning the separator and
// complete UTF-8 tail initializes every field with the source's metadata. The result is a valid
// S3Path.
unsafe impl CloneToUninit for S3Path {
    /// Initializes a destination with the separator and complete path text.
    ///
    /// # Safety
    ///
    /// `dest` must be valid for writes of `size_of_val(self)` bytes and aligned to
    /// `align_of_val(self)`, as required by [`CloneToUninit::clone_to_uninit`].
    unsafe fn clone_to_uninit(&self, dest: *mut u8) {
        // SAFETY: Both pointers derive from self in the same allocation. The str field begins at or
        // after self, and the byte distance cannot exceed the allocation's size. The unsigned
        // offset is valid.
        let path_offset = unsafe { (&raw const self.path).byte_offset_from_unsigned(self) };

        // SAFETY: The caller supplies writable storage for the complete value. The source's
        // metadata fixes the str length and field layout at the destination. The tail at
        // path_offset occupies exactly self.path.len() bytes with alignment one. This range is
        // valid for the str clone.
        unsafe {
            str::clone_to_uninit(&self.path, dest.add(path_offset));
        }

        // SAFETY: repr(C) puts separator at offset zero, and Unalign<usize> has alignment one. Its
        // full size fits in the caller-provided destination. Writing it initializes the remaining
        // field without overlapping the str tail.
        unsafe {
            self.separator.clone_to_uninit(dest);
        }
    }
}

impl Clone for Box<S3Path> {
    fn clone(&self) -> Self {
        Self::clone_from_ref(&**self)
    }
}
