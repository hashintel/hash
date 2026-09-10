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

mod miri {
    use zerocopy::FromZeros as _;

    use super::S3Path;

    #[test]
    fn clone_tail() {
        for length in [1, 7, 8, 9, 255, 256] {
            let bucket = "b".repeat(length);
            let key = format!("{}%2F/../🎈", "k".repeat(length));
            let spelling = format!("s3://{bucket}/{key}");
            let source: Box<S3Path> = spelling.parse().expect("should parse the source");
            let cloned = source.clone();
            assert_ne!(source.as_ref().path.as_ptr(), cloned.as_ref().path.as_ptr());
            drop(source);
            assert_eq!(cloned.bucket(), bucket);
            assert_eq!(cloned.key(), key);
            assert_eq!(cloned.to_string(), spelling);
        }
    }

    #[test]
    fn clone_empty_tail() {
        let source = S3Path::new_box_zeroed_with_elems(0).expect("should allocate an empty tail");
        let cloned = source.clone();
        drop(source);
        assert_eq!(cloned.separator.get(), 0);
        assert_eq!(&cloned.path, "");
    }
}
