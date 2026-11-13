//! Required acceptance against the isolated Graph HTTP service, never the development Graph.
//! See `README.md` here for reproducible prerequisites. Missing prerequisites fail these tests.

mod database;
mod scenarios;
mod transport;

use alloc::collections::BTreeMap;
use std::fs;

use duckdb::types::Value;
use hash_crypto::Secret;
use hash_integrations_definition::Variables;
use serde_json::{Value as JsonValue, value::RawValue};
use similar_asserts::assert_eq;
use tempfile::TempDir;
use time::{Duration, macros::datetime};
use type_system::{
    knowledge::entity::{Entity, id::EntityEditionId},
    principal::actor_group::WebId,
};
use url::Url;
use uuid::Uuid;

use self::database::{GRAPH_URL, SERVICE_SECRET, Seeded};
use super::{connector, reader, run_id};
use crate::{
    ArtifactStorage, FixedClock, OperationRequest, RunContext, RunRequest, SendSettings,
    WorkspaceConfig,
    graph::GraphClient,
    run::{marker, run, table::load_table},
    sources::tests::NoSecrets,
    stage::{plan::PlanOutput, send::SendOutput},
};

const DEFINITION: &str = include_str!("../../../../tests/fixtures/aviation.yaml");
const MODEL: &str = "https://example.com/@demo/types/property-type/model/";
const MASS: &str = "https://example.com/@demo/types/property-type/empty-mass/";
const NAME: &str = "https://example.com/@demo/types/property-type/name/";

struct Harness {
    database: Seeded,
    directory: TempDir,
    graph: GraphClient,
    next: u32,
}

struct PlannedBody {
    alias: String,
    entity_id: String,
    create: Option<Box<RawValue>>,
    patch: Box<RawValue>,
}

struct Completed {
    output: SendOutput,
    bodies: Vec<PlannedBody>,
}

impl Harness {
    fn namespace(&self) -> String {
        format!("aviation/{}", self.database.web)
    }

    async fn new() -> Self {
        let url = Url::parse(GRAPH_URL).expect("should parse the isolated Graph URL");
        assert_eq!(url.host_str(), Some("127.0.0.1"));
        assert_eq!(url.port(), Some(55031));
        let graph = GraphClient::new(&url, Secret::from_string(SERVICE_SECRET.into()))
            .expect("should configure the isolated Graph HTTP client");
        Self {
            database: database::seed().await,
            directory: TempDir::new().expect("should create isolated artifact storage"),
            graph,
            next: 1,
        }
    }

    fn context(&self) -> RunContext {
        let scratch = self
            .directory
            .path()
            .join(format!("scratch-{}", Uuid::new_v4()));
        fs::create_dir_all(&scratch).expect("should create fresh scratch");
        RunContext::new(
            ArtifactStorage::local(&self.directory.path().join("artifacts"))
                .expect("should open isolated artifact storage"),
            self.database.web,
            &connector(),
            scratch,
            WorkspaceConfig::default(),
            SendSettings::default(),
            Box::new(FixedClock(
                datetime!(2026-11-06 12:00 UTC) + Duration::hours(i64::from(self.next) - 1),
            )),
        )
    }

    async fn apply(&mut self, definition: &str) -> Completed {
        self.execute(OperationRequest::Apply {
            definition: definition.into(),
            namespace: self.namespace().into(),
            resend_all: false,
        })
        .await
    }

    async fn execute(&mut self, operation: OperationRequest) -> Completed {
        let context = self.context();
        let run_id = run_id(u128::from(self.next));
        let request = RunRequest {
            run: run_id,
            web: self.database.web,
            connector: connector(),
            actor: self.database.actor.into(),
            operation,
            allow_mass_archive: false,
        };
        let sources = reader(&context, self.directory.path());
        let output = run(&context, request, &sources, &NoSecrets, &self.graph)
            .await
            .expect(
                "should deliver the actual pipeline to the required Graph; see \
                 graph_http/README.md for setup",
            );
        assert_eq!(
            output.rejected, None,
            "should accept every supported scenario write"
        );
        fs::remove_dir_all(&context.scratch)
            .expect("should discard run scratch before reading durable bodies");
        let consumer = self.context();
        let plan: PlanOutput =
            marker::finished(&consumer, &consumer.namespace.plan_output(run_id.into()))
                .await
                .expect("should read the durable plan marker")
                .expect("should have a completed plan");
        let workspace = consumer
            .open_workspace(Variables::default())
            .await
            .expect("should open a fresh body reader");
        load_table(&consumer, &workspace, &plan.writes, "writes".into())
            .await
            .expect("should load exact planned bodies");
        let rows = workspace
            .query("SELECT entity_id, \"create\", patch FROM writes ORDER BY seq".into())
            .await
            .expect("should read request bodies in delivery order");
        let bodies = rows
            .iter()
            .map(|row| {
                let [Value::Text(entity_id), create, Value::Text(patch)] = row else {
                    panic!("should preserve the planned body schema");
                };
                let create = if let Value::Text(body) = create {
                    Some(
                        RawValue::from_string(body.clone())
                            .expect("should read the exact create JSON"),
                    )
                } else {
                    assert_eq!(create, &Value::Null, "should store a nullable create body");
                    None
                };
                PlannedBody {
                    alias: expected_alias(
                        self.database.web,
                        entity_id
                            .rsplit('~')
                            .next()
                            .expect("should contain an entity UUID"),
                    ),
                    entity_id: entity_id.clone(),
                    create,
                    patch: RawValue::from_string(patch.clone())
                        .expect("should read the exact patch JSON"),
                }
            })
            .collect();
        workspace
            .close()
            .await
            .expect("should close the body reader");
        self.next += 1;
        Completed { output, bodies }
    }
}

fn expected_alias(web: WebId, entity_uuid: &str) -> String {
    let identities: JsonValue =
        serde_json::from_str(include_str!("../../../../tests/fixtures/entity-ids.json"))
            .expect("should read independently supplied identity vectors");
    // The Graph enforces UUID uniqueness across webs. The read-only reference HTTP suite
    // isolates its namespace by web; this expected mapping uses the specification's UUIDv5
    // namespace/name and independent fixture literals, never the pipeline ID implementation.
    let namespace = Uuid::from_u128(0xD6E2_C7A1_F84B_4E3A_9C0D_5B7F_1E3A_2D4C);
    identities["entities"]
        .as_object()
        .expect("should contain independent identities")
        .iter()
        .find_map(|(alias, identity)| {
            let entity_type = identity["entity_type"]
                .as_str()
                .expect("should specify the type");
            let source = identity["source_id"]
                .as_str()
                .expect("should specify the source identity");
            let expected = Uuid::new_v5(
                &namespace,
                format!("aviation/{web}::{entity_type}::{source}").as_bytes(),
            );
            (expected.to_string() == entity_uuid).then(|| alias.clone())
        })
        .unwrap_or_else(|| entity_uuid.into())
}

fn entity<'entities>(
    entities: &'entities BTreeMap<String, Entity>,
    alias: &str,
) -> &'entities Entity {
    entities
        .get(alias)
        .expect("should store the independently specified entity identity")
}

fn body<'bodies>(bodies: &'bodies [PlannedBody], alias: &str) -> &'bodies PlannedBody {
    bodies
        .iter()
        .find(|body| body.alias == alias)
        .expect("should plan the specified entity")
}

fn properties(entity: &Entity) -> JsonValue {
    serde_json::to_value(&entity.properties).expect("should read the stored property object")
}

fn editions(entities: &BTreeMap<String, Entity>) -> BTreeMap<String, EntityEditionId> {
    entities
        .iter()
        .map(|(id, entity)| (id.clone(), entity.metadata.record_id.edition_id))
        .collect()
}

fn assert_changed(
    before: &BTreeMap<String, Entity>,
    after: &BTreeMap<String, Entity>,
    changed: &[&str],
) {
    assert_eq!(
        before.len(),
        after.len(),
        "should preserve scenario identities"
    );
    for (id, previous) in before {
        let current = after.get(id).expect("should retain every entity");
        assert_eq!(
            previous.metadata.record_id.edition_id != current.metadata.record_id.edition_id,
            changed.contains(&id.as_str()),
            "should change editions only for the specified values: {id}"
        );
    }
}

fn raw(value: &JsonValue) -> Box<RawValue> {
    RawValue::from_string(serde_json::to_string(value).expect("should encode a test-only probe"))
        .expect("should preserve the probe as raw JSON")
}
