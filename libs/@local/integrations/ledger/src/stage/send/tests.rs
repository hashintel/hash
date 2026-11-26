use alloc::{
    collections::{BTreeMap, BTreeSet},
    sync::Arc,
};
use core::{assert_matches, str::FromStr as _};
use std::sync::Mutex;

use axum::{
    Router,
    extract::State,
    http::{Method, StatusCode},
    routing::any,
};
use hash_crypto::Secret;
use pretty_assertions::assert_eq;
use serde_json::Value;
use tokio::net::TcpListener;
use type_system::{
    knowledge::entity::{
        id::{EntityId, EntityUuid},
        provenance::ProvidedEntityEditionProvenance,
    },
    ontology::VersionedUrl,
    principal::{actor::ActorEntityUuid, actor_group::WebId},
    provenance::{Location, SourceProvenance, SourceType},
};
use url::Url;
use uuid::Uuid;

use super::{
    batch::{Batch, Write},
    client::GraphClient,
    delivery::Delivery,
    request::integration_provenance,
    send,
};
use crate::{
    RunId,
    run::{self, BatchLimits, CapturePart, FailedEntity, PreparePart, SendPart, Stage, current},
    stage::StageError,
    storage::Storage,
    sync_table::{self, Op, SyncRow},
    testing::{bucket, minio, namespace, started},
};

/// A request the Graph answered: its method, whether it was a bulk request, and the UUIDs of the
/// entities its bodies name.
type Received = (Method, bool, Vec<u128>);

#[derive(Debug, Default)]
struct Entities {
    held: BTreeSet<u128>,
    refused: BTreeSet<u128>,
    /// How many more requests the Graph answers before it answers every request with 503.
    answers_left: Option<usize>,
    received: Vec<Received>,
}

impl Entities {
    /// Answers a request of `method` for `entities`, and applies it if the Graph accepts it.
    fn answer(&mut self, method: &Method, bulk: bool, entities: Vec<u128>) -> (StatusCode, String) {
        match &mut self.answers_left {
            Some(0) => return (StatusCode::SERVICE_UNAVAILABLE, String::new()),
            Some(left) => *left -= 1,
            None => {}
        }
        self.received.push((method.clone(), bulk, entities.clone()));
        if let Some(entity) = entities.iter().find(|entity| self.refused.contains(entity)) {
            return (StatusCode::BAD_REQUEST, format!("refused {entity}"));
        }
        let conflict = if *method == Method::POST {
            entities
                .iter()
                .any(|entity| self.held.contains(entity))
                .then_some(StatusCode::CONFLICT)
        } else {
            entities
                .iter()
                .any(|entity| !self.held.contains(entity))
                .then_some(StatusCode::NOT_FOUND)
        };
        if let Some(status) = conflict {
            return (status, String::new());
        }
        self.held.extend(entities);
        (StatusCode::OK, String::new())
    }
}

/// The Graph's entity API as far as Send uses it. It applies or refuses a bulk request as a
/// whole: 400 if a body names a refused entity, 409 for a create of an entity it holds, 404 for a
/// patch of one it does not hold.
#[derive(Debug, Clone, Default)]
struct Graph(Arc<Mutex<Entities>>);

impl Graph {
    fn holding(held: &[u128]) -> Self {
        let graph = Self::default();
        graph.lock().held.extend(held);
        graph
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, Entities> {
        self.0.lock().expect("should not be poisoned")
    }

    fn received(&self) -> Vec<Received> {
        core::mem::take(&mut self.lock().received)
    }

    async fn serve(&self) -> GraphClient {
        let router = Router::new()
            .route("/entities", any(answer::<false>))
            .route("/entities/bulk", any(answer::<true>))
            .with_state(self.clone());
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .expect("should bind the test Graph");
        let address = listener.local_addr().expect("should get the address");
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
}

async fn answer<const BULK: bool>(
    State(graph): State<Graph>,
    method: Method,
    body: String,
) -> (StatusCode, String) {
    let body = serde_json::from_str::<Value>(&body).expect("the body should be JSON");
    let bodies = if BULK {
        body.as_array()
            .expect("a bulk body should be a list")
            .clone()
    } else {
        vec![body]
    };
    let entities = bodies.iter().map(entity_of).collect::<Vec<_>>();
    graph.lock().answer(&method, BULK, entities)
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

fn entity(uuid: u128) -> EntityId {
    EntityId {
        web_id: WebId::new(Uuid::from_u128(1)),
        entity_uuid: EntityUuid::new(Uuid::from_u128(uuid)),
        draft_id: None,
    }
}

/// A row of `run` that changes the entity `uuid`. A link row links the entities 1 and 2.
fn row(run: RunId, op: Op, seq: i64, uuid: u128) -> SyncRow {
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
        properties: serde_json::from_value(serde_json::json!({ "value": {} }))
            .expect("should be properties"),
    }
}

fn provenance() -> ProvidedEntityEditionProvenance {
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

fn writes(rows: Vec<SyncRow>) -> Vec<Write> {
    rows.into_iter()
        .map(|row| Write::new(row, &provenance()).expect("should build the body"))
        .collect()
}

/// The op and the entity of each write of each batch.
fn shape(batches: &[Batch]) -> Vec<Vec<(Op, u128)>> {
    batches
        .iter()
        .map(|batch| {
            batch
                .writes
                .iter()
                .map(|write| {
                    (
                        write.row.op,
                        Uuid::from(write.row.entity_id.entity_uuid).as_u128(),
                    )
                })
                .collect()
        })
        .collect()
}

fn counts() -> SendPart {
    SendPart {
        created: 0,
        updated: 0,
        archived: 0,
        create_existed: 0,
        update_missing: 0,
        archive_missing: 0,
        failed: Vec::new(),
    }
}

/// Cuts `rows` and delivers every batch to `graph`.
async fn deliver(graph: &Graph, rows: Vec<SyncRow>) -> SendPart {
    let client = graph.serve().await;
    let provenance = provenance();
    let delivery = Delivery {
        graph: &client,
        actor: ActorEntityUuid::new(Uuid::from_u128(0xAC70)),
        provenance: &provenance,
    };
    let mut part = counts();
    for (number, batch) in (0_u32..).zip(Batch::cut(writes(rows), BatchLimits::default())) {
        delivery
            .deliver(number, &batch, &mut part)
            .await
            .expect("should deliver the batch");
    }
    part
}

#[test]
fn cut_batches() {
    let run = RunId::new();
    let listed = Write::new(row(run, Op::CreateEntity, 0, 1), &provenance())
        .expect("should build the body")
        .body
        .get()
        .len() as u64
        + 1;
    let limits = |max_writes, max_bytes| BatchLimits {
        max_writes,
        max_bytes,
    };
    let creates = (1..=5)
        .map(|uuid| row(run, Op::CreateEntity, 0, uuid))
        .collect::<Vec<_>>();
    let create = |uuid| (Op::CreateEntity, uuid);
    let cases = [
        (
            "one kind per batch, in the order of kinds, then `seq`, then entity",
            vec![
                row(run, Op::ArchiveEntity, 0, 7),
                row(run, Op::UpdateEntity, 0, 3),
                row(run, Op::CreateLink, 1, 5),
                row(run, Op::CreateEntity, 2, 4),
                row(run, Op::CreateEntity, 1, 9),
                row(run, Op::CreateEntity, 1, 2),
            ],
            BatchLimits::default(),
            vec![
                vec![create(2), create(9), create(4)],
                vec![(Op::UpdateEntity, 3)],
                vec![(Op::CreateLink, 5)],
                vec![(Op::ArchiveEntity, 7)],
            ],
        ),
        (
            "at most `max_writes` writes",
            creates.clone(),
            limits(2, 1_500_000),
            vec![
                vec![create(1), create(2)],
                vec![create(3), create(4)],
                vec![create(5)],
            ],
        ),
        (
            "at most `max_bytes` of bodies as one list",
            creates.clone(),
            limits(128, 1 + 2 * listed),
            vec![
                vec![create(1), create(2)],
                vec![create(3), create(4)],
                vec![create(5)],
            ],
        ),
        (
            "a body over `max_bytes` alone",
            creates,
            limits(128, 10),
            (1..=5).map(|uuid| vec![create(uuid)]).collect(),
        ),
        (
            "an entity never twice in a batch",
            vec![
                row(run, Op::UpdateEntity, 0, 1),
                row(run, Op::UpdateEntity, 1, 2),
                row(run, Op::UpdateEntity, 2, 1),
            ],
            BatchLimits::default(),
            vec![
                vec![(Op::UpdateEntity, 1), (Op::UpdateEntity, 2)],
                vec![(Op::UpdateEntity, 1)],
            ],
        ),
    ];

    for (case, rows, limits, expected) in cases {
        let reversed = rows.iter().rev().cloned().collect();
        let batches = Batch::cut(writes(rows), limits);
        assert_eq!(shape(&batches), expected, "{case}");
        assert_eq!(
            shape(&Batch::cut(writes(reversed), limits)),
            expected,
            "{case}: the same rows in another order should give the same batches"
        );
    }
}

#[tokio::test]
async fn accepted_batch_one_request() {
    let graph = Graph::holding(&[4]);
    let run = RunId::new();

    let part = deliver(
        &graph,
        vec![
            row(run, Op::CreateEntity, 0, 1),
            row(run, Op::CreateEntity, 1, 2),
            row(run, Op::ArchiveEntity, 2, 4),
        ],
    )
    .await;

    assert_eq!(
        graph.received(),
        vec![
            (Method::POST, true, vec![1, 2]),
            (Method::PATCH, true, vec![4]),
        ],
        "each accepted batch should be one request"
    );
    assert_eq!(
        part,
        SendPart {
            created: 2,
            archived: 1,
            ..counts()
        },
        "every row of an accepted batch should be counted"
    );
}

#[tokio::test]
async fn refused_creates_one_by_one() {
    let graph = Graph::holding(&[2]);
    graph.lock().refused.insert(3);
    let run = RunId::new();

    let part = deliver(
        &graph,
        vec![
            row(run, Op::CreateEntity, 0, 1),
            row(run, Op::CreateEntity, 1, 2),
            row(run, Op::CreateEntity, 2, 3),
        ],
    )
    .await;

    assert_eq!(
        graph.received(),
        vec![
            (Method::POST, true, vec![1, 2, 3]),
            (Method::POST, false, vec![1]),
            (Method::POST, false, vec![2]),
            (Method::PATCH, false, vec![2]),
            (Method::POST, false, vec![3]),
        ],
        "a refused batch should be sent one by one, patching the entity that exists"
    );
    assert_eq!(
        part,
        SendPart {
            created: 1,
            updated: 1,
            create_existed: 1,
            failed: vec![FailedEntity {
                batch: 0,
                index: 2,
                entity_id: entity(3),
                status: 400,
                message: "refused 3".into(),
            }],
            ..counts()
        },
        "the counts should add up to the rows, with the refused entity recorded"
    );
}

#[tokio::test]
async fn refused_updates_and_archives_one_by_one() {
    let graph = Graph::holding(&[1, 3]);
    let run = RunId::new();

    let part = deliver(
        &graph,
        vec![
            row(run, Op::UpdateEntity, 0, 1),
            row(run, Op::UpdateEntity, 1, 2),
            row(run, Op::ArchiveEntity, 2, 3),
            row(run, Op::ArchiveEntity, 3, 4),
        ],
    )
    .await;

    assert_eq!(
        graph.received(),
        vec![
            (Method::PATCH, true, vec![1, 2]),
            (Method::PATCH, false, vec![1]),
            (Method::PATCH, false, vec![2]),
            (Method::POST, false, vec![2]),
            (Method::PATCH, true, vec![3, 4]),
            (Method::PATCH, false, vec![3]),
            (Method::PATCH, false, vec![4]),
        ],
        "an update of a missing entity should create it, and an archive of one should be left"
    );
    assert_eq!(
        part,
        SendPart {
            created: 1,
            updated: 1,
            archived: 1,
            update_missing: 1,
            archive_missing: 1,
            ..counts()
        }
    );
}

/// A bucket on a new MinIO container, with `run` started, captured and prepared, and `rows` in
/// the sync table.
async fn prepared(
    rows: impl FnOnce(RunId) -> Vec<SyncRow>,
) -> (
    testcontainers::ContainerAsync<testcontainers_modules::minio::MinIO>,
    Storage,
    RunId,
) {
    let (minio, port) = minio().await;
    let storage = Storage::s3(bucket(port), &namespace()).expect("should open the bucket");
    let run = RunId::new();
    started(&storage, run).await;
    let rows = rows(run);
    let (mut record, version) = run::load(&storage, run).await.expect("should load the run");
    record.capture = Some(CapturePart {
        sources: BTreeMap::new(),
    });
    record.prepare = Some(PreparePart {
        rows: rows.len() as u64,
        issues: None,
        issue_count: 0,
    });
    sync_table::write(&storage, run, rows)
        .await
        .expect("should write the rows");
    run::save(&storage, &record, Some(&version))
        .await
        .expect("should save the run");
    (minio, storage, run)
}

async fn send_part(storage: &Storage, run: RunId) -> Option<SendPart> {
    let (record, _) = run::load(storage, run).await.expect("should load the run");
    assert_eq!(record.failure, None, "the run should not have failed");
    record.send
}

#[tokio::test]
async fn unavailable_graph_then_rerun() {
    let graph = Graph::holding(&[3]);
    let client = graph.serve().await;
    let (_minio, storage, run) = prepared(|run| {
        vec![
            row(run, Op::CreateEntity, 0, 1),
            row(run, Op::CreateEntity, 1, 2),
            row(run, Op::UpdateEntity, 2, 3),
        ]
    })
    .await;
    graph.lock().answers_left = Some(1);

    let error = send(&storage, run, &client)
        .await
        .expect_err("should stop when the Graph is not available");
    assert_matches!(
        error.current_context(),
        StageError::Retryable { stage: Stage::Send }
    );
    assert_eq!(
        send_part(&storage, run).await,
        None,
        "nothing should be recorded"
    );

    graph.lock().answers_left = None;
    send(&storage, run, &client)
        .await
        .expect("should send the run once the Graph is back");

    assert_eq!(
        send_part(&storage, run).await,
        Some(SendPart {
            updated: 3,
            create_existed: 2,
            ..counts()
        }),
        "the creates applied before the Graph stopped should count as `create_existed`"
    );
    assert_eq!(
        graph.lock().held,
        BTreeSet::from([1, 2, 3]),
        "the Graph should end with the same entities"
    );
}

#[tokio::test]
async fn send_whole_stage() {
    let graph = Graph::holding(&[3]);
    let client = graph.serve().await;
    let (_minio, storage, run) = prepared(|run| {
        vec![
            row(run, Op::UpdateEntity, 0, 3),
            row(run, Op::CreateEntity, 1, 2),
            row(run, Op::CreateEntity, 2, 1),
        ]
    })
    .await;

    send(&storage, run, &client)
        .await
        .expect("should send the run");

    assert_eq!(
        graph.received(),
        vec![
            (Method::POST, true, vec![2, 1]),
            (Method::PATCH, true, vec![3]),
        ],
        "the rows should arrive in the fixed order"
    );
    assert_eq!(
        send_part(&storage, run).await,
        Some(SendPart {
            created: 2,
            updated: 1,
            ..counts()
        })
    );
    let (completed, _) = current::read(&storage)
        .await
        .expect("should read `current.json`");
    assert_eq!(
        (completed.active, completed.last_completed),
        (None, Some(run)),
        "the run should be the last completed run"
    );

    send(&storage, run, &client)
        .await
        .expect("should send the completed run again");
    assert_eq!(
        graph.received(),
        Vec::new(),
        "a second Send should send nothing"
    );

    let (_minio, storage, run) = prepared(|run| vec![row(run, Op::CreateEntity, 0, 5)]).await;
    let (mut record, version) = run::load(&storage, run).await.expect("should load the run");
    record.send = Some(counts());
    run::save(&storage, &record, Some(&version))
        .await
        .expect("should save the run");

    send(&storage, run, &client)
        .await
        .expect("should complete the run");
    assert_eq!(
        graph.received(),
        Vec::new(),
        "a run with its `send` part should only be completed"
    );
    let (completed, _) = current::read(&storage)
        .await
        .expect("should read `current.json`");
    assert_eq!(completed.last_completed, Some(run));
}
