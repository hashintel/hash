use aws_sdk_s3::{
    primitives::{ByteStream, ByteStreamError, Length},
    types::CompletedPart,
};
use camino::Utf8Path;

use crate::file::storage::error::StorageError;

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

#[cfg(test)]
mod tests {
    use std::fs;

    use super::Parts;
    use crate::file::storage::{error::StorageError, tests::TemporaryDirectory};

    #[test]
    fn parts_boundary() {
        for length in [
            1,
            Parts::MIN_PART_BYTES - 1,
            Parts::MIN_PART_BYTES,
            Parts::MIN_PART_BYTES + 1,
            5_000_000_001,
            Parts::MAX_PART_BYTES * Parts::MAX_PARTS,
        ] {
            let parts = Parts::new(length).expect("should admit a representable object");
            let mut cursor = 0;
            let mut count = 0;
            for part in parts.iter() {
                count += 1;
                assert_eq!(part.number, count);
                assert_eq!(part.offset, cursor);
                assert!(part.length > 0 && part.length <= Parts::MAX_PART_BYTES);
                cursor += part.length;
                if cursor < length {
                    assert!(part.length >= Parts::MIN_PART_BYTES);
                }
            }
            assert_eq!(cursor, length);
            assert!(
                u64::try_from(count).expect("should count nonnegative parts") <= Parts::MAX_PARTS
            );
        }
    }

    /// Distinct intervals include a short final part and bytes beyond the planned source length.
    #[tokio::test]
    async fn read_file_intervals() {
        let directory = TemporaryDirectory::new();
        let source = directory.path().join("parts.bin");
        let first_length =
            usize::try_from(Parts::MIN_PART_BYTES).expect("should fit a minimum part in memory");
        let mut bytes = vec![b'a'; first_length];
        bytes.extend_from_slice(b"z!");
        fs::write(&source, &bytes).expect("should write the source file");
        let parts = Parts::new(Parts::MIN_PART_BYTES + 1)
            .expect("should partition a full part and one byte");

        let mut readers = Vec::new();
        for part in parts.iter() {
            readers.push(part.read(&source).await.expect("should open a part reader"));
        }
        assert_eq!(
            readers.len(),
            2,
            "should open exactly the planned intervals"
        );
        let second = readers.pop().expect("should retain the final reader");
        let first = readers.pop().expect("should retain the first reader");
        assert_eq!(
            second
                .collect()
                .await
                .expect("should read the final interval")
                .into_bytes()
                .as_ref(),
            b"z",
            "should start at the final offset and stop before the suffix"
        );
        assert_eq!(
            first
                .collect()
                .await
                .expect("should read the first interval")
                .into_bytes()
                .as_ref(),
            &bytes[..first_length],
            "should read the first interval independently of the final reader"
        );
    }

    #[test]
    fn copy_range_final_byte() {
        let parts = Parts::new(Parts::MIN_PART_BYTES + 1)
            .expect("should partition a full part and one byte");
        let ranges: Vec<_> = parts.iter().map(|part| part.copy_range()).collect();
        assert_eq!(
            ranges,
            ["bytes=0-5242879", "bytes=5242880-5242880"],
            "should express both intervals with inclusive endpoints"
        );
    }

    #[test]
    fn complete_part_metadata() {
        let parts = Parts::new(Parts::MIN_PART_BYTES + 1)
            .expect("should partition a full part and one byte");
        let completed: Vec<_> = parts
            .iter()
            .zip([("first-etag", "AQIDBA=="), ("second-etag", "BQYHCA==")])
            .map(|(part, (etag, checksum))| {
                part.complete(Some(etag.to_owned()), Some(checksum.to_owned()))
                    .expect("should accept complete part metadata")
            })
            .collect();
        assert_eq!(completed.len(), 2, "should retain both completed parts");
        for (part, number, etag, checksum) in [
            (&completed[0], 1, "first-etag", "AQIDBA=="),
            (&completed[1], 2, "second-etag", "BQYHCA=="),
        ] {
            assert_eq!(
                part.part_number(),
                Some(number),
                "should retain the part number"
            );
            assert_eq!(part.e_tag(), Some(etag), "should retain the part's ETag");
            assert_eq!(
                part.checksum_crc32(),
                Some(checksum),
                "should retain the returned checksum"
            );
        }
    }

    #[test]
    fn complete_missing_metadata() {
        for (etag, checksum, missing_etag) in [
            (None, None, true),
            (None, Some("AQIDBA=="), true),
            (Some("etag"), None, false),
        ] {
            let part = Parts::new(1)
                .expect("should represent one byte")
                .iter()
                .next()
                .expect("should contain one part");
            let error = part
                .complete(etag.map(str::to_owned), checksum.map(str::to_owned))
                .expect_err("should require both metadata fields");
            if missing_etag {
                core::assert_matches!(error, StorageError::MissingEntityTag);
            } else {
                core::assert_matches!(error, StorageError::MissingChecksum);
            }
        }
    }

    #[test]
    fn parts_oversized() {
        let length = Parts::MAX_PART_BYTES * Parts::MAX_PARTS + 1;
        core::assert_matches!(Parts::new(length).err(), Some(StorageError::ObjectTooLarge { length: actual }) if actual == length);
        core::assert_matches!(
            Parts::new(u64::MAX).err(),
            Some(StorageError::ObjectTooLarge { .. })
        );
    }
}
