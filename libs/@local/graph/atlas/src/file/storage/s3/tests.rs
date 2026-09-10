use core::{assert_matches, pin::pin, time::Duration};
use std::io;

use aws_sdk_s3::error::SdkError;
use axum::http::Method;
use bytes::Bytes;
use tokio::{io::AsyncReadExt as _, sync::oneshot, time::timeout};

use super::{S3, WriteCondition, path::S3Path};
use crate::file::storage::{error::StorageError, tests as fixtures};

#[tokio::test]
async fn get_etag() {
    let server = fixtures::LoopbackServer::start(fixtures::ok_response(
        b"object bytes",
        Some("\"fixture-etag\""),
    ))
    .await;
    let backend = S3::new(fixtures::client(&server.endpoint_url(), 1));
    let path: Box<S3Path> = "s3://bucket/key".parse().expect("should parse an S3 path");
    let response = backend.get(&path).await.expect("should open the object");
    assert_eq!(server.finish().await.len(), 1);
    assert_eq!(response.e_tag(), Some("\"fixture-etag\""));
}

#[tokio::test]
async fn read_body() {
    let server =
        fixtures::LoopbackServer::start(fixtures::ok_response(b"object bytes", None)).await;
    let reader = {
        let backend = S3::new(fixtures::client(&server.endpoint_url(), 1));
        let path: Box<S3Path> = "s3://bucket/key".parse().expect("should parse an S3 path");
        backend.read(&path).await.expect("should open the object")
    };
    let mut reader = pin!(reader);
    let mut bytes = Vec::new();
    reader
        .read_to_end(&mut bytes)
        .await
        .expect("should read the object");
    assert_eq!(server.finish().await.len(), 1);
    assert_eq!(bytes, b"object bytes");
}

#[tokio::test]
async fn read_incremental() {
    timeout(Duration::from_secs(5), async {
        let response = fixtures::ok_response(b"firstsecond", None);
        let offset = response.len() - b"second".len();
        let (resume, observed) = oneshot::channel();
        let server =
            fixtures::LoopbackServer::start_paused(response, Some((offset, observed))).await;
        let backend = S3::new(fixtures::client(&server.endpoint_url(), 1));
        let path: Box<S3Path> = "s3://bucket/key".parse().expect("should parse an S3 path");
        let mut reader = pin!(
            backend
                .read(&path)
                .await
                .expect("should open before the body completes")
        );
        let mut first = [0; 5];
        reader
            .read_exact(&mut first)
            .await
            .expect("should read the initial bytes");
        assert_eq!(&first, b"first");
        resume
            .send(())
            .expect("should release the remaining response");
        let mut remainder = Vec::new();
        reader
            .read_to_end(&mut remainder)
            .await
            .expect("should read the remaining bytes");
        assert_eq!(remainder, b"second");
        assert_eq!(server.finish().await.len(), 1);
    })
    .await
    .expect("should open and read without buffering the complete object");
}

#[tokio::test]
async fn read_truncated() {
    let server =
        fixtures::LoopbackServer::start(fixtures::short_body_response(1000, b"short")).await;
    let backend = S3::new(fixtures::client(&server.endpoint_url(), 1));
    let path: Box<S3Path> = "s3://bucket/key".parse().expect("should parse an S3 path");
    let mut reader = pin!(
        backend
            .read(&path)
            .await
            .expect("should open before the body fails")
    );
    let mut bytes = Vec::new();
    reader
        .read_to_end(&mut bytes)
        .await
        .expect_err("should report truncation while reading");
    assert_eq!(bytes, b"short");
    assert_eq!(server.finish().await.len(), 1);
}

#[tokio::test]
async fn download_body() {
    let server =
        fixtures::LoopbackServer::start(fixtures::ok_response(b"downloaded bytes", None)).await;
    let backend = S3::new(fixtures::client(&server.endpoint_url(), 1));
    let path: Box<S3Path> = "s3://bucket/key".parse().expect("should parse an S3 path");
    let mut writer = pin!(fixtures::TestWriter::new(None));
    backend
        .download(&path, &mut writer)
        .await
        .expect("should download the object");
    assert_eq!(server.finish().await.len(), 1);
    assert_eq!(writer.bytes, b"downloaded bytes");
    assert_eq!(writer.flushes, 1);
}

#[tokio::test]
async fn download_incremental() {
    timeout(Duration::from_secs(5), async {
        let response = fixtures::ok_response(b"firstsecond", None);
        let offset = response.len() - b"second".len();
        let (resume, observed) = oneshot::channel();
        let server =
            fixtures::LoopbackServer::start_paused(response, Some((offset, observed))).await;
        let backend = S3::new(fixtures::client(&server.endpoint_url(), 1));
        let path: Box<S3Path> = "s3://bucket/key".parse().expect("should parse an S3 path");
        let (writer, mut reader) = tokio::io::duplex(32);
        let receive = async move {
            let mut first = [0; 5];
            reader
                .read_exact(&mut first)
                .await
                .expect("should receive the initial bytes");
            assert_eq!(&first, b"first");
            resume
                .send(())
                .expect("should release the remaining response");
            let mut remainder = Vec::new();
            reader
                .read_to_end(&mut remainder)
                .await
                .expect("should receive the remaining bytes");
            remainder
        };
        let (downloaded, remainder) = tokio::join!(backend.download(&path, writer), receive);
        downloaded.expect("should stream the object before receiving its final bytes");
        assert_eq!(remainder, b"second");
        assert_eq!(server.finish().await.len(), 1);
    })
    .await
    .expect("should transfer the initial bytes without buffering the complete object");
}

#[tokio::test]
async fn get_missing_object() {
    let server = fixtures::LoopbackServer::start(fixtures::error_response(
        "HTTP/1.1 404 Not Found",
        "NoSuchKey",
    ))
    .await;
    let backend = S3::new(fixtures::client(&server.endpoint_url(), 1));
    let path: Box<S3Path> = "s3://bucket/missing-key"
        .parse()
        .expect("should parse an S3 path");
    let error = backend
        .get(&path)
        .await
        .expect_err("should report the missing object");
    assert_eq!(server.finish().await.len(), 1);
    let StorageError::Request(request) = error else {
        panic!("should retain the SDK request error: {error:?}");
    };
    assert_matches!(
        request.as_service_error(),
        Some(aws_sdk_s3::Error::NoSuchKey(_))
    );
}

#[tokio::test]
async fn get_no_response() {
    let server = fixtures::LoopbackServer::start(Vec::new()).await;
    let backend = S3::new(fixtures::client(&server.endpoint_url(), 1));
    let path: Box<S3Path> = "s3://bucket/key".parse().expect("should parse an S3 path");
    let error = backend
        .get(&path)
        .await
        .expect_err("should report the closed connection");
    assert_eq!(server.finish().await.len(), 1);
    let StorageError::Request(request) = error else {
        panic!("should retain the SDK request error: {error:?}");
    };
    assert_matches!(request.as_ref(), SdkError::DispatchFailure(_));
}

#[tokio::test]
async fn get_literal_key() {
    let server = fixtures::LoopbackServer::start(fixtures::ok_response(b"body", None)).await;
    let backend = S3::new(fixtures::client(&server.endpoint_url(), 1));
    let path: Box<S3Path> = "s3://bucket-name/a b%2fc.txt"
        .parse()
        .expect("should parse a literal key");
    backend.get(&path).await.expect("should open the object");
    let requests = server.finish().await;
    assert_eq!(requests.len(), 1);
    assert_eq!(requests[0].method(), Method::GET);
    assert_eq!(
        requests[0].uri().to_string(),
        "/bucket-name/a%20b%252fc.txt?x-id=GetObject"
    );
}

#[tokio::test]
async fn download_write_failure() {
    let server =
        fixtures::LoopbackServer::start(fixtures::ok_response(b"object bytes", None)).await;
    let backend = S3::new(fixtures::client(&server.endpoint_url(), 1));
    let path: Box<S3Path> = "s3://bucket/key".parse().expect("should parse an S3 path");
    let error = backend
        .download(
            &path,
            fixtures::TestWriter::new(Some(fixtures::FailureMode::Write)),
        )
        .await
        .expect_err("should propagate the writer failure");
    assert_eq!(server.finish().await.len(), 1);
    assert_matches!(error, StorageError::Io(error) if error.kind() == io::ErrorKind::BrokenPipe);
}

#[tokio::test]
async fn download_flush_failure() {
    let server =
        fixtures::LoopbackServer::start(fixtures::ok_response(b"object bytes", None)).await;
    let backend = S3::new(fixtures::client(&server.endpoint_url(), 1));
    let path: Box<S3Path> = "s3://bucket/key".parse().expect("should parse an S3 path");
    let error = backend
        .download(
            &path,
            fixtures::TestWriter::new(Some(fixtures::FailureMode::Flush)),
        )
        .await
        .expect_err("should propagate the flush failure");
    assert_eq!(server.finish().await.len(), 1);
    assert_matches!(error, StorageError::Io(error) if error.to_string() == "test flush failure");
}

#[tokio::test]
async fn put_preconditions() {
    for (condition, expected_match, expected_absent) in [
        (WriteCondition::Any, None, None),
        (WriteCondition::Absent, None, Some("*")),
        (
            WriteCondition::Match("\"opaque-token\""),
            Some("\"opaque-token\""),
            None,
        ),
    ] {
        let server =
            fixtures::LoopbackServer::start(fixtures::ok_response(b"", Some("\"written\""))).await;
        let backend = S3::new(fixtures::client(&server.endpoint_url(), 1));
        let path: Box<S3Path> = "s3://bucket/current"
            .parse()
            .expect("should parse the pointer path");
        let output = backend
            .put(&path, Bytes::from_static(b"generation"), condition)
            .await
            .expect("should write the object under its precondition");
        assert_eq!(output.e_tag(), Some("\"written\""));
        let requests = server.finish().await;
        assert_eq!(requests.len(), 1);
        let request = &requests[0];
        assert_eq!(request.method(), Method::PUT);
        assert_eq!(request.uri().path(), "/bucket/current");
        assert_eq!(request.body(), b"generation");
        assert_eq!(
            request
                .headers()
                .get("if-match")
                .map(|value| value.to_str().expect("should have an ASCII ETag")),
            expected_match
        );
        assert_eq!(
            request
                .headers()
                .get("if-none-match")
                .map(|value| value.to_str().expect("should have an ASCII precondition")),
            expected_absent
        );
    }
}

#[tokio::test]
async fn put_single_attempt() {
    let server = fixtures::LoopbackServer::start(fixtures::error_response(
        "HTTP/1.1 503 Service Unavailable",
        "SlowDown",
    ))
    .await;
    let backend = S3::new(fixtures::client(&server.endpoint_url(), 3));
    let path: Box<S3Path> = "s3://bucket/current"
        .parse()
        .expect("should parse the pointer path");
    let error = backend
        .put(
            &path,
            Bytes::from_static(b"generation"),
            WriteCondition::Absent,
        )
        .await
        .expect_err("should return the service failure without retrying");
    let StorageError::Request(request) = error else {
        panic!("should retain the SDK request error: {error:?}");
    };
    assert_matches!(request.as_ref(), SdkError::ServiceError(_));
    assert_eq!(server.finish().await.len(), 1);
}
