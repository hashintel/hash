use alloc::sync::Arc;
use core::time::Duration;
use std::sync::Mutex;

use axum::{
    Router,
    extract::State,
    http::{HeaderMap, Method, StatusCode, Uri},
    routing::any,
};
use hash_crypto::Secret;
use hash_middleware::authentication::{
    request::ACTOR_ID_HEADER, service_secret::service_credential,
};
use reqwest::Url;
use rstest::rstest;
use serde_json::value::RawValue;
use similar_asserts::assert_eq;
use tokio::{
    io::{AsyncReadExt as _, AsyncWriteExt as _},
    net::TcpListener,
    time::Instant,
};
use type_system::principal::actor::ActorEntityUuid;
use uuid::Uuid;

use super::{GraphClient, GraphError, retry_after};
use crate::graph::{Graph as _, GraphResponse};

struct Server {
    url: String,
    task: tokio::task::JoinHandle<()>,
}

impl Server {
    fn url(&self) -> &str {
        &self.url
    }
}

impl Drop for Server {
    fn drop(&mut self) {
        self.task.abort();
    }
}

async fn server(router: Router) -> Server {
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .expect("should bind HTTP fixture");
    let url = format!(
        "http://{}",
        listener.local_addr().expect("should read fixture address")
    );
    let task = tokio::spawn(async move {
        axum::serve(listener, router)
            .await
            .expect("should serve HTTP fixture");
    });
    Server { url, task }
}

#[derive(Debug, PartialEq)]
struct Received {
    method: Method,
    path: String,
    actor: Option<String>,
    credential: Option<String>,
    body: String,
}

#[derive(Clone)]
struct Endpoint {
    status: StatusCode,
    retry_after: Option<&'static str>,
    received: Arc<Mutex<Vec<Received>>>,
}

impl Endpoint {
    fn new(status: StatusCode) -> Self {
        Self {
            status,
            retry_after: None,
            received: Arc::default(),
        }
    }

    async fn serve(&self, prefix: &str) -> Server {
        server(
            Router::new()
                .route(&format!("{prefix}/entities/bulk"), any(record))
                .with_state(self.clone()),
        )
        .await
    }

    fn received(&self) -> Vec<Received> {
        core::mem::take(&mut *self.received.lock().expect("should not poison requests"))
    }
}

async fn record(
    State(endpoint): State<Endpoint>,
    method: Method,
    uri: Uri,
    headers: HeaderMap,
    body: String,
) -> (StatusCode, HeaderMap, &'static str) {
    endpoint
        .received
        .lock()
        .expect("should not poison requests")
        .push(Received {
            method,
            path: uri.path().to_owned(),
            body,
            actor: headers
                .get(ACTOR_ID_HEADER)
                .and_then(|value| value.to_str().ok())
                .map(ToOwned::to_owned),
            credential: service_credential(&headers).map(ToOwned::to_owned),
        });
    let mut headers = HeaderMap::new();
    if let Some(wait) = endpoint.retry_after {
        headers.insert("retry-after", wait.parse().expect("should encode header"));
    }
    (endpoint.status, headers, "private response body")
}

fn actor() -> ActorEntityUuid {
    ActorEntityUuid::new(Uuid::from_u128(0xAC70))
}
fn client(url: &str) -> GraphClient {
    GraphClient::new(
        &Url::parse(url).expect("should parse URL"),
        Secret::from_string("service-secret".to_owned()),
    )
    .expect("should configure client")
}

#[rstest]
#[case(Method::POST, StatusCode::OK, GraphResponse::Applied)]
#[case(Method::PATCH, StatusCode::OK, GraphResponse::Applied)]
#[case(Method::POST, StatusCode::CONFLICT, GraphResponse::Status(409))]
#[case(Method::PATCH, StatusCode::NOT_FOUND, GraphResponse::Status(404))]
#[case(
    Method::POST,
    StatusCode::UNPROCESSABLE_ENTITY,
    GraphResponse::Status(422)
)]
#[case(Method::PATCH, StatusCode::LOCKED, GraphResponse::Status(423))]
#[tokio::test]
async fn exchange_preserves_bodies_and_headers(
    #[case] method: Method,
    #[case] status: StatusCode,
    #[case] expected: GraphResponse,
) {
    let endpoint = Endpoint::new(status);
    let server = endpoint.serve("/graph").await;
    let client = client(&format!("{}/graph/", server.url()));
    let first = RawValue::from_string("{ \"value\" : 9007199254740993 }".to_owned())
        .expect("should parse literal JSON");
    let second =
        RawValue::from_string("{\"value\":1.000}".to_owned()).expect("should parse literal JSON");
    let response = if method == Method::POST {
        client.create(actor(), &[&first, &second]).await
    } else {
        client.patch(actor(), &[&first]).await
    };
    assert_eq!(response, expected);
    assert_eq!(
        endpoint.received(),
        [Received {
            body: if method == Method::POST {
                "[{ \"value\" : 9007199254740993 },{\"value\":1.000}]".into()
            } else {
                "[{ \"value\" : 9007199254740993 }]".into()
            },
            method,
            path: "/graph/entities/bulk".into(),
            actor: Some(actor().to_string()),
            credential: Some("service-secret".into()),
        }]
    );
}

#[rstest]
#[case("ftp://graph.test", "secret")]
#[case("http://user:password@graph.test", "secret")]
#[case("http://graph.test", "")]
#[case("http://graph.test", "invalid\nsecret")]
fn configuration_invalid(#[case] url: &str, #[case] secret: &str) {
    let error = GraphClient::new(
        &Url::parse(url).expect("should parse URL"),
        Secret::from_string(secret.into()),
    )
    .expect_err("should reject configuration");
    assert_eq!(*error.current_context(), GraphError::Configuration);
    assert!(!format!("{error:?}").contains("invalid\nsecret"));
}

#[rstest]
#[case("7", Some(7))]
#[case("999999", Some(30))]
#[case("Wed, 21 Oct 2015 07:28:00 GMT", None)]
#[case("+7", None)]
#[case("-1", None)]
fn retry_after_forms(#[case] header: &str, #[case] seconds: Option<u64>) {
    let mut headers = HeaderMap::new();
    headers.insert("retry-after", header.parse().expect("should encode header"));
    assert_eq!(retry_after(&headers), seconds.map(Duration::from_secs));
}

#[tokio::test]
async fn retry_after_paces_next_request() {
    let mut endpoint = Endpoint::new(StatusCode::TOO_MANY_REQUESTS);
    endpoint.retry_after = Some("1");
    let server = endpoint.serve("").await;
    let client = client(server.url());
    let body = RawValue::from_string("{}".to_owned()).expect("should parse body");
    assert_eq!(
        client.create(actor(), &[&body]).await,
        GraphResponse::Status(429)
    );
    let started = Instant::now();
    assert_eq!(
        client.create(actor(), &[&body]).await,
        GraphResponse::Status(429)
    );
    assert!(
        started.elapsed() >= Duration::from_millis(950),
        "should honor the previous Retry-After deadline"
    );
    assert_eq!(endpoint.received().len(), 2);
}

#[tokio::test]
async fn success_ignores_truncated_body() {
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .expect("should bind fixture");
    let address = listener.local_addr().expect("should read fixture address");
    let serving = tokio::spawn(async move {
        let (mut connection, _) = listener.accept().await.expect("should accept request");
        let mut request = [0_u8; 4096];
        let received = connection
            .read(&mut request)
            .await
            .expect("should read request");
        assert!(received > 0, "should receive the client request");
        connection
            .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 100\r\nConnection: close\r\n\r\nshort")
            .await
            .expect("should write truncated response");
    });
    let body = RawValue::from_string("{}".to_owned()).expect("should parse body");
    assert_eq!(
        client(&format!("http://{address}"))
            .create(actor(), &[&body])
            .await,
        GraphResponse::Applied
    );
    serving.await.expect("should finish server");
}

#[tokio::test]
async fn request_unreachable() {
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .expect("should bind temporary port");
    let address = listener.local_addr().expect("should read address");
    drop(listener);
    let body = RawValue::from_string("{}".to_owned()).expect("should parse body");
    assert_eq!(
        client(&format!("http://{address}"))
            .create(actor(), &[&body])
            .await,
        GraphResponse::Unreachable
    );
}
