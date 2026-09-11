//! An S3 object location holding the caller's own bucket and key text.
#![expect(
    clippy::empty_enums,
    reason = "zerocopy's derive emits one variantless enum per field, inside a module-level const \
              block that no attribute on `BucketPath` reaches"
)]

use core::{
    clone::CloneToUninit,
    fmt::{self, Write as _},
    str::FromStr,
};

use zerocopy::{FromZeros as _, Unalign};

use crate::file::storage::path::error::{FilePathError, PathComponent};

#[cfg(test)]
mod tests;

/// An S3 bucket and object key in unescaped form.
///
/// Use [`Self::copy_source`] to obtain the [`CopySource`] encoding for the
/// `x-amz-copy-source` header.
#[derive(zerocopy::FromZeros, zerocopy::KnownLayout, zerocopy::Immutable)]
#[repr(C)]
pub(crate) struct BucketPath {
    separator: Unalign<usize>,
    path: str,
}

#[expect(
    clippy::string_slice,
    reason = "the separator is the byte offset of an ASCII slash"
)]
impl BucketPath {
    pub(super) fn from_parts(bucket: &str, key: &str) -> Result<Box<Self>, FilePathError> {
        let mut next = Self::new_box_zeroed_with_elems(bucket.len() + key.len() + 1)?;
        next.separator.set(bucket.len());

        next.path[..bucket.len()].copy_from_str(bucket);
        next.path[bucket.len()..(bucket.len() + 1)].copy_from_str("/");
        next.path[(bucket.len() + 1)..].copy_from_str(key);

        Ok(next)
    }

    /// Returns the bucket name.
    pub(crate) fn bucket(&self) -> &str {
        &self.path[..self.separator.get()]
    }

    /// Returns the object key, in its original spelling.
    pub(crate) fn key(&self) -> &str {
        &self.path[(self.separator.get() + 1)..]
    }

    pub(crate) fn file_name(&self) -> Option<&str> {
        let key = self.key();

        key.rsplit_once('/')
            .map(|(_, file_name)| file_name)
            .or(Some(key))
            .filter(|name| !name.is_empty())
    }

    /// Appends literal key text, inserting a slash when the key has no trailing slash.
    ///
    /// # Errors
    ///
    /// Returns [`FilePathError`] if allocating the resulting path fails.
    pub(crate) fn join(&self, suffix: &str) -> Result<Box<Self>, FilePathError> {
        let separator = if self.key().ends_with('/') { "" } else { "/" };

        let mut next =
            Self::new_box_zeroed_with_elems(self.path.len() + separator.len() + suffix.len())?;

        let mut index = 0;
        next.path[..self.path.len()].copy_from_str(&self.path);
        index += self.path.len();
        next.path[index..(index + separator.len())].copy_from_str(separator);
        index += separator.len();
        next.path[index..].copy_from_str(suffix);

        // appending to the key preserves the original bucket/key separator.
        next.separator.set(self.separator.get());
        Ok(next)
    }

    /// Returns this location rendered for the `x-amz-copy-source` request header.
    pub(super) const fn copy_source(&self) -> CopySource<'_> {
        CopySource(self)
    }
}

impl AsRef<str> for BucketPath {
    /// Returns the `bucket/key` text, without the `s3://` prefix.
    fn as_ref(&self) -> &str {
        &self.path
    }
}

impl fmt::Debug for BucketPath {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.debug_struct("BucketPath")
            .field("bucket", &self.bucket())
            .field("key", &self.key())
            .finish()
    }
}

impl fmt::Display for BucketPath {
    /// Writes the `s3://bucket/key` spelling [`FromStr`] accepts.
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(fmt, "s3://{}", self.as_ref())
    }
}

impl FromStr for Box<BucketPath> {
    type Err = FilePathError;

    /// Parses an `s3://bucket/key` spelling, keeping the key as literal text.
    ///
    /// # Errors
    ///
    /// Returns [`FilePathError`] for a spelling that does not name a nonempty bucket and a
    /// nonempty key after an `s3://` prefix, or when allocating the path fails.
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

        let mut s3_path = BucketPath::new_box_zeroed_with_elems(path.len())?;
        s3_path.separator.set(position);
        s3_path.path.copy_from_str(path);
        Ok(s3_path)
    }
}

// SAFETY: CloneToUninit requires a valid Self at dest on normal return. Cloning the separator and
// complete UTF-8 tail initializes every field with the source's metadata. The result is a valid
// BucketPath.
unsafe impl CloneToUninit for BucketPath {
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

impl Clone for Box<BucketPath> {
    fn clone(&self) -> Self {
        Self::clone_from_ref(&**self)
    }
}

/// A bucket and key rendered for the `x-amz-copy-source` request header.
///
/// [`fmt::Display`] keeps `/` and the unreserved characters, and percent-encodes every other
/// byte. A `%` already in the key becomes `%25`, which preserves a key spelling its own escapes.
pub(crate) struct CopySource<'path>(&'path BucketPath);

impl fmt::Display for CopySource<'_> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        for byte in self.0.as_ref().bytes() {
            if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'.' | b'_' | b'~' | b'/') {
                fmt.write_char(char::from(byte))?;
            } else {
                write!(fmt, "%{byte:02X}")?;
            }
        }
        Ok(())
    }
}
