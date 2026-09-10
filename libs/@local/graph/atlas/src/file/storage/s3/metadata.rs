use aws_sdk_s3::operation::head_object::HeadObjectOutput;

use crate::file::storage::error::StorageError;

#[cfg(test)]
mod tests;

#[derive(Debug)]
pub(crate) struct Metadata {
    pub length: u64,
    pub etag: String,
}

impl TryFrom<HeadObjectOutput> for Metadata {
    type Error = StorageError;

    fn try_from(output: HeadObjectOutput) -> Result<Self, Self::Error> {
        let length = output
            .content_length
            .and_then(|length| u64::try_from(length).ok())
            .ok_or(StorageError::InvalidContentLength)?;
        let etag = output.e_tag.ok_or(StorageError::MissingEntityTag)?;
        Ok(Self { length, etag })
    }
}
