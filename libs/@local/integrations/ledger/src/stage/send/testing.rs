//! A Graph for the tests of Send, and the rows they send to it.
//!
//! The Graph holds entities by their UUID and applies or refuses a bulk request as a whole. It
//! refuses a create of an entity it holds with 409, a patch of one it does not hold with 404, and
//! a request a test names with the status the test gives. Its refusals carry the Graph's JSON
//! status with the message `refused <uuid>`.

use alloc::{collections::BTreeMap, sync::Arc};
use core::str::FromStr as _;
use std::{collections::HashMap, sync::Mutex};

use axum::{
    Router,
    extract::State,
    http::{HeaderMap, HeaderValue, Method, StatusCode, header::CONTENT_TYPE},
    response::{IntoResponse as _, Response},
    routing::any,
};
use hash_crypto::Secret;
use hash_middleware::authentication::request::ACTOR_ID_HEADER;
use serde_json::{Value, json};
use tokio::net::TcpListener;
use type_system::{
    knowledge::{
        entity::{
            id::{EntityId, EntityUuid},
            provenance::ProvidedEntityEditionProvenance,
        },
        property::PropertyObjectWithMetadata,
    },
    ontology::VersionedUrl,
    principal::actor_group::WebId,
    provenance::{Location, SourceProvenance, SourceType},
};
use url::Url;
use uuid::Uuid;

use super::{client::GraphClient, request::integration_provenance};
use crate::{
    RunId,
    sync_table::{Op, SyncRow},
};

/// A request the Graph received, with the UUIDs of the entities its bodies name and the status it
/// answered with.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct Received {
    pub method: Method,
    pub bulk: bool,
    pub entities: Vec<u128>,
    pub status: StatusCode,
}

/// What the Graph answers when it does not look at the request.
#[derive(Debug, Clone, Copy)]
enum Fault {
    /// Every request after the first `after` is answered with `status`.
    After { after: usize, status: StatusCode },
}

#[derive(Debug, Default)]
struct GraphState {
    /// Whether each entity the Graph holds is archived, by its UUID.
    held: BTreeMap<u128, bool>,
    /// The status a request of a method that names an entity is refused with.
    refused: HashMap<(Method, u128), StatusCode>,
    fault: Option<Fault>,
    received: Vec<Received>,
    /// The actor of each request.
    actors: Vec<Option<String>>,
    /// The provenance of each body, in the order received.
    provenances: Vec<Value>,
}

/// The Graph's entity API, as far as Send uses it.
#[derive(Debug, Clone, Default)]
pub(super) struct Graph {
    state: Arc<Mutex<GraphState>>,
}

impl Graph {
    /// A Graph that already holds the entities `held`.
    pub(super) fn holding(held: &[u128]) -> Self {
        let graph = Self::default();
        graph
            .lock()
            .held
            .extend(held.iter().map(|&entity| (entity, false)));
        graph
    }

    /// Refuses every request that names `entity` with 400.
    pub(super) fn refuse(&self, entity: u128) {
        for method in [Method::POST, Method::PATCH] {
            self.refuse_with(method, entity, StatusCode::BAD_REQUEST);
        }
    }

    /// Refuses every request of `method` that names `entity` with `status`.
    pub(super) fn refuse_with(&self, method: Method, entity: u128, status: StatusCode) {
        self.lock().refused.insert((method, entity), status);
    }

    /// Answers `after` more requests, then answers every request with `status`.
    pub(super) fn fail_after(&self, after: usize, status: StatusCode) {
        self.lock().fault = Some(Fault::After { after, status });
    }

    /// Answers `after` more requests, then answers every request with 503.
    pub(super) fn stop_after(&self, after: usize) {
        self.fail_after(after, StatusCode::SERVICE_UNAVAILABLE);
    }

    /// Answers every request again.
    pub(super) fn resume(&self) {
        self.lock().fault = None;
    }

    /// The requests received since the last call.
    pub(super) fn received(&self) -> Vec<Received> {
        core::mem::take(&mut self.lock().received)
    }

    /// The actor of every request received.
    pub(super) fn actors(&self) -> Vec<Option<String>> {
        self.lock().actors.clone()
    }

    /// The provenance of every body received.
    pub(super) fn provenances(&self) -> Vec<Value> {
        self.lock().provenances.clone()
    }

    /// Whether each entity the Graph holds is archived, by its UUID.
    pub(super) fn held(&self) -> BTreeMap<u128, bool> {
        self.lock().held.clone()
    }

    /// Serves the entity API until the test ends, and returns a client for it.
    pub(super) async fn serve(&self) -> GraphClient {
        let router = Router::new()
            .route("/entities", any(answer::<false>))
            .route("/entities/bulk", any(answer::<true>))
            .with_state(self.clone());
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .expect("should bind the test Graph");
        let address = listener
            .local_addr()
            .expect("should get the test Graph's address");
        tokio::spawn(async move {
            axum::serve(listener, router)
                .await
                .expect("should serve the test Graph");
        });
        GraphClient::new(
            &Url::parse(&format!("http://{address}/")).expect("should be a valid URL"),
            &Secret::from_string("service-secret".to_owned()),
        )
        .expect("should configure the client")
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, GraphState> {
        self.state.lock().expect("should not be poisoned")
    }
}

/// The Graph's JSON status for `status`, with `message`.
fn graph_status(status: StatusCode, message: &str) -> Response {
    let mut response = (
        status,
        json!({ "code": status.as_str(), "message": message, "contents": [] }).to_string(),
    )
        .into_response();
    response
        .headers_mut()
        .insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    response
}

async fn answer<const BULK: bool>(
    State(graph): State<Graph>,
    method: Method,
    headers: HeaderMap,
    body: String,
) -> Response {
    let body = serde_json::from_str::<Value>(&body).expect("the body should be JSON");
    let bodies = if BULK {
        body.as_array()
            .expect("a bulk body should be a list")
            .clone()
    } else {
        vec![body]
    };
    let targets = bodies
        .iter()
        .map(|body| (entity_of(body), body["archived"] == Value::Bool(true)))
        .collect::<Vec<_>>();

    let mut state = graph.lock();
    state.actors.push(
        headers
            .get(ACTOR_ID_HEADER)
            .and_then(|value| value.to_str().ok())
            .map(ToOwned::to_owned),
    );
    state
        .provenances
        .extend(bodies.iter().map(|body| body["provenance"].clone()));
    let (status, response) = decide(&mut state, &method, &targets, BULK);
    state.received.push(Received {
        method,
        bulk: BULK,
        entities: targets.iter().map(|&(entity, _)| entity).collect(),
        status,
    });
    drop(state);
    response
}

/// What the Graph answers a request of `method` for `targets`, and the changes it applies. A bulk
/// request is answered with a list of the entities, a single one with the entity.
fn decide(
    state: &mut GraphState,
    method: &Method,
    targets: &[(u128, bool)],
    bulk: bool,
) -> (StatusCode, Response) {
    match &mut state.fault {
        Some(Fault::After { after: 0, status }) => {
            let status = *status;
            return (status, graph_status(status, "the Graph cannot answer"));
        }
        Some(Fault::After { after, .. }) => *after -= 1,
        None => {}
    }
    if let Some((entity, status)) = targets.iter().find_map(|&(entity, _)| {
        state
            .refused
            .get(&(method.clone(), entity))
            .map(|&status| (entity, status))
    }) {
        return (status, graph_status(status, &format!("refused {entity}")));
    }
    let conflict = if *method == Method::POST {
        targets
            .iter()
            .find(|(entity, _)| state.held.contains_key(entity))
            .map(|&(entity, _)| (StatusCode::CONFLICT, entity))
    } else {
        targets
            .iter()
            .find(|(entity, _)| !state.held.contains_key(entity))
            .map(|&(entity, _)| (StatusCode::NOT_FOUND, entity))
    };
    if let Some((status, entity)) = conflict {
        return (status, graph_status(status, &format!("refused {entity}")));
    }
    let archived = targets
        .iter()
        .map(|&(entity, archived)| (entity, *method == Method::PATCH && archived));
    state.held.extend(archived);
    let entity = json!({ "metadata": {} });
    let body = if bulk {
        Value::Array(vec![entity; targets.len()])
    } else {
        entity
    };
    (StatusCode::OK, axum::Json(body).into_response())
}

/// The UUID of the entity a body names: `entityUuid` in a create, `entityId` in a patch.
fn entity_of(body: &Value) -> u128 {
    let uuid = match (body["entityUuid"].as_str(), body["entityId"].as_str()) {
        (Some(uuid), _) => uuid,
        (None, Some(entity_id)) => entity_id
            .rsplit_once('~')
            .map(|(_, uuid)| uuid)
            .expect("an entity id should hold a `~`"),
        (None, None) => panic!("a body should name its entity"),
    };
    Uuid::from_str(uuid).expect("should be a UUID").as_u128()
}

/// The entity `uuid` in a fixed web.
pub(super) fn entity(uuid: u128) -> EntityId {
    EntityId {
        web_id: WebId::new(Uuid::from_u128(1)),
        entity_uuid: EntityUuid::new(Uuid::from_u128(uuid)),
        draft_id: None,
    }
}

/// A row of `run` that changes the entity `uuid`. A link row links the entities 1 and 2.
pub(super) fn row(run: RunId, op: Op, seq: i64, uuid: u128) -> SyncRow {
    let link = matches!(op, Op::CreateLink | Op::UpdateLink | Op::ArchiveLink);
    SyncRow {
        run,
        seq,
        op,
        entity_id: entity(uuid),
        entity_type: VersionedUrl::from_str("https://hash.ai/@h/types/entity-type/aircraft/v/1")
            .expect("should be a versioned URL"),
        left_entity_id: link.then(|| entity(1)),
        right_entity_id: link.then(|| entity(2)),
        properties: if matches!(op, Op::ArchiveEntity | Op::ArchiveLink) {
            PropertyObjectWithMetadata::default()
        } else {
            serde_json::from_value(json!({
                "value": {
                    "https://hash.ai/@h/types/property-type/name/": {
                        "value": format!("aircraft {uuid}"),
                        "metadata": { "dataTypeId": "https://hash.ai/@h/types/data-type/text/v/1" },
                    },
                },
            }))
            .expect("should be properties with metadata")
        },
    }
}

/// The provenance of a run of the `aviation` connector.
pub(super) fn provenance() -> ProvidedEntityEditionProvenance {
    integration_provenance(SourceProvenance {
        ty: SourceType::Integration,
        entity_id: None,
        authors: Vec::new(),
        location: Some(Location {
            name: Some("aviation".to_owned()),
            uri: None,
            description: None,
        }),
        first_published: None,
        last_updated: None,
        loaded_at: None,
    })
}
