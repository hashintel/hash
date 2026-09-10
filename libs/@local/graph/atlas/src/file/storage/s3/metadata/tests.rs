use core::assert_matches;

use aws_sdk_s3::operation::head_object::HeadObjectOutput;

use super::Metadata;
use crate::file::storage::{error::StorageError, s3::metadata::ETag};

#[test]
fn metadata_invalid_length() {
    for length in [None, Some(-1)] {
        let output = HeadObjectOutput::builder()
            .set_content_length(length)
            .e_tag("observed")
            .build();

        assert_matches!(
            Metadata::try_from(output),
            Err(StorageError::InvalidContentLength)
        );
    }
}

#[test]
fn metadata_missing_etag() {
    let output = HeadObjectOutput::builder().content_length(11).build();
    assert_matches!(
        Metadata::try_from(output),
        Err(StorageError::MissingEntityTag)
    );
}

#[test]
fn metadata_observed_values() {
    for length in [0, 11, i64::MAX] {
        let output = HeadObjectOutput::builder()
            .content_length(length)
            .e_tag("\"opaque-token\"")
            .build();

        let metadata = Metadata::try_from(output).expect("should retain valid source metadata");
        assert_eq!(
            metadata.length,
            u64::try_from(length).expect("should fit the nonnegative length")
        );
        assert_eq!(
            metadata.etag,
            ETag::new("\"opaque-token\"".to_owned()),
            "should preserve the opaque source token"
        );
    }
}
