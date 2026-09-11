use core::assert_matches;

use super::BucketPath;
use crate::file::storage::path::error::{FilePathError, PathComponent};

/// A spelling that stops after the bucket reports a missing key rather than an empty one.
#[test]
fn parse_bucket_only() {
    assert_matches!(
        "s3://bucket-only".parse::<Box<BucketPath>>(),
        Err(FilePathError::MissingKey)
    );
}

/// A slash straight after the prefix names the bucket as the empty component.
#[test]
fn parse_empty_bucket() {
    assert_matches!(
        "s3:///key".parse::<Box<BucketPath>>(),
        Err(FilePathError::Empty {
            component: PathComponent::Bucket
        })
    );
}

/// A trailing slash names the key as the empty component.
#[test]
fn parse_empty_key() {
    assert_matches!(
        "s3://bucket/".parse::<Box<BucketPath>>(),
        Err(FilePathError::Empty {
            component: PathComponent::Key
        })
    );
}

/// Another scheme fails here, where a `FilePath` falls back to a local path.
#[test]
fn parse_foreign_scheme() {
    assert_matches!(
        "https://bucket/key".parse::<Box<BucketPath>>(),
        Err(FilePathError::Scheme)
    );
}

/// Multibyte text on both sides of the separator survives the byte offset.
#[test]
#[expect(
    clippy::non_ascii_literal,
    reason = "the case exercises multibyte text on both sides of the separator"
)]
fn parse_unicode() {
    let path: Box<BucketPath> = "s3://büçket-ñame/käy-🎈.txt"
        .parse()
        .expect("should preserve Unicode text");
    assert_eq!(path.bucket(), "büçket-ñame");
    assert_eq!(path.key(), "käy-🎈.txt");
}

/// Percent escapes and `..` segments in a key stay as the caller wrote them.
#[test]
fn parse_literal_key() {
    let path: Box<BucketPath> = "s3://bucket/a%2Fb/c%20d/../e"
        .parse()
        .expect("should preserve the literal key");
    assert_eq!(path.bucket(), "bucket");
    assert_eq!(path.key(), "a%2Fb/c%20d/../e");
}

/// The copy-source rendering escapes reserved bytes, keeps unreserved ones, and re-escapes a `%`.
#[test]
fn copy_source_literal_key() {
    let path: Box<BucketPath> = "s3://bucket/a b%2fc.txt?mark#tag/../~_-"
        .parse()
        .expect("should parse a literal object key");
    assert_eq!(
        path.copy_source().to_string(),
        "bucket/a%20b%252fc.txt%3Fmark%23tag/../~_-",
        "should encode reserved bytes and preserve literal path components"
    );
}

/// The copy-source rendering encodes a multibyte character one byte at a time.
#[test]
fn copy_source_utf8() {
    let path: Box<BucketPath> = "s3://bucket/\u{e4}/\u{1f388}"
        .parse()
        .expect("should parse a UTF-8 object key");
    assert_eq!(
        path.copy_source().to_string(),
        "bucket/%C3%A4/%F0%9F%8E%88",
        "should percent-encode every byte of a multibyte character"
    );
}

/// The printed spelling carries the `s3://` prefix that `AsRef<str>` omits.
#[test]
fn display_scheme() {
    let path: Box<BucketPath> = "s3://bucket/key".parse().expect("should parse an S3 path");
    assert_eq!(path.to_string(), "s3://bucket/key");
}

/// Clones over varied tail lengths and over the empty tail.
mod miri {
    use zerocopy::FromZeros as _;

    use super::BucketPath;

    /// A clone owns fresh text and keeps the bucket, the key and the spelling.
    #[test]
    fn clone_tail() {
        for length in [1, 7, 8, 9, 255, 256] {
            let bucket = "b".repeat(length);
            let key = format!("{}%2F/../🎈", "k".repeat(length));
            let spelling = format!("s3://{bucket}/{key}");
            let source: Box<BucketPath> = spelling.parse().expect("should parse the source");
            let cloned = source.clone();
            assert_ne!(source.as_ref().path.as_ptr(), cloned.as_ref().path.as_ptr());
            drop(source);
            assert_eq!(cloned.bucket(), bucket);
            assert_eq!(cloned.key(), key);
            assert_eq!(cloned.to_string(), spelling);
        }
    }

    /// A zero-length tail clones without reading past its own bytes.
    #[test]
    fn clone_empty_tail() {
        let source =
            BucketPath::new_box_zeroed_with_elems(0).expect("should allocate an empty tail");
        let cloned = source.clone();
        drop(source);
        assert_eq!(cloned.separator.get(), 0);
        assert_eq!(&cloned.path, "");
    }
}
