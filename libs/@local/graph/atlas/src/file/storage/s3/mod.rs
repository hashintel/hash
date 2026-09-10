//! S3 object transfers using a configured SDK client.
//!
//! Typed paths preserve literal object keys through request construction. Request failures retain
//! their SDK variants and service responses for conditional-publication decisions.

use core::pin::pin;

use aws_sdk_s3::{
    Client,
    config::{self, retry::RetryConfig},
    operation::{get_object::GetObjectOutput, put_object::PutObjectOutput},
};
use bytes::Bytes;
use tokio::io::{AsyncBufRead, AsyncWrite, AsyncWriteExt as _};

use self::path::S3Path;
use super::error::StorageError;

pub(crate) mod path;
#[cfg(test)]
mod tests;

/// A precondition on the destination of an object write.
pub(crate) enum WriteCondition<'etag> {
    /// Replaces the destination regardless of its current value.
    Any,
    /// Creates the destination only when it does not exist.
    Absent,
    /// Replaces the destination only when its `ETag` matches this opaque token.
    Match(&'etag str),
}

pub(crate) struct S3 {
    client: Client,
}

impl S3 {
    pub(crate) const fn new(client: Client) -> Self {
        Self { client }
    }

    /// Opens the object body together with its response metadata.
    ///
    /// # Errors
    ///
    /// Returns [`StorageError::Request`] if the request fails.
    pub(crate) async fn get(&self, path: &S3Path) -> Result<GetObjectOutput, StorageError> {
        Ok(self
            .client
            .get_object()
            .bucket(path.bucket())
            .key(path.key())
            .send()
            .await?)
    }

    /// Opens an object for incremental reading.
    ///
    /// Body failures are reported by the returned reader.
    ///
    /// # Errors
    ///
    /// Returns [`StorageError`] if the request fails.
    pub(crate) async fn read(
        &self,
        path: &S3Path,
    ) -> Result<impl AsyncBufRead + use<>, StorageError> {
        let output = self.get(path).await?;
        Ok(output.body.into_async_read())
    }

    /// Writes an object in one request attempt under `condition`.
    ///
    /// # Errors
    ///
    /// Returns [`StorageError::Request`] if the write fails. A transport failure can leave the
    /// write's outcome unknown.
    pub(crate) async fn put(
        &self,
        path: &S3Path,
        body: Bytes,
        condition: WriteCondition<'_>,
    ) -> Result<PutObjectOutput, StorageError> {
        let request = self
            .client
            .put_object()
            .bucket(path.bucket())
            .key(path.key())
            .body(body.into());

        let request = match condition {
            WriteCondition::Any => request,
            WriteCondition::Absent => request.if_none_match("*"),
            WriteCondition::Match(etag) => request.if_match(etag),
        };

        // A lost success response followed by a retry can produce a precondition failure. One
        // attempt preserves that unknown outcome rather than reporting a conflict from the retry.
        Ok(request
            .customize()
            .config_override(
                config::Builder::new().retry_config(RetryConfig::standard().with_max_attempts(1)),
            )
            .send()
            .await?)
    }

    /// Streams the complete object into `output` and flushes the writer.
    ///
    /// # Errors
    ///
    /// Returns [`StorageError`] if the request, body read or destination write fails.
    pub(crate) async fn download(
        &self,
        path: &S3Path,
        output: impl AsyncWrite,
    ) -> Result<(), StorageError> {
        let mut output = pin!(output);

        let response = self.get(path).await?;
        let mut body = response.body.into_async_read();

        tokio::io::copy(&mut body, &mut output).await?;
        output.flush().await?;
        Ok(())
    }
}
