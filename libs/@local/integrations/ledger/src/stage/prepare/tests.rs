// From `engine/src/graph/plan/tests.rs:1-146`
use core::fmt::Write as _;
use std::collections::HashMap;

use duckdb::types::Value;
use hash_graph_store::entity::{CreateEntityParams, PatchEntityParams};
use hash_integrations_definition::{Action, Definition, EntitySink, LinkPipeline, StepKind};
use pretty_assertions::assert_eq;
use rstest::rstest;
use serde_json::value::RawValue;
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

use super::{DuplicateWrite, FinishedPlan, GraphPlan, Payload, PlannedWrite, Planner};
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

// From `engine/src/graph/plan/tests.rs:326-380`

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
