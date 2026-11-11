use core::fmt::Write as _;
use std::collections::HashMap;

use duckdb::types::Value;
use hash_graph_store::entity::{CreateEntityParams, PatchEntityParams};
use hash_integrations_definition::{Action, Definition, EntitySink, LinkPipeline, StepKind};
use pretty_assertions::assert_eq;
use time::OffsetDateTime;
use type_system::{
    knowledge::{
        PropertyValue,
        entity::{id::EntityId, provenance::ProvidedEntityEditionProvenance},
        property::{PropertyObjectWithMetadata, PropertyValueWithMetadata, PropertyWithMetadata},
        value::metadata::ValueMetadata,
    },
    ontology::{BaseUrl, VersionedUrl},
    principal::actor_group::WebId,
    provenance::{Location, SourceProvenance, SourceType},
};
use uuid::Uuid;

use super::{DuplicateWrite, FinishedPlan, GraphPlan, PlannedWrite, Planner};
use crate::{
    Archive, EntityUpsert, GraphOperation, OperationKind, SinkColumns, SinkRow, derive_entity_id,
    integration_provenance,
};

const NAMESPACE: &str = "aviation";
const TYPES: &str = "https://example.com/@demo/types";
const COLUMNS: [&str; 6] = [
    "TAIL",
    "MODEL",
    "FIRST_FLIGHT",
    "EMPTY_MASS",
    "MASS_UNIT",
    "HOME_BASE",
];

fn definition() -> Definition {
    Definition::from_yaml(include_str!(
        "../../../../definition/examples/aviation.yaml"
    ))
    .expect("the example should be a valid definition")
}

fn sink<'definition>(
    definition: &'definition Definition,
    entity_type: &str,
) -> &'definition EntitySink {
    definition
        .entity_pipelines()
        .iter()
        .flat_map(|pipeline| &pipeline.steps)
        .find_map(|step| match &step.kind {
            StepKind::Action(Action::Sink(sink)) if sink.entity_type == url(entity_type) => {
                Some(sink)
            }
            StepKind::Action(_) | StepKind::Branch(_) => None,
        })
        .expect("the example should have the sink")
}

fn based_at(definition: &Definition) -> &LinkPipeline {
    definition
        .link_pipelines()
        .first()
        .expect("the example should link aircraft to airfields")
}

fn url(path: &str) -> VersionedUrl {
    format!("{TYPES}/{path}/v/1")
        .parse()
        .expect("should be a valid versioned URL")
}

fn web_id() -> WebId {
    WebId::new(Uuid::from_u128(0xA2C8_E6C7_485D_4B54_A248_53C9_B9B0_14A2))
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
        loaded_at: Some(
            OffsetDateTime::from_unix_timestamp(1_793_966_400).expect("should be a valid time"),
        ),
    })
}

fn planner(definition: &Definition) -> Planner {
    Planner::new(
        web_id(),
        NAMESPACE,
        provenance(),
        definition.unit_maps().clone(),
    )
}

fn aircraft_id(tail: &str) -> EntityId {
    derive_entity_id(web_id(), NAMESPACE, &url("entity-type/aircraft"), tail)
}

/// Rows of `COLUMNS`, all text, as a sink table holds them.
fn rows(rows: &[[&str; 6]]) -> Vec<Vec<Value>> {
    rows.iter()
        .map(|row| {
            row.iter()
                .map(|value| Value::Text((*value).to_owned()))
                .collect()
        })
        .collect()
}

/// What a planned write does, without its requests.
#[derive(Debug, PartialEq, Eq)]
struct Target {
    kind: OperationKind,
    entity_id: EntityId,
}

fn targets(plan: &FinishedPlan) -> Vec<Target> {
    plan.writes()
        .iter()
        .map(|write| Target {
            kind: write.kind,
            entity_id: write.entity_id,
        })
        .collect()
}

/// The requests a planned write saved, decoded for inspection.
fn requests(write: &PlannedWrite) -> serde_json::Value {
    let mut delivery: serde_json::Value =
        serde_json::from_str(write.payload.as_str()).expect("the payload should be JSON");
    delivery["request"].take()
}

#[test]
fn requests_graph_readable() {
    let definition = definition();
    let columns = COLUMNS.into_iter().collect::<SinkColumns>();
    let rows = rows(&[["SE-XXX", "DC-3", "1946-04-02", "8030", "KG", "ESSA"]]);
    let plan = planner(&definition)
        .plan_entities(
            sink(&definition, "entity-type/aircraft"),
            rows.iter().map(|values| SinkRow::new(&columns, values)),
        )
        .expect("the rows should plan")
        .finish()
        .expect("each entity should be written once");
    let [write] = plan.writes() else {
        panic!("should plan one write");
    };
    let mut requests = requests(write);

    assert_eq!(requests["kind"], "upsert");
    let create: CreateEntityParams = serde_json::from_value(requests["create"].take())
        .expect("the Graph should read the create request");
    assert_eq!(create.web_id, web_id());
    assert_eq!(create.entity_uuid, Some(aircraft_id("SE-XXX").entity_uuid));
    assert!(create.read_only, "integration entities should be read-only");
    assert_eq!(create.properties.value.len(), 3);

    let patch: PatchEntityParams = serde_json::from_value(requests["patch"].take())
        .expect("the Graph should read the patch request");
    assert_eq!(patch.entity_id, aircraft_id("SE-XXX"));
    assert_eq!(
        patch.archived,
        Some(false),
        "a patch should revive the entity"
    );
    assert_eq!(patch.properties.len(), 3);

    let archive: PatchEntityParams = serde_json::from_value(requests["archive"].take())
        .expect("the Graph should read the archive request");
    assert_eq!(archive.entity_id, aircraft_id("SE-XXX"));
    assert_eq!(archive.archived, Some(true));
}

fn upsert(properties: PropertyObjectWithMetadata) -> GraphOperation {
    GraphOperation::UpsertEntity(EntityUpsert::new(
        web_id(),
        NAMESPACE,
        url("entity-type/aircraft"),
        "SE-XXX",
        properties,
        provenance(),
    ))
}

fn properties(names: &[&str]) -> PropertyObjectWithMetadata {
    PropertyObjectWithMetadata {
        value: names
            .iter()
            .map(|name| {
                (
                    BaseUrl::new(format!("{TYPES}/property-type/{name}/"))
                        .expect("should be a valid base URL"),
                    PropertyWithMetadata::Value(PropertyValueWithMetadata {
                        value: PropertyValue::String((*name).to_owned()),
                        metadata: ValueMetadata::default(),
                    }),
                )
            })
            .collect::<HashMap<_, _>>(),
        ..PropertyObjectWithMetadata::default()
    }
}

#[test]
fn payload_property_order() {
    let names = [
        "model",
        "first-flight",
        "empty-mass",
        "operator",
        "registry",
    ];
    let mut reversed = names;
    reversed.reverse();
    let forward = PlannedWrite::try_from(upsert(properties(&names))).expect("should encode");
    let backward = PlannedWrite::try_from(upsert(properties(&reversed))).expect("should encode");
    assert_eq!(
        forward.payload, backward.payload,
        "the same properties should encode to the same payload"
    );
}

#[test]
fn archive_payload() {
    let write = PlannedWrite::try_from(GraphOperation::ArchiveEntity(Archive {
        entity_id: aircraft_id("SE-XXX"),
        provenance: provenance(),
    }))
    .expect("should encode");
    assert_eq!(
        write.payload.as_str(),
        format!(
            r#"{{"entityId":"{}","request":{{"archive":{{"archived":true,"entityId":"{0}","provenance":{{"actorType":"machine","origin":{{"type":"api"}},"sources":[{{"loadedAt":"2026-11-06T12:00:00.000000000Z","location":{{"name":"aviation"}},"type":"integration"}}]}}}},"kind":"archive"}},"version":1}}"#,
            aircraft_id("SE-XXX")
        ),
        "the archive request should be saved exactly"
    );
}

#[test]
fn finish_order() {
    let entity_id = aircraft_id("SE-XXX");
    let archived = aircraft_id("G-OLD");
    let mut later = GraphPlan::default();
    later
        .add(GraphOperation::ArchiveEntity(Archive {
            entity_id: archived,
            provenance: provenance(),
        }))
        .expect("should encode");
    let mut earlier = GraphPlan::default();
    earlier
        .add(upsert(PropertyObjectWithMetadata::default()))
        .expect("should encode");

    let plan = [later, earlier]
        .into_iter()
        .collect::<GraphPlan>()
        .finish()
        .expect("each entity should be written once");
    assert_eq!(
        targets(&plan),
        [
            Target {
                kind: OperationKind::UpsertEntity,
                entity_id,
            },
            Target {
                kind: OperationKind::ArchiveEntity,
                entity_id: archived,
            },
        ],
        "upserts should go before archives"
    );
}

#[test]
fn finish_duplicate_entity() {
    let mut plan = GraphPlan::default();
    plan.add(upsert(PropertyObjectWithMetadata::default()))
        .expect("should encode");
    plan.add(GraphOperation::ArchiveEntity(Archive {
        entity_id: aircraft_id("SE-XXX"),
        provenance: provenance(),
    }))
    .expect("should encode");
    assert_eq!(
        plan.finish().map(|_| ()),
        Err(DuplicateWrite {
            entity_id: aircraft_id("SE-XXX"),
        }),
        "an entity cannot be upserted and archived in one run"
    );
}

/// Every request planned from a few aviation rows, and every issue, for review as a whole.
fn render(plan: &FinishedPlan) -> String {
    let mut rendered = String::new();
    for write in plan.writes() {
        let requests =
            serde_json::to_string_pretty(&requests(write)).expect("the requests should render");
        writeln!(rendered, "{} {}\n{requests}\n", write.kind, write.entity_id)
            .expect("writing to a string should succeed");
    }
    rendered.push_str("issues:\n");
    for issue in plan.issues() {
        write!(rendered, "  {issue}").expect("writing to a string should succeed");
        let mut source = core::error::Error::source(issue);
        while let Some(error) = source {
            write!(rendered, ": {error}").expect("writing to a string should succeed");
            source = error.source();
        }
        rendered.push('\n');
    }
    rendered
}

/// Plans aircraft and their links, covering a clean row, a bad date, a blank amount,
/// a blank tail and a missing home base.
#[test]
fn plan_aviation() {
    let definition = definition();
    let planner = planner(&definition);

    let columns = COLUMNS.into_iter().collect::<SinkColumns>();
    let aircraft = rows(&[
        ["SE-XXX", "DC-3", "17.12.1935", "8030", "KG", "ESSA"],
        ["G-ABC", "  Ju 52 ", "unknown", "", "KG", ""],
        ["", "L-1049", "1957-07-15", "69000", "LB", "ESSA"],
    ]);

    let plan = [
        planner.plan_entities(
            sink(&definition, "entity-type/aircraft"),
            aircraft.iter().map(|values| SinkRow::new(&columns, values)),
        ),
        planner.plan_links(
            based_at(&definition),
            aircraft.iter().map(|values| SinkRow::new(&columns, values)),
        ),
    ]
    .into_iter()
    .collect::<Result<GraphPlan, _>>()
    .expect("the rows should plan")
    .finish()
    .expect("each entity should be written once");

    insta::assert_snapshot!(render(&plan));
}
