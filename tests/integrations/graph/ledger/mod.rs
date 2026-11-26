//! The whole ledger pipeline: CSV files captured by the DuckDB queries of `capture.yaml`, prepared
//! with the aviation definition, and sent to a Graph the test serves.

extern crate alloc;

#[path = "../aviation/fixtures.rs"]
mod fixtures;
mod graph;
mod local;

use alloc::collections::BTreeMap;
use std::{collections::HashSet, path::Path};

use hash_crypto::Secret;
use hash_graph_store::{
    entity::{EntityQuerySorting, EntityStore as _, QueryEntitiesParams},
    filter::{Filter, FilterExpression, Parameter},
    pool::StorePool as _,
    subgraph::temporal_axes::QueryTemporalAxesUnresolved,
};
use hash_integrations_definition::{Definition, SourceName};
use hash_integrations_ledger::{
    GraphClient, IntegrationNamespace, RunId, S3Bucket, StartInput, Storage, capture,
    prepare_incremental, send, start,
};
use pretty_assertions::assert_eq;
use testcontainers::{
    ContainerAsync, ImageExt as _,
    core::{CmdWaitFor, ExecCommand},
    runners::AsyncRunner as _,
};
use testcontainers_modules::minio::MinIO;
use time::OffsetDateTime;
use type_system::{
    knowledge::entity::{Entity, Link},
    principal::actor::ActorEntityUuid,
};

use self::graph::{Graph, SERVICE_SECRET};

const DEFINITION: &str =
    include_str!("../../../../libs/@local/integrations/definition/examples/aviation.yaml");
const CAPTURE: &str = include_str!("capture.yaml");
const TYPES: &str = "https://example.com/@demo/types";

/// Starts MinIO with an empty `captures` bucket, and returns it with the bucket's settings.
async fn bucket() -> (ContainerAsync<MinIO>, S3Bucket) {
    let minio = MinIO::default()
        .with_name("ghcr.io/hashdeps/minio")
        .with_tag("RELEASE.2025-09-07T16-13-09Z")
        .start()
        .await
        .expect("the MinIO container should start");
    minio
        .exec(
            ExecCommand::new([
                "sh",
                "-c",
                "mc alias set local http://localhost:9000 minioadmin minioadmin && mc mb \
                 local/captures",
            ])
            .with_cmd_ready_condition(CmdWaitFor::exit_code(0)),
        )
        .await
        .expect("the bucket should be created");
    let port = minio
        .get_host_port_ipv4(9000)
        .await
        .expect("the MinIO port should be mapped");
    let bucket = S3Bucket {
        uri: "s3://captures".into(),
        region: "us-east-1".into(),
        endpoint: Some(format!("localhost:{port}").into()),
        use_ssl: false,
        key_id: "minioadmin".into(),
        secret: Secret::from_vec(b"minioadmin".to_vec()),
    };
    (minio, bucket)
}

/// The capture queries of `capture.yaml`, with `$FIXTURES` replaced by the folder of the files.
fn queries() -> BTreeMap<SourceName, Box<str>> {
    let fixtures = Path::new(env!("CARGO_MANIFEST_DIR")).join("ledger");
    serde_saphyr::from_str::<BTreeMap<String, String>>(CAPTURE)
        .expect("`capture.yaml` should map tables to queries")
        .into_iter()
        .map(|(table, query)| {
            (
                table
                    .parse()
                    .expect("a table of `capture.yaml` should be a source name"),
                query
                    .replace("$FIXTURES", &fixtures.to_string_lossy())
                    .into_boxed_str(),
            )
        })
        .collect()
}

/// The live entities of the web of `graph`.
async fn entities(graph: &Graph) -> Vec<Entity> {
    let mut store = graph
        .pool
        .acquire(None)
        .await
        .expect("a database connection should open");
    store
        .query_entities(
            Some(graph.actor),
            QueryEntitiesParams {
                filter: Filter::Equal(
                    FilterExpression::Path {
                        path: hash_graph_store::entity::EntityQueryPath::WebId,
                    },
                    FilterExpression::Parameter {
                        parameter: Parameter::Uuid(graph.web.into()),
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
        .expect("the web's entities should be readable")
        .entities
}

/// The entity type of `entity`, without its base URL, such as `aircraft`.
fn kind(entity: &Entity) -> String {
    let mut types = entity
        .metadata
        .entity_type_ids
        .iter()
        .map(ToString::to_string)
        .collect::<Vec<_>>();
    types.sort();
    types
        .join(",")
        .trim_start_matches(&format!("{TYPES}/entity-type/"))
        .trim_end_matches("/v/1")
        .to_owned()
}

#[tokio::test(flavor = "multi_thread")]
async fn csv_to_graph() {
    let graph = Graph::start().await;
    let (_minio, bucket) = bucket().await;
    let definition = Definition::from_yaml(DEFINITION).expect("the definition should parse");
    let storage = Storage::s3(
        bucket,
        &IntegrationNamespace::new(graph.web.into(), definition.connector()),
    )
    .expect("the bucket should open");
    let run = RunId::new();

    start(
        &storage,
        &definition,
        StartInput {
            run,
            web: graph.web,
            actor: ActorEntityUuid::from(graph.actor),
            definition: DEFINITION.into(),
            id_namespace: None,
            submitted_at: OffsetDateTime::now_utc(),
        },
    )
    .await
    .expect("the run should start");
    capture(&storage, run, &queries())
        .await
        .expect("the CSV files should be captured");
    prepare_incremental(&storage, run)
        .await
        .expect("the run should be prepared");
    let client = GraphClient::new(&graph.url, &Secret::from_string(SERVICE_SECRET.to_owned()))
        .expect("the Graph client should be configured");
    send(&storage, run, &client)
        .await
        .expect("the run should be sent to the Graph");

    let created = entities(&graph).await;
    let mut kinds = created.iter().map(kind).collect::<Vec<_>>();
    kinds.sort();
    assert_eq!(
        kinds,
        [
            "aircraft", "aircraft", "airfield", "airfield", "based-at", "based-at"
        ],
        "the Graph should hold the two aircraft, the two airfields and the two links"
    );
    let airfields = created
        .iter()
        .filter(|entity| kind(entity) == "airfield")
        .map(|entity| entity.metadata.record_id.entity_id)
        .collect::<HashSet<_>>();
    for link in created.iter().filter(|entity| kind(entity) == "based-at") {
        let Some(Link::Directed { target, .. }) = &link.link_data else {
            panic!("`based-at` should be a directed link");
        };
        assert!(
            airfields.contains(&target.entity_id),
            "a link should end at an airfield"
        );
    }
    assert!(
        created.iter().all(|entity| entity.metadata.read_only),
        "integration entities should be read-only"
    );

    send(&storage, run, &client)
        .await
        .expect("sending the completed run again should succeed");
    assert_eq!(
        entities(&graph).await.len(),
        6,
        "a second Send should change nothing"
    );
}
