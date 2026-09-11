//! The object facts a transfer reads before it starts, taken from a metadata response.

use aws_sdk_s3::operation::head_object::HeadObjectOutput;

use crate::file::storage::error::StorageError;

#[cfg(test)]
mod tests;

/// An object's entity tag, in the spelling the service returned.
///
/// The value is opaque, quotation marks included. Compare two tags, and send one back as a
/// precondition, without interpreting either.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ETag(String);

impl ETag {
    /// Adopts a service-supplied entity tag.
    pub(super) const fn new(value: String) -> Self {
        Self(value)
    }
}

impl From<ETag> for String {
    fn from(etag: ETag) -> Self {
        etag.0
    }
}

impl AsRef<str> for ETag {
    fn as_ref(&self) -> &str {
        &self.0
    }
}

/// The observed length and identity of one source object.
#[derive(Debug)]
pub(crate) struct Metadata {
    /// The object's length in bytes.
    pub length: u64,
    /// The object's identity at the moment of the metadata read.
    pub etag: ETag,
}

impl TryFrom<HeadObjectOutput> for Metadata {
    type Error = StorageError;

    /// Keeps a metadata response that states both a nonnegative length and an entity tag.
    ///
    /// # Errors
    ///
    /// Returns [`StorageError::InvalidContentLength`] if the response omits a nonnegative length,
    /// then [`StorageError::MissingEntityTag`] if it omits the entity tag.
    fn try_from(output: HeadObjectOutput) -> Result<Self, Self::Error> {
        let length = output
            .content_length
            .and_then(|length| u64::try_from(length).ok())
            .ok_or(StorageError::InvalidContentLength)?;
        let etag = output.e_tag.ok_or(StorageError::MissingEntityTag)?;

        Ok(Self {
            length,
            etag: ETag::new(etag),
        })
    }
}
