use core::assert_matches;

use super::S3Path;
use crate::file::storage::path::error::{FilePathError, PathComponent};

#[test]
fn parse_bucket_only() {
    assert_matches!(
        "s3://bucket-only".parse::<Box<S3Path>>(),
        Err(FilePathError::MissingKey)
    );
}

#[test]
fn parse_empty_bucket() {
    assert_matches!(
        "s3:///key".parse::<Box<S3Path>>(),
        Err(FilePathError::Empty {
            component: PathComponent::Bucket
        })
    );
}

#[test]
fn parse_empty_key() {
    assert_matches!(
        "s3://bucket/".parse::<Box<S3Path>>(),
        Err(FilePathError::Empty {
            component: PathComponent::Key
        })
    );
}

#[test]
fn parse_foreign_scheme() {
    assert_matches!(
        "https://bucket/key".parse::<Box<S3Path>>(),
        Err(FilePathError::Scheme)
    );
}

#[test]
#[expect(
    clippy::non_ascii_literal,
    reason = "the case exercises multibyte text on both sides of the separator"
)]
fn parse_unicode() {
    let path: Box<S3Path> = "s3://büçket-ñame/käy-🎈.txt"
        .parse()
        .expect("should preserve Unicode text");
    assert_eq!(path.bucket(), "büçket-ñame");
    assert_eq!(path.key(), "käy-🎈.txt");
}

#[test]
fn parse_literal_key() {
    let path: Box<S3Path> = "s3://bucket/a%2Fb/c%20d/../e"
        .parse()
        .expect("should preserve the literal key");
    assert_eq!(path.bucket(), "bucket");
    assert_eq!(path.key(), "a%2Fb/c%20d/../e");
}

#[test]
fn display_scheme() {
    let path: Box<S3Path> = "s3://bucket/key".parse().expect("should parse an S3 path");
    assert_eq!(path.to_string(), "s3://bucket/key");
}
