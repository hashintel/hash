use crate::SecretValue;

/// An S3 bucket and the credentials to reach it.
#[derive(Debug)]
pub struct S3Bucket {
    /// The bucket and prefix artifacts are stored under, as `s3://bucket/prefix`.
    pub uri: Box<str>,
    pub region: Box<str>,
    /// An S3-compatible endpoint such as MinIO, addressed with path-style URLs.
    pub endpoint: Option<Box<str>>,
    pub use_ssl: bool,
    pub key_id: Box<str>,
    pub secret: SecretValue,
}
