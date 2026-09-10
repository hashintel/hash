use aws_sdk_s3::operation::head_object::HeadObjectOutput;

use crate::file::storage::error::StorageError;

#[cfg(test)]
mod tests;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ETag(String);

impl ETag {
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

#[derive(Debug)]
pub(crate) struct Metadata {
    pub length: u64,
    pub etag: ETag,
}

impl TryFrom<HeadObjectOutput> for Metadata {
    type Error = StorageError;

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
