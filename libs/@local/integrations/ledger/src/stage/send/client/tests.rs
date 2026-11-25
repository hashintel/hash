use alloc::sync::Arc;
use std::sync::Mutex;

use axum::{
    Router,
    extract::State,
    http::{
        HeaderMap, Method, StatusCode, Uri,
        header::{AUTHORIZATION, CONTENT_TYPE},
    },
    routing::any,
};
use hash_crypto::Secret;
use hash_middleware::authentication::{
    request::ACTOR_ID_HEADER, service_secret::SERVICE_AUTH_SCHEME,
};
use pretty_assertions::assert_eq;
use reqwest::Url;
use rstest::rstest;
use serde_json::value::RawValue;
use tokio::net::TcpListener;
use type_system::principal::actor::ActorEntityUuid;
use uuid::Uuid;

use super::{GraphClient, GraphError, Response};

const SERVICE_SECRET: &str = "service-secret";

/// A request the Graph received.
#[derive(Debug, PartialEq)]
struct Received {
    method: Method,
    path: String,
    /// The actor, authorization and content type headers.
    headers: [Option<String>; 3],
    body: String,
}

/// The Graph's entity API, answering every request with a fixed status and message and recording
/// every request.
#[derive(Clone)]
struct Graph {
    status: StatusCode,
    message: String,
    received: Arc<Mutex<Vec<Received>>>,
}

impl Graph {
    fn new(status: StatusCode) -> Self {
        Self {
            status,
            message: "graph says no".to_owned(),
            received: Arc::default(),
        }
    }

    /// Serves the entity API under `prefix` until the test ends, and returns its URL.
    async fn serve(&self, prefix: &str) -> String {
        let router = Router::new()
            .route(&format!("{prefix}/entities"), any(record))
            .route(&format!("{prefix}/entities/bulk"), any(record))
            .with_state(self.clone());
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .expect("should bind the test server");
        let address = listener.local_addr().expect("should get the test address");
        tokio::spawn(async move {
            axum::serve(listener, router)
                .await
                .expect("should serve test responses");
        });
        format!("http://{address}{prefix}")
    }

    fn received(&self) -> Vec<Received> {
        core::mem::take(&mut self.received.lock().expect("should not be poisoned"))
    }
}

async fn record(
    State(graph): State<Graph>,
    method: Method,
    uri: Uri,
    headers: HeaderMap,
    body: String,
) -> (StatusCode, String) {
    let headers = [
        ACTOR_ID_HEADER,
        AUTHORIZATION.as_str(),
        CONTENT_TYPE.as_str(),
    ]
    .map(|name| {
        headers
            .get(name)
            .and_then(|value| value.to_str().ok())
            .map(ToOwned::to_owned)
    });
    graph
        .received
        .lock()
        .expect("should not be poisoned")
        .push(Received {
            method,
            path: uri.path().to_owned(),
            headers,
            body,
        });
    (graph.status, graph.message)
}

fn client(url: &str) -> GraphClient {
    GraphClient::new(
        &Url::parse(url).expect("should be a valid URL"),
        &Secret::from_string(SERVICE_SECRET.to_owned()),
    )
    .expect("should configure the client")
}

fn actor() -> ActorEntityUuid {
    ActorEntityUuid::new(Uuid::from_u128(0xAC70))
}

fn body(entity: &str) -> Box<RawValue> {
    RawValue::from_string(format!(r#"{{"entityId":"{entity}"}}"#)).expect("should be valid JSON")
}

/// A request sent as the run's owner, with the service credential.
fn received(method: Method, path: &str, body: &str) -> Received {
    Received {
        method,
        path: path.to_owned(),
        headers: [
            Some(actor().to_string()),
            Some(format!("{SERVICE_AUTH_SCHEME} {SERVICE_SECRET}")),
            Some("application/json".to_owned()),
        ],
        body: body.to_owned(),
    }
}

fn refused(status: u16) -> Response {
    Response::Refused {
        status,
        message: "graph says no".into(),
    }
}

#[rstest]
#[case::create(Method::POST)]
#[case::patch(Method::PATCH)]
#[tokio::test]
async fn sends(#[case] method: Method) {
    let graph = Graph::new(StatusCode::OK);
    let client = client(&graph.serve("").await);

    let response = if method == Method::POST {
        client.create(actor(), &body("a")).await
    } else {
        client.patch(actor(), &body("a")).await
    };

    assert_eq!(response, Response::Applied);
    assert_eq!(
        graph.received(),
        [received(method, "/entities", r#"{"entityId":"a"}"#)]
    );
}

#[tokio::test]
async fn bulk_routes() {
    let graph = Graph::new(StatusCode::OK);
    let client = client(&graph.serve("").await);
    let (first, second) = (body("a"), body("b"));
    let bodies = [&*first, &*second];

    assert_eq!(
        client.create_bulk(actor(), &bodies).await,
        Response::Applied
    );
    assert_eq!(client.patch_bulk(actor(), &bodies).await, Response::Applied);

    let list = r#"[{"entityId":"a"},{"entityId":"b"}]"#;
    assert_eq!(
        graph.received(),
        [
            received(Method::POST, "/entities/bulk", list),
            received(Method::PATCH, "/entities/bulk", list),
        ],
        "should send the bodies as one array"
    );
}

#[rstest]
#[case::conflict(StatusCode::CONFLICT, refused(409))]
#[case::not_found(StatusCode::NOT_FOUND, refused(404))]
#[case::bad_request(StatusCode::BAD_REQUEST, refused(400))]
#[case::unprocessable(StatusCode::UNPROCESSABLE_ENTITY, refused(422))]
#[case::server_error(StatusCode::INTERNAL_SERVER_ERROR, refused(500))]
#[case::too_many_requests(StatusCode::TOO_MANY_REQUESTS, Response::Unavailable)]
#[case::bad_gateway(StatusCode::BAD_GATEWAY, Response::Unavailable)]
#[case::service_unavailable(StatusCode::SERVICE_UNAVAILABLE, Response::Unavailable)]
#[case::gateway_timeout(StatusCode::GATEWAY_TIMEOUT, Response::Unavailable)]
#[tokio::test]
async fn answers(#[case] status: StatusCode, #[case] expected: Response) {
    let graph = Graph::new(status);

    let response = client(&graph.serve("").await)
        .create(actor(), &body("a"))
        .await;

    assert_eq!(response, expected);
}

#[tokio::test]
async fn refused_message_cut() {
    let mut graph = Graph::new(StatusCode::BAD_REQUEST);
    graph.message = "x".repeat(2000);

    let response = client(&graph.serve("").await)
        .create(actor(), &body("a"))
        .await;

    assert_eq!(
        response,
        Response::Refused {
            status: 400,
            message: "x".repeat(1024).into(),
        }
    );
}

#[tokio::test]
async fn unavailable_without_answer() {
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .expect("should bind a port");
    let address = listener.local_addr().expect("should get the address");
    drop(listener);

    let response = client(&format!("http://{address}"))
        .create(actor(), &body("a"))
        .await;

    assert_eq!(response, Response::Unavailable);
}

#[tokio::test]
async fn graph_url_path() {
    let graph = Graph::new(StatusCode::OK);
    let client = client(&format!("{}/", graph.serve("/graph").await));

    client.create(actor(), &body("a")).await;
    client.create_bulk(actor(), &[&body("a")]).await;

    let paths = graph
        .received()
        .into_iter()
        .map(|request| request.path)
        .collect::<Vec<_>>();
    assert_eq!(paths, ["/graph/entities", "/graph/entities/bulk"]);
}

#[rstest]
#[case::scheme("ftp://graph.test", SERVICE_SECRET)]
#[case::credentials("http://user:password@graph.test", SERVICE_SECRET)]
#[case::empty_secret("http://graph.test", "")]
fn configuration(#[case] url: &str, #[case] secret: &str) {
    let error = GraphClient::new(
        &Url::parse(url).expect("should be a valid URL"),
        &Secret::from_string(secret.to_owned()),
    )
    .expect_err("should reject the configuration");

    assert_eq!(*error.current_context(), GraphError::Configuration);
}
