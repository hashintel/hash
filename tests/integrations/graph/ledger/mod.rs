#![expect(missing_docs, reason = "integration tests")]

extern crate alloc;

mod collected;
#[path = "../aviation/database.rs"]
mod database;
#[path = "../aviation/fixtures.rs"]
mod fixtures;
mod github;
#[path = "../../../../libs/@local/integrations/ledger/src/testing/minio.rs"]
mod minio;

use alloc::collections::BTreeMap;
use std::path::Path;

use hash_crypto::Secret;
use hash_graph_postgres_store::store::{PooledConnection, PostgresStore};
use hash_graph_store::{
    entity::{EntityQueryPath, EntityQuerySorting, EntityStore as _, QueryEntitiesParams},
    filter::{Filter, FilterExpression, Parameter},
    pool::StorePool as _,
    subgraph::temporal_axes::QueryTemporalAxesUnresolved,
};
use hash_integrations_definition::Definition;
use hash_integrations_ledger::{
    GraphClient, IntegrationNamespace, RunId, S3Bucket, StartInput, Storage, capture,
    prepare_incremental, send, start, status,
};
use pretty_assertions::assert_eq;
use reqwest::Url;
use serde_json::{Value, json};
use time::OffsetDateTime;
use type_system::principal::{
    actor::{ActorEntityUuid, ActorId},
    actor_group::WebId,
};

const AVIATION: &str =
    include_str!("../../../../libs/@local/integrations/definition/examples/aviation.yaml");

fn graph() -> GraphClient {
    let host = std::env::var("HASH_GRAPH_HTTP_HOST").unwrap_or_else(|_| "127.0.0.1".to_owned());
    let port = std::env::var("HASH_GRAPH_HTTP_PORT").unwrap_or_else(|_| "4000".to_owned());
    GraphClient::new(
        &Url::parse(&format!("http://{host}:{port}/")).expect("the Graph URL should be valid"),
        &Secret::from_string(
            std::env::var("HASH_GRAPH_SERVICE_SECRET")
                .expect("the Graph service secret should be configured"),
        ),
    )
    .expect("the Graph client should be configured")
}

/// Takes a new run of round `round` of `rounds.sql` through every stage and returns Send's counts,
/// as `sync status` prints them.
async fn run(
    storage: &Storage,
    graph: &GraphClient,
    actor: ActorId,
    web_id: WebId,
    round: u8,
) -> Value {
    let definition = Definition::from_yaml(AVIATION).expect("should be a valid definition");
    let run = RunId::new();
    let input = StartInput {
        run,
        web: web_id,
        actor: ActorEntityUuid::from(actor),
        definition: AVIATION.into(),
        submitted_at: OffsetDateTime::now_utc(),
    };
    start(storage, &definition, input)
        .await
        .expect("should start the run");
    let fixtures = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../../libs/@local/integrations/ledger/tests/fixtures/aviation");
    let captures = definition
        .sources()
        .keys()
        .map(|table| {
            let file = fixtures.join(format!("round-{round}-{table}.parquet"));
            (table.clone(), file)
        })
        .collect();
    capture(storage, run, &captures)
        .await
        .expect("should capture the run");
    prepare_incremental(storage, run)
        .await
        .expect("should prepare the run");
    send(storage, run, graph)
        .await
        .expect("should send the run");
    let status = status(storage, Some(run))
        .await
        .expect("should read the run's status");
    serde_json::to_value(status).expect("the status should serialize")["send"].clone()
}

/// How many entities of each type `web_id` holds, as live and archived.
async fn counts(
    store: &mut PostgresStore<PooledConnection>,
    actor: ActorId,
    web_id: WebId,
) -> BTreeMap<String, [usize; 2]> {
    let entities = store
        .query_entities(
            Some(actor),
            QueryEntitiesParams {
                filter: Filter::Equal(
                    FilterExpression::Path {
                        path: EntityQueryPath::WebId,
                    },
                    FilterExpression::Parameter {
                        parameter: Parameter::Uuid(web_id.into()),
                        convert: None,
                    },
                ),
                temporal_axes: QueryTemporalAxesUnresolved::live_only(),
                sorting: EntityQuerySorting {
                    paths: Vec::new(),
                    cursor: None,
                },
                limit: 100,
                conversions: Vec::new(),
                include_entity_types: None,
                include_drafts: false,
                include_permissions: false,
            },
        )
        .await
        .expect("the entities of the web should be readable")
        .entities;
    let mut counts = BTreeMap::<_, [usize; 2]>::new();
    for entity in entities {
        for entity_type in &entity.metadata.entity_type_ids {
            let kind = entity_type
                .base_url
                .as_str()
                .trim_end_matches('/')
                .rsplit('/')
                .next()
                .expect("a base URL should have a last part")
                .to_owned();
            counts.entry(kind).or_default()[usize::from(entity.metadata.archived)] += 1;
        }
    }
    counts
}

/// Two runs into a new web that create, update and archive entities and links, each as the
/// captures say. Every change matches what the web holds, so the Graph applies each as sent.
#[tokio::test]
async fn update_rounds() {
    let pool = database::pool();
    let mut store = pool
        .acquire(None)
        .await
        .expect("the database connection should open");
    let (actor, web_id) = fixtures::seed(&mut store).await;
    let (_minio, port) = minio::minio().await;
    let bucket = S3Bucket {
        uri: "s3://captures".into(),
        region: "us-east-1".into(),
        endpoint: Some(format!("localhost:{port}").into()),
        use_ssl: false,
        key_id: "minioadmin".into(),
        secret: Secret::from_vec(b"minioadmin".to_vec()),
    };
    let connector = "aviation".parse().expect("should be a connector ID");
    let storage = Storage::s3(
        bucket,
        &IntegrationNamespace::new(web_id.into(), &connector),
    )
    .expect("should open the bucket");
    let graph = graph();

    assert_eq!(
        run(&storage, &graph, actor, web_id, 1).await,
        json!({ "created": 9, "updated": 0, "archived": 0, "mismatches": 0, "failed": 0 }),
        "three airfields, three aircraft and their links should be created"
    );
    assert_eq!(
        counts(&mut store, actor, web_id).await,
        BTreeMap::from([
            ("aircraft".to_owned(), [3, 0]),
            ("airfield".to_owned(), [3, 0]),
            ("based-at".to_owned(), [3, 0]),
        ])
    );

    assert_eq!(
        run(&storage, &graph, actor, web_id, 2).await,
        json!({ "created": 3, "updated": 3, "archived": 3, "mismatches": 0, "failed": 0 }),
        "`ESOW`, `SE-BBB` and its link should be created, `ESSB`, `N100` and its link updated, \
         and `G-OLD`, its link and `ESGG` archived"
    );
    assert_eq!(
        counts(&mut store, actor, web_id).await,
        BTreeMap::from([
            ("aircraft".to_owned(), [3, 1]),
            ("airfield".to_owned(), [3, 1]),
            ("based-at".to_owned(), [3, 1]),
        ])
    );
}
