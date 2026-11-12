use alloc::sync::Arc;
use std::sync::Mutex;

use axum::{
    Router,
    extract::State,
    http::{HeaderMap, Method, StatusCode},
    routing::any,
};
use hash_crypto::Secret;
use hash_middleware::authentication::{
    request::ACTOR_ID_HEADER, service_secret::service_credential,
};
use pretty_assertions::assert_eq;
use reqwest::Url;
use rstest::rstest;
use type_system::{
    knowledge::{
        entity::provenance::ProvidedEntityEditionProvenance, property::PropertyObjectWithMetadata,
    },
    ontology::VersionedUrl,
    principal::{actor::ActorEntityUuid, actor_group::WebId},
    provenance::{SourceProvenance, SourceType},
};
use uuid::Uuid;

use super::{Applied, GraphClient, GraphError, SavedRequests};
use crate::{
    Archive, EntityUpsert, GraphOperation, PlannedWrite, integration_provenance,
    sources::tests::{Server, server},
};

const SERVICE_SECRET: &str = "service-secret";

/// A request the Graph received.
#[derive(Debug, PartialEq)]
struct Received {
    method: Method,
    path: String,
    actor: Option<String>,
    credential: Option<String>,
    body: String,
}

/// The Graph's entity API, answering each method with a fixed status and recording every request.
#[derive(Clone)]
struct Graph {
    create: StatusCode,
    patch: StatusCode,
    received: Arc<Mutex<Vec<Received>>>,
}

impl Graph {
    fn new(create: StatusCode, patch: StatusCode) -> Self {
        Self {
            create,
            patch,
            received: Arc::default(),
        }
    }

    /// Serves the entity API under `prefix`.
    async fn serve(&self, prefix: &str) -> Server {
        server(
            Router::new()
                .route(&format!("{prefix}/entities"), any(record))
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
    uri: axum::http::Uri,
    headers: HeaderMap,
    body: String,
) -> (StatusCode, &'static str) {
    let status = if method == Method::POST {
        graph.create
    } else {
        graph.patch
    };
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
    (status, "graph says no")
}

fn client(server: &Server) -> GraphClient {
    GraphClient::new(
        &Url::parse(server.url()).expect("should be a valid URL"),
        Secret::from_string(SERVICE_SECRET.to_owned()),
    )
    .expect("should configure the client")
}

fn actor() -> ActorEntityUuid {
    ActorEntityUuid::new(Uuid::from_u128(0xAC70))
}

fn web_id() -> WebId {
    WebId::new(Uuid::from_u128(0x0EB))
}

fn provenance() -> ProvidedEntityEditionProvenance {
    integration_provenance(SourceProvenance {
        ty: SourceType::Integration,
        entity_id: None,
        authors: Vec::new(),
        location: None,
        first_published: None,
        last_updated: None,
        loaded_at: None,
    })
}

fn upsert() -> EntityUpsert {
    let entity_type: VersionedUrl = "https://example.com/@demo/types/entity-type/aircraft/v/1"
        .parse()
        .expect("should be a valid versioned URL");
    EntityUpsert::new(
        web_id(),
        "aviation",
        entity_type,
        "N1",
        PropertyObjectWithMetadata::default(),
        provenance(),
    )
}

fn planned(operation: GraphOperation) -> PlannedWrite {
    PlannedWrite::try_from(operation).expect("should encode the requests")
}

/// The text of the request delivery sends with `method`, as the write's payload holds it.
fn saved(write: &PlannedWrite, method: &Method) -> String {
    let raw = match write.payload.requests().expect("should read the payload") {
        SavedRequests::Upsert { create, .. } if method == Method::POST => create,
        SavedRequests::Upsert { patch, .. } => patch,
        SavedRequests::Archive { archive } => archive,
    };
    raw.get().to_owned()
}

fn received(write: &PlannedWrite, method: Method) -> Received {
    Received {
        body: saved(write, &method),
        method,
        path: "/entities".to_owned(),
        actor: Some(actor().to_string()),
        credential: Some(SERVICE_SECRET.to_owned()),
    }
}

#[tokio::test]
async fn upsert_creates() {
    let graph = Graph::new(StatusCode::OK, StatusCode::OK);
    let server = graph.serve("").await;
    let write = planned(GraphOperation::UpsertEntity(upsert()));

    let applied = client(&server)
        .send(actor(), &write)
        .await
        .expect("should create the entity");

    assert_eq!(applied, Applied::Created);
    assert_eq!(
        graph.received(),
        [received(&write, Method::POST)],
        "should send the saved create request as the run's owner"
    );
}

#[tokio::test]
async fn upsert_patches_existing() {
    let graph = Graph::new(StatusCode::CONFLICT, StatusCode::OK);
    let server = graph.serve("").await;
    let write = planned(GraphOperation::UpsertEntity(upsert()));

    let applied = client(&server)
        .send(actor(), &write)
        .await
        .expect("should patch the entity");

    assert_eq!(applied, Applied::Patched);
    assert_eq!(
        graph.received(),
        [
            received(&write, Method::POST),
            received(&write, Method::PATCH),
        ],
        "should patch after the create conflicts"
    );
}

#[rstest]
#[case::archived(StatusCode::OK, Applied::Archived)]
#[case::absent(StatusCode::NOT_FOUND, Applied::Absent)]
#[tokio::test]
async fn archive(#[case] status: StatusCode, #[case] expected: Applied) {
    let graph = Graph::new(StatusCode::OK, status);
    let server = graph.serve("").await;
    let write = planned(GraphOperation::ArchiveEntity(Archive {
        entity_id: upsert().entity_id,
        provenance: provenance(),
    }));

    let applied = client(&server)
        .send(actor(), &write)
        .await
        .expect("should archive the entity");

    assert_eq!(applied, expected);
    assert_eq!(graph.received(), [received(&write, Method::PATCH)]);
}

#[rstest]
#[case::create(StatusCode::UNPROCESSABLE_ENTITY, StatusCode::OK, 422)]
#[case::patch(StatusCode::CONFLICT, StatusCode::LOCKED, 423)]
#[tokio::test]
async fn upsert_rejected(
    #[case] create: StatusCode,
    #[case] patch: StatusCode,
    #[case] status: u16,
) {
    let graph = Graph::new(create, patch);
    let server = graph.serve("").await;
    let write = planned(GraphOperation::UpsertEntity(upsert()));

    let error = client(&server)
        .send(actor(), &write)
        .await
        .expect_err("should report the rejection");

    assert_eq!(*error.current_context(), GraphError::Status { status });
    assert!(
        format!("{error:?}").contains("graph says no"),
        "should attach the Graph's response"
    );
}

#[tokio::test]
async fn graph_url_path() {
    let graph = Graph::new(StatusCode::OK, StatusCode::OK);
    let server = graph.serve("/graph").await;
    let client = GraphClient::new(
        &Url::parse(&format!("{}/graph/", server.url())).expect("should be a valid URL"),
        Secret::from_string(SERVICE_SECRET.to_owned()),
    )
    .expect("should configure the client");

    client
        .send(actor(), &planned(GraphOperation::UpsertEntity(upsert())))
        .await
        .expect("should create the entity");

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
        Secret::from_string(secret.to_owned()),
    )
    .expect_err("should reject the configuration");

    assert_eq!(*error.current_context(), GraphError::Configuration);
}
