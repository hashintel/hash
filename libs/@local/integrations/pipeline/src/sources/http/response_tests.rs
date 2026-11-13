use alloc::sync::Arc;
use core::{
    sync::atomic::{AtomicUsize, Ordering},
    time::Duration,
};

use axum::{
    Json, Router,
    http::{HeaderMap, StatusCode},
    response::IntoResponse as _,
    routing::get,
};
use reqwest::{Client, Url};
use rstest::rstest;
use serde_json::json;
use tokio::{
    io::{AsyncReadExt as _, AsyncWriteExt as _},
    net::TcpListener,
    time::Instant,
};

use super::fetch;
use crate::sources::{
    SourceError,
    tests::{public_client, server},
};

#[tokio::test]
async fn fetch_truncated_body() {
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .expect("should bind the transport fixture");
    let address = listener
        .local_addr()
        .expect("should read the fixture address");
    let response = tokio::spawn(async move {
        let (mut stream, _) = listener.accept().await.expect("should accept the request");
        let mut request = [0; 1024];
        let _read = stream
            .read(&mut request)
            .await
            .expect("should receive the request");
        // A valid status and incomplete Content-Length exercise body transport, not JSON parsing.
        stream
            .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 100\r\nConnection: close\r\n\r\n{")
            .await
            .expect("should send the incomplete body");
        stream.shutdown().await.expect("should close the response");
    });
    let client = Client::builder()
        .no_proxy()
        .resolve("public.test", address)
        .build()
        .expect("should build the fixture client");
    let url = Url::parse(&format!("http://public.test:{}", address.port()))
        .expect("should parse the fixture URL");
    let error = fetch(&client, &url, &HeaderMap::new())
        .await
        .expect_err("should fail an interrupted body read");
    assert!(
        matches!(error.current_context(), SourceError::Request),
        "should classify failed body transport for retry instead of invalid source data"
    );
    response.await.expect("should join the response fixture");
}

#[tokio::test]
async fn fetch_stops_at_retry_budget() {
    let requests = Arc::new(AtomicUsize::new(0));
    let counter = Arc::clone(&requests);
    let server = server(Router::new().route(
        "/",
        get(move || {
            counter.fetch_add(1, Ordering::Relaxed);
            async { (StatusCode::TOO_MANY_REQUESTS, [("retry-after", "0")]) }
        }),
    ))
    .await;
    let (client, url) = public_client(&server);
    let error = fetch(
        &client,
        &Url::parse(&url).expect("should parse the URL"),
        &HeaderMap::new(),
    )
    .await
    .expect_err("should stop after ten retries");
    assert!(matches!(
        error.current_context(),
        SourceError::Status { status: 429 }
    ));
    assert_eq!(requests.load(Ordering::Relaxed), 11);
}

#[rstest]
#[case::unavailable(StatusCode::SERVICE_UNAVAILABLE)]
#[case::unauthorized(StatusCode::UNAUTHORIZED)]
#[case::invalid_json(StatusCode::OK)]
#[tokio::test]
async fn fetch_does_not_retry_other_failures(#[case] status: StatusCode) {
    let requests = Arc::new(AtomicUsize::new(0));
    let counter = Arc::clone(&requests);
    let server = server(Router::new().route(
        "/",
        get(move || {
            counter.fetch_add(1, Ordering::Relaxed);
            async move { (status, [("retry-after", "0")], "invalid JSON") }
        }),
    ))
    .await;
    let (client, url) = public_client(&server);
    let error = fetch(
        &client,
        &Url::parse(&url).expect("should parse the URL"),
        &HeaderMap::new(),
    )
    .await
    .expect_err("should return the failure without retrying");
    if status == StatusCode::OK {
        assert!(matches!(error.current_context(), SourceError::Response));
    } else {
        assert!(
            matches!(error.current_context(), SourceError::Status { status: actual } if *actual == status.as_u16())
        );
    }
    assert_eq!(requests.load(Ordering::Relaxed), 1);
}

#[rstest]
#[case::immediate("0", Duration::ZERO)]
#[case::server_delay("1", Duration::from_secs(1))]
#[case::fallback("invalid", Duration::from_millis(500))]
#[tokio::test]
async fn fetch_throttled_response(
    #[case] retry_after: &'static str,
    #[case] minimum_delay: Duration,
) {
    let requests = Arc::new(AtomicUsize::new(0));
    let counter = Arc::clone(&requests);
    let server = server(Router::new().route(
        "/",
        get(move || {
            let counter = Arc::clone(&counter);
            async move {
                if counter.fetch_add(1, Ordering::Relaxed) == 0 {
                    (
                        StatusCode::TOO_MANY_REQUESTS,
                        [("retry-after", retry_after)],
                    )
                        .into_response()
                } else {
                    Json(json!({"items": [1]})).into_response()
                }
            }
        }),
    ))
    .await;
    let (client, url) = public_client(&server);
    let start = Instant::now();
    let value = fetch(
        &client,
        &Url::parse(&url).expect("should parse the URL"),
        &HeaderMap::new(),
    )
    .await
    .expect("should retry a throttled response");
    assert_eq!(
        value,
        json!({"items": [1]}),
        "should return the successful response"
    );
    assert_eq!(requests.load(Ordering::Relaxed), 2, "should retry once");
    assert!(
        start.elapsed() >= minimum_delay,
        "retry delay should be honored"
    );
}
