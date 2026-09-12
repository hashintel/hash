//! S3 object transfers using a configured SDK client.
//!
//! Typed paths preserve literal object keys through request construction. Request failures retain
//! their SDK variants and service responses for conditional-publication decisions.

use core::{mem, pin::pin};

use aws_sdk_s3::{
    Client,
    config::{self, retry::RetryConfig},
    operation::{
        delete_objects::DeleteObjectsOutput, get_object::GetObjectOutput,
        head_object::HeadObjectOutput, list_objects_v2::ListObjectsV2Output,
        put_object::PutObjectOutput,
    },
    primitives::{ByteStream, Length},
    types::{Delete, ObjectIdentifier},
};
use bytes::Bytes;
use camino::Utf8Path;
use futures::{Stream, TryStreamExt as _, stream};
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
#[cfg(feature = "test-utils")]
pub(crate) mod test_utils;
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
    /// Replaces the destination only when its [`ETag`] matches this opaque token.
    Match(&'etag str),
}

impl WriteCondition<'_> {
    /// Returns the `If-Match` value this condition requires of the destination.
    const fn if_match(&self) -> Option<&str> {
        match self {
            Self::Match(etag) => Some(etag),
            Self::Any | Self::Absent => None,
        }
    }

    /// Returns the `If-None-Match` value this condition requires of the destination.
    const fn if_none_match(&self) -> Option<&'static str> {
        match self {
            Self::Absent => Some("*"),
            Self::Any | Self::Match(_) => None,
        }
    }
}

/// Access to storage locations implementing the S3 protocol.
#[derive(Debug)]
pub(crate) struct S3 {
    client: Client,
}

impl S3 {
    /// The maximum object count accepted by one S3 deletion request.
    const DELETE_BATCH_SIZE: usize = 1000;
    /// The largest object sent by one upload or copy request.
    const SINGLE_REQUEST_BYTES: u64 = 5 * 1024 * 1024 * 1024;

    /// Adopts a configured SDK client.
    pub(crate) const fn new(client: Client) -> Self {
        Self { client }
    }

    /// Returns a per-request override that makes exactly one attempt.
    fn single_attempt() -> config::Builder {
        // retrying a committed conditional write after losing its response can report a false
        // conflict. A lost multipart-creation response hides that upload's identifier. Retrying
        // creation can start another upload without recovering the first identifier.
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

    /// Lists every object under the path's key, treated as a directory prefix.
    ///
    /// A slash delimits the prefix: `a/b` includes `a/b/c` and never the sibling key `a/bc`. Pages
    /// include nested objects.
    ///
    /// # Errors
    ///
    /// The stream yields [`StorageError`] if a listing request fails.
    fn list(
        &self,
        path: &BucketPath,
    ) -> impl Stream<Item = Result<ListObjectsV2Output, StorageError>> {
        let mut prefix = path.key().to_owned();
        if !prefix.ends_with('/') {
            prefix.push('/');
        }

        let paginator = self
            .client
            .list_objects_v2()
            .bucket(path.bucket())
            .prefix(prefix)
            .into_paginator()
            .send();

        stream::unfold(paginator, async move |mut paginator| {
            let next = paginator.next().await;
            next.map(|next| (next.map_err(From::from), paginator))
        })
    }

    /// Checks the per-object outcomes of a completed deletion request.
    ///
    /// # Errors
    ///
    /// Returns [`StorageError::DeleteRefused`] with every reported refusal, including failures in
    /// an otherwise successful response.
    fn reject_refusals(output: DeleteObjectsOutput) -> Result<(), StorageError> {
        let failures = output.errors.unwrap_or_default();

        if failures.is_empty() {
            Ok(())
        } else {
            Err(StorageError::DeleteRefused { failures })
        }
    }

    /// Deletes the named objects from one bucket in a single request.
    ///
    /// `objects` must hold at least one and at most [`Self::DELETE_BATCH_SIZE`] identifiers.
    ///
    /// # Errors
    ///
    /// Returns [`StorageError`] if request construction fails or S3 refuses the request or any
    /// individual object.
    async fn delete(
        &self,
        bucket: &str,
        objects: Vec<ObjectIdentifier>,
    ) -> Result<(), StorageError> {
        let delete = Delete::builder().set_objects(Some(objects)).build()?;

        let output = self
            .client
            .delete_objects()
            .bucket(bucket)
            .delete(delete)
            .send()
            .await?;

        Self::reject_refusals(output)
    }

    /// Deletes the single object the path names.
    ///
    /// # Errors
    ///
    /// Returns [`StorageError`] if building the identifier fails, the request fails or the
    /// response refuses the object.
    pub(crate) async fn remove(&self, path: &BucketPath) -> Result<(), StorageError> {
        self.delete(
            path.bucket(),
            vec![ObjectIdentifier::builder().key(path.key()).build()?],
        )
        .await
    }

    /// Deletes every object under the path's key, treated as a directory prefix.
    ///
    /// Holds one listing page and one deletion batch at a time. A prefix with no objects succeeds
    /// without a delete request. The first failing batch stops removal, preserving earlier
    /// deletions.
    ///
    /// # Errors
    ///
    /// Returns [`StorageError`] if listing fails, building an identifier fails, a delete request
    /// fails or a response refuses any object.
    pub(crate) async fn remove_dir_all(&self, path: &BucketPath) -> Result<(), StorageError> {
        let remaining = self
            .list(path)
            .map_ok(|output| {
                stream::iter(
                    output
                        .contents
                        .into_flat_iter()
                        .filter_map(|object| object.key)
                        .map(|key| {
                            ObjectIdentifier::builder()
                                .key(key)
                                .build()
                                .map_err(StorageError::from)
                        }),
                )
            })
            .try_flatten()
            .try_fold(Vec::new(), async |mut acc, object| {
                acc.push(object);

                if acc.len() == Self::DELETE_BATCH_SIZE {
                    self.delete(path.bucket(), mem::take(&mut acc)).await?;
                }

                Ok(acc)
            })
            .await?;

        if !remaining.is_empty() {
            self.delete(path.bucket(), remaining).await?;
        }

        Ok(())
    }

    /// Writes the object from an assembled body stream in one request attempt.
    ///
    /// # Errors
    ///
    /// Returns [`StorageError::Request`] if the write fails.
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

        // `tokio::io::copy` does an implicit flush
        tokio::io::copy(&mut body, &mut output).await?;
        Ok(())
    }
}
