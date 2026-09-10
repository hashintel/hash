//! S3 object transfers using a configured SDK client.
//!
//! Typed paths preserve literal object keys through request construction. Request failures retain
//! their SDK variants and service responses for conditional-publication decisions.

use core::pin::pin;

use aws_sdk_s3::{
    Client,
    config::{self, retry::RetryConfig},
    operation::{
        get_object::GetObjectOutput, head_object::HeadObjectOutput, put_object::PutObjectOutput,
    },
    primitives::{ByteStream, Length},
};
use bytes::Bytes;
use camino::Utf8Path;
use tokio::{
    fs,
    io::{AsyncBufRead, AsyncWrite},
};

use self::{
    metadata::Metadata,
    multipart::{
        Multipart,
        backend::{Remote, Source},
    },
    path::BucketPath,
};
use super::error::StorageError;

mod metadata;
mod multipart;
pub(crate) mod path;
#[cfg(test)]
mod tests;

pub(crate) use self::metadata::ETag;

/// A precondition on the destination of an object write.
#[derive(Debug)]
pub(crate) enum WriteCondition<'etag> {
    /// Replaces the destination regardless of its current value.
    Any,
    /// Creates the destination only when it does not exist.
    Absent,
    /// Replaces the destination only when its `ETag` matches this opaque token.
    Match(&'etag str),
}

impl WriteCondition<'_> {
    const fn if_match(&self) -> Option<&str> {
        match self {
            Self::Match(etag) => Some(etag),
            Self::Any | Self::Absent => None,
        }
    }

    const fn if_none_match(&self) -> Option<&'static str> {
        match self {
            Self::Absent => Some("*"),
            Self::Any | Self::Match(_) => None,
        }
    }
}

pub(crate) struct S3 {
    client: Client,
}

impl S3 {
    // The single-request object operations permit up to 5 GiB. Larger objects use multipart.
    const SINGLE_REQUEST_BYTES: u64 = 5 * 1024 * 1024 * 1024;

    pub(crate) const fn new(client: Client) -> Self {
        Self { client }
    }

    fn single_attempt() -> config::Builder {
        // Retrying a committed conditional write after losing its response can report a false
        // conflict.
        config::Builder::new().retry_config(RetryConfig::standard().with_max_attempts(1))
    }

    /// Opens the object body together with its response metadata.
    ///
    /// # Errors
    ///
    /// Returns [`StorageError::Request`] if the request fails.
    async fn get(&self, path: &BucketPath) -> Result<GetObjectOutput, StorageError> {
        self.client
            .get_object()
            .bucket(path.bucket())
            .key(path.key())
            .send()
            .await
            .map_err(From::from)
    }

    /// Reads object metadata without downloading its body.
    ///
    /// # Errors
    ///
    /// Returns [`StorageError::Request`] if the request fails.
    pub(crate) async fn head(&self, path: &BucketPath) -> Result<HeadObjectOutput, StorageError> {
        self.client
            .head_object()
            .bucket(path.bucket())
            .key(path.key())
            .send()
            .await
            .map_err(From::from)
    }

    /// Opens an object for incremental reading.
    ///
    /// The returned reader reports body failures.
    ///
    /// # Errors
    ///
    /// Returns [`StorageError`] if the request fails.
    pub(crate) async fn read(
        &self,
        path: &BucketPath,
    ) -> Result<(Option<ETag>, impl AsyncBufRead + use<>), StorageError> {
        let output = self.get(path).await?;
        Ok((output.e_tag.map(ETag::new), output.body.into_async_read()))
    }

    async fn put_body(
        &self,
        path: &BucketPath,
        body: ByteStream,
        condition: WriteCondition<'_>,
    ) -> Result<PutObjectOutput, StorageError> {
        let request = self
            .client
            .put_object()
            .bucket(path.bucket())
            .key(path.key())
            .body(body)
            .set_if_match(condition.if_match().map(str::to_owned))
            .set_if_none_match(condition.if_none_match().map(str::to_owned));

        request
            .customize()
            .config_override(Self::single_attempt())
            .send()
            .await
            .map_err(From::from)
    }

    /// Writes an object in one request attempt under `condition`.
    ///
    /// # Errors
    ///
    /// Returns [`StorageError::Request`] if the write fails. A transport failure can leave the
    /// write's outcome unknown.
    pub(crate) async fn put(
        &self,
        path: &BucketPath,
        body: Bytes,
        condition: WriteCondition<'_>,
    ) -> Result<PutObjectOutput, StorageError> {
        self.put_body(path, body.into(), condition).await
    }

    /// Streams a local file under a destination precondition.
    ///
    /// The source must remain unchanged until the operation completes. Multipart transfer retains
    /// one part reader at a time. The error path attempts to abort an initialized multipart upload
    /// before returning the transfer error.
    ///
    /// # Errors
    ///
    /// Returns [`StorageError`] for file access, multipart bounds or an S3 failure. A failed
    /// completion response can leave the write's outcome unknown.
    pub(crate) async fn upload(
        &self,
        destination: &BucketPath,
        source: impl AsRef<Utf8Path>,
        condition: WriteCondition<'_>,
    ) -> Result<(), StorageError> {
        let length = fs::metadata(source.as_ref()).await?.len();

        if length > Self::SINGLE_REQUEST_BYTES {
            return Multipart::new(
                Remote {
                    backend: self,
                    destination,
                    source: Source::File(source.as_ref()),
                    condition,
                },
                length,
            )?
            .transfer()
            .await;
        }

        let body = ByteStream::read_from()
            .path(source.as_ref())
            .length(Length::Exact(length))
            .build()
            .await?;

        self.put_body(destination, body, condition).await?;
        Ok(())
    }

    /// Copies the observed source object under a destination precondition.
    ///
    /// Every copy request requires the entity tag read before transfer. Multipart parts copy
    /// serially. The error path attempts to abort an initialized multipart upload before returning
    /// the transfer error.
    ///
    /// # Errors
    ///
    /// Returns [`StorageError`] for missing source metadata, multipart bounds or an S3 failure. A
    /// failed completion response can leave the write's outcome unknown.
    pub(crate) async fn copy(
        &self,
        source: &BucketPath,
        destination: &BucketPath,
        condition: WriteCondition<'_>,
    ) -> Result<(), StorageError> {
        let Metadata { length, etag } = Metadata::try_from(self.head(source).await?)?;
        let header = source.copy_source();

        if length > Self::SINGLE_REQUEST_BYTES {
            return Multipart::new(
                Remote {
                    backend: self,
                    destination,
                    source: Source::Copy { header, etag },
                    condition,
                },
                length,
            )?
            .transfer()
            .await;
        }

        let request = self
            .client
            .copy_object()
            .bucket(destination.bucket())
            .key(destination.key())
            .copy_source(header.to_string())
            .copy_source_if_match(etag)
            .set_if_match(condition.if_match().map(str::to_owned))
            .set_if_none_match(condition.if_none_match().map(str::to_owned));

        request
            .customize()
            .config_override(Self::single_attempt())
            .send()
            .await
            .map(|_| ())
            .map_err(From::from)
    }

    /// Streams the complete object into `output` and flushes the writer.
    ///
    /// # Errors
    ///
    /// Returns [`StorageError`] if the request, body read or destination write fails.
    pub(crate) async fn download(
        &self,
        path: &BucketPath,
        output: impl AsyncWrite,
    ) -> Result<(), StorageError> {
        let mut output = pin!(output);

        let response = self.get(path).await?;
        let mut body = response.body.into_async_read();

        tokio::io::copy(&mut body, &mut output).await?;
        Ok(())
    }
}
