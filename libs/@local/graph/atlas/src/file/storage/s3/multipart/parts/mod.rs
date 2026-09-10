use aws_sdk_s3::{
    primitives::{ByteStream, ByteStreamError, Length},
    types::CompletedPart,
};
use camino::Utf8Path;

use crate::file::storage::error::StorageError;

#[cfg(test)]
mod tests;

pub(crate) struct Part {
    pub number: i32,
    offset: u64,
    length: u64,
}

impl Part {
    /// Opens this part's file interval for incremental reading.
    ///
    /// # Errors
    ///
    /// Returns [`ByteStreamError`] if the file cannot supply the requested interval.
    pub(crate) async fn read(
        &self,
        path: impl AsRef<Utf8Path>,
    ) -> Result<ByteStream, ByteStreamError> {
        ByteStream::read_from()
            .path(path.as_ref())
            .offset(self.offset)
            .length(Length::Exact(self.length))
            .build()
            .await
    }

    pub(crate) fn copy_range(&self) -> String {
        let end = self.offset + self.length - 1;
        format!("bytes={}-{end}", self.offset)
    }

    /// Associates required completion metadata with this part's number.
    ///
    /// # Errors
    ///
    /// Returns [`StorageError`] if the response omitted its `ETag` or checksum.
    pub(crate) fn complete(
        self,
        etag: Option<String>,
        checksum: Option<String>,
    ) -> Result<CompletedPart, StorageError> {
        let etag = etag.ok_or(StorageError::MissingEntityTag)?;
        let checksum = checksum.ok_or(StorageError::MissingChecksum)?;

        Ok(CompletedPart::builder()
            .part_number(self.number)
            .e_tag(etag)
            .checksum_crc32(checksum)
            .build())
    }
}

pub(crate) struct Parts {
    length: u64,
    part_bytes: u64,
}

impl Parts {
    const MAX_PARTS: u64 = 10_000;
    const MAX_PART_BYTES: u64 = 5 * 1024 * 1024 * 1024;
    // S3 requires all non-final parts to contain at least 5 MiB. Each part is at most 5 GiB,
    // and the completion request can contain at most 10,000 parts.
    const MIN_PART_BYTES: u64 = 5 * 1024 * 1024;

    pub(crate) const fn new(length: u64) -> Result<Self, StorageError> {
        let part_bytes = Self::MIN_PART_BYTES.max(length.div_ceil(Self::MAX_PARTS));
        if part_bytes > Self::MAX_PART_BYTES {
            return Err(StorageError::ObjectTooLarge { length });
        }
        Ok(Self { length, part_bytes })
    }

    pub(crate) fn iter(&self) -> impl Iterator<Item = Part> + '_ {
        (0..self.length.div_ceil(self.part_bytes)).map(|index| {
            let offset = index * self.part_bytes;
            Part {
                number: i32::try_from(index + 1).expect("part number should fit within 10,000"),
                offset,
                length: self.part_bytes.min(self.length - offset),
            }
        })
    }
}
