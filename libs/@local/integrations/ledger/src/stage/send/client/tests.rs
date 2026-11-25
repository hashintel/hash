use alloc::sync::Arc;
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
use pretty_assertions::assert_eq;
use reqwest::Url;
use rstest::rstest;
use serde_json::value::RawValue;
use tokio::{net::TcpListener, task::JoinHandle};
use type_system::principal::actor::ActorEntityUuid;
use uuid::Uuid;

use super::{Answer, GraphClient, GraphError};

const SERVICE_SECRET: &str = "service-secret";

struct Server {
    url: String,
    task: JoinHandle<()>,
}

impl Drop for Server {
    fn drop(&mut self) {
        self.task.abort();
    }
}

async fn server(router: Router) -> Server {
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .expect("should bind the test server");
    let address = listener.local_addr().expect("should get the test address");
    let task = tokio::spawn(async move {
        axum::serve(listener, router)
            .await
            .expect("should serve test responses");
    });
    Server {
        url: format!("http://{address}"),
        task,
    }
}

/// A request the Graph received.
#[derive(Debug, PartialEq)]
struct Received {
    method: Method,
    path: String,
    actor: Option<String>,
    credential: Option<String>,
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

    /// Serves the entity API under `prefix`.
    async fn serve(&self, prefix: &str) -> Server {
        server(
            Router::new()
                .route(&format!("{prefix}/entities"), any(record))
                .route(&format!("{prefix}/entities/bulk"), any(record))
                .with_state(self.clone()),
        )
        .await
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
    graph
        .received
        .lock()
        .expect("should not be poisoned")
        .push(Received {
            path: uri.path().to_owned(),
            actor: headers
                .get(ACTOR_ID_HEADER)
                .and_then(|value| value.to_str().ok())
                .map(ToOwned::to_owned),
            credential: service_credential(&headers).map(ToOwned::to_owned),
            body,
            method,
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

fn received(method: Method, path: &str, body: String) -> Received {
    Received {
        method,
        path: path.to_owned(),
        actor: Some(actor().to_string()),
        credential: Some(SERVICE_SECRET.to_owned()),
        body,
    }
}

#[tokio::test]
async fn create_applied() {
    let graph = Graph::new(StatusCode::OK);
    let server = graph.serve("").await;

    let answer = client(&server.url).create(actor(), &body("a")).await;

    assert_eq!(answer, Answer::Applied);
    assert_eq!(
        graph.received(),
        [received(
            Method::POST,
            "/entities",
            body("a").get().to_owned()
        )],
        "should send the body as the run's owner"
    );
}

#[rstest]
#[case::archived(StatusCode::OK, Answer::Applied)]
#[case::absent(StatusCode::NOT_FOUND, Answer::Refused {
    status: 404,
    message: "graph says no".into(),
})]
#[tokio::test]
async fn archive(#[case] status: StatusCode, #[case] expected: Answer) {
    let graph = Graph::new(status);
    let server = graph.serve("").await;

    let answer = client(&server.url).patch(actor(), &body("a")).await;

    assert_eq!(answer, expected);
    assert_eq!(
        graph.received(),
        [received(
            Method::PATCH,
            "/entities",
            body("a").get().to_owned()
        )]
    );
}

#[rstest]
#[case::ok(StatusCode::OK, None)]
#[case::conflict(StatusCode::CONFLICT, Some(409))]
#[case::not_found(StatusCode::NOT_FOUND, Some(404))]
#[case::bad_request(StatusCode::BAD_REQUEST, Some(400))]
#[case::unprocessable(StatusCode::UNPROCESSABLE_ENTITY, Some(422))]
#[case::server_error(StatusCode::INTERNAL_SERVER_ERROR, Some(500))]
#[case::too_many_requests(StatusCode::TOO_MANY_REQUESTS, None)]
#[case::bad_gateway(StatusCode::BAD_GATEWAY, None)]
#[case::service_unavailable(StatusCode::SERVICE_UNAVAILABLE, None)]
#[case::gateway_timeout(StatusCode::GATEWAY_TIMEOUT, None)]
#[tokio::test]
async fn answers(#[case] status: StatusCode, #[case] refused: Option<u16>) {
    let graph = Graph::new(status);
    let server = graph.serve("").await;

    let answer = client(&server.url).create(actor(), &body("a")).await;

    let expected = match refused {
        Some(status) => Answer::Refused {
            status,
            message: "graph says no".into(),
        },
        None if status.is_success() => Answer::Applied,
        None => Answer::Unavailable,
    };
    assert_eq!(answer, expected);
}

#[tokio::test]
async fn refused_message_cut() {
    let mut graph = Graph::new(StatusCode::BAD_REQUEST);
    graph.message = "x".repeat(2000);
    let server = graph.serve("").await;

    let answer = client(&server.url).create(actor(), &body("a")).await;

    assert_eq!(
        answer,
        Answer::Refused {
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

    let answer = client(&format!("http://{address}"))
        .create(actor(), &body("a"))
        .await;

    assert_eq!(answer, Answer::Unavailable);
}

#[tokio::test]
async fn bulk_routes() {
    let graph = Graph::new(StatusCode::OK);
    let server = graph.serve("").await;
    let client = client(&server.url);
    let (first, second) = (body("a"), body("b"));
    let bodies = [&*first, &*second];

    assert_eq!(client.create_bulk(actor(), &bodies).await, Answer::Applied);
    assert_eq!(client.patch_bulk(actor(), &bodies).await, Answer::Applied);

    let list = r#"[{"entityId":"a"},{"entityId":"b"}]"#;
    assert_eq!(
        graph.received(),
        [
            received(Method::POST, "/entities/bulk", list.to_owned()),
            received(Method::PATCH, "/entities/bulk", list.to_owned()),
        ],
        "should send the bodies as one array"
    );
}

#[tokio::test]
async fn graph_url_path() {
    let graph = Graph::new(StatusCode::OK);
    let server = graph.serve("/graph").await;

    client(&format!("{}/graph/", server.url))
        .create(actor(), &body("a"))
        .await;

    let [request] = graph
        .received()
        .try_into()
        .expect("should send one request");
    assert_eq!(request.path, "/graph/entities");
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
