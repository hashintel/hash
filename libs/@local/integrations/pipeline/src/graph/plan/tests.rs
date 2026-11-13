use alloc::collections::BTreeMap;
use std::collections::HashMap;

use duckdb::types::Value;
use hash_graph_store::entity::{CreateEntityParams, PatchEntityParams};
use hash_integrations_definition::{Action, Definition, EntitySink, StepKind};
use rstest::rstest;
use serde_json::{Value as JsonValue, json};
use similar_asserts::assert_eq;
use time::macros::datetime;
use type_system::{
    knowledge::{
        PropertyValue,
        entity::{id::EntityId, provenance::ProvidedEntityEditionProvenance},
        property::{PropertyObjectWithMetadata, PropertyValueWithMetadata, PropertyWithMetadata},
        value::metadata::ValueMetadata,
    },
    ontology::BaseUrl,
    provenance::{Location, SourceProvenance, SourceType},
};

use super::{Planner, request};
use crate::graph::{EntityUpsert, SinkColumns, SinkRow, integration_provenance};

const AIRCRAFT: &str = "00000000-0000-4000-8000-000000000001~468da978-f2fd-52d7-ad32-e319a155c918";
const AIRFIELD: &str = "00000000-0000-4000-8000-000000000001~9ec2610c-ca36-53f4-b809-e9af4c4b3b68";

fn entity_id(text: &str) -> EntityId {
    serde_json::from_value(json!(text)).expect("should parse a literal entity identity")
}

fn definition() -> Definition {
    Definition::from_yaml(include_str!("../../../tests/fixtures/aviation.yaml"))
        .expect("should parse the independent aviation definition")
}

fn sink(definition: &Definition) -> &EntitySink {
    definition
        .entity_pipelines()
        .iter()
        .flat_map(|pipeline| &pipeline.steps)
        .find_map(|step| match &step.kind {
            StepKind::Action(Action::Sink(sink)) if step.id.as_ref() == "sink-aircraft" => {
                Some(sink)
            }
            StepKind::Action(_) | StepKind::Branch(_) => None,
        })
        .expect("should find the aircraft sink")
}

fn provenance() -> ProvidedEntityEditionProvenance {
    integration_provenance(SourceProvenance {
        ty: SourceType::Integration,
        entity_id: None,
        authors: Vec::new(),
        location: Some(Location {
            name: Some("aviation".into()),
            uri: None,
            description: None,
        }),
        first_published: None,
        last_updated: None,
        loaded_at: Some(datetime!(2026-11-06 12:00 UTC)),
    })
}

fn expected() -> JsonValue {
    serde_json::from_str(include_str!("../../../tests/fixtures/requests.json"))
        .expect("should read independently supplied request expectations")
}

#[test]
fn entity_exact_bodies() {
    let definition = definition();
    let planner = Planner::new(provenance(), definition.unit_maps().clone());
    let columns = ["MODEL", "FIRST_FLIGHT", "EMPTY_MASS", "MASS_UNIT"]
        .into_iter()
        .collect::<SinkColumns>();
    let values = [" DC-3 ", "1946-04-02", "8030", "KG"].map(|value| Value::Text(value.into()));
    let entity_id = entity_id(AIRCRAFT);
    let output = planner
        .plan_entity(
            sink(&definition),
            entity_id,
            SinkRow::new(&columns, &values),
        )
        .expect("should plan the aircraft without its original source ID column");
    let expected = expected();
    let bodies = &expected["bodies"]["AC-SEXXX"];
    assert_eq!(
        output.create.as_ref(),
        bodies["create"].as_str().expect("should have a body")
    );
    assert_eq!(
        output.patch.as_ref(),
        bodies["patch"].as_str().expect("should have a body")
    );
    assert_eq!(output.failures, []);
    assert_eq!(output.create.len(), 782);
    assert_eq!(output.patch.len(), 797);

    let create: CreateEntityParams =
        serde_json::from_str(&output.create).expect("should produce a Graph-readable create body");
    assert_eq!(create.entity_uuid, Some(entity_id.entity_uuid));
    assert!(create.read_only);
    let patch: PatchEntityParams =
        serde_json::from_str(&output.patch).expect("should produce a Graph-readable patch body");
    assert_eq!(patch.entity_id, entity_id);
    assert_eq!(patch.archived, Some(false));
    assert_eq!(patch.properties.len(), 1);
}

#[rstest]
#[case::mass(["DC-3", "1946-04-02", "", "KG"], "AC-SEXXX-without-mass", 2)]
#[case::all(["", "", "", "KG"], "AC-SEXXX-empty-properties", 0)]
fn entity_removed_properties(
    #[case] row: [&str; 4],
    #[case] alias: &str,
    #[case] property_count: usize,
) {
    let definition = definition();
    let planner = Planner::new(provenance(), definition.unit_maps().clone());
    let columns = ["MODEL", "FIRST_FLIGHT", "EMPTY_MASS", "MASS_UNIT"]
        .into_iter()
        .collect::<SinkColumns>();
    let values = row.map(|value| Value::Text(value.into()));
    let output = planner
        .plan_entity(
            sink(&definition),
            entity_id(AIRCRAFT),
            SinkRow::new(&columns, &values),
        )
        .expect("should plan the aircraft after removing its mass");
    let expected = expected();
    let bodies = &expected["bodies"][alias];
    assert_eq!(
        output.create.as_ref(),
        bodies["create"].as_str().expect("should have a body")
    );
    assert_eq!(
        output.patch.as_ref(),
        bodies["patch"].as_str().expect("should have a body")
    );
    let patch: JsonValue = serde_json::from_str(&output.patch).expect("should decode the body");
    assert_eq!(patch["properties"].as_array().map(Vec::len), Some(1));
    assert_eq!(patch["properties"][0]["op"], "replace");
    assert_eq!(patch["properties"][0]["path"], json!([]));
    let properties = patch["properties"][0]["property"]["value"]
        .as_object()
        .expect("should replace an object");
    assert_eq!(properties.len(), property_count);
    assert!(!properties.contains_key("https://example.com/@demo/types/property-type/empty-mass/"));
    assert_eq!(output.failures, []);
}

#[test]
fn link_empty_properties() {
    let definition = definition();
    let planner = Planner::new(provenance(), definition.unit_maps().clone());
    let columns = core::iter::empty::<&str>().collect::<SinkColumns>();
    let link = definition
        .link_pipelines()
        .first()
        .expect("should have a link");
    let identities: JsonValue =
        serde_json::from_str(include_str!("../../../tests/fixtures/entity-ids.json"))
            .expect("should read independent literal identities");
    let link_id = entity_id(
        identities["entities"]["L-SEXXX-ESSA"]["entity_id"]
            .as_str()
            .expect("should specify the link identity"),
    );
    let output = planner
        .plan_link(
            link,
            link_id,
            entity_id(AIRCRAFT),
            entity_id(AIRFIELD),
            SinkRow::new(&columns, &[]),
        )
        .expect("should plan a link without source or endpoint columns");
    let expected = expected();
    let bodies = &expected["bodies"]["L-SEXXX-ESSA"];
    assert_eq!(
        output.create.as_ref(),
        bodies["create"].as_str().expect("should have a body")
    );
    assert_eq!(
        output.patch.as_ref(),
        bodies["patch"].as_str().expect("should have a body")
    );
    assert_eq!(output.failures, []);
    let patch: JsonValue = serde_json::from_str(&output.patch).expect("should decode the body");
    assert_eq!(
        patch["properties"],
        json!([{ "op": "replace", "path": [], "property": { "value": {} } }])
    );
}

#[test]
fn archive_exact_body() {
    let planner = Planner::new(provenance(), BTreeMap::new());
    let body = planner
        .plan_archive(entity_id(AIRCRAFT))
        .expect("should plan an archive");
    assert_eq!(
        body.as_ref(),
        expected()["bodies"]["AC-SEXXX"]["archive"]
            .as_str()
            .expect("should have a body")
    );
}

fn nested_properties(reverse: bool) -> PropertyObjectWithMetadata {
    let mut names = ["zeta", "alpha"];
    if reverse {
        names.reverse();
    }
    let nested = names
        .into_iter()
        .map(|name| (name.to_owned(), PropertyValue::String(name.into())))
        .collect::<HashMap<_, _>>();
    PropertyObjectWithMetadata {
        value: names
            .into_iter()
            .map(|name| {
                (
                    BaseUrl::new(format!("https://example.com/property-type/{name}/"))
                        .expect("should parse the property URL"),
                    PropertyWithMetadata::Value(PropertyValueWithMetadata {
                        value: PropertyValue::Object(nested.clone()),
                        metadata: ValueMetadata::default(),
                    }),
                )
            })
            .collect(),
        ..PropertyObjectWithMetadata::default()
    }
}

#[test]
fn request_nested_key_order() {
    let bodies = [false, true].map(|reverse| {
        request::upsert_entity(EntityUpsert {
            entity_id: entity_id(AIRCRAFT),
            entity_type: sink(&definition()).entity_type.clone(),
            properties: nested_properties(reverse),
            provenance: provenance(),
        })
        .expect("should encode the nested properties")
    });
    let [forward, reversed] = bodies;
    assert_eq!(forward.create, reversed.create);
    assert_eq!(forward.patch, reversed.patch);
    assert!(
        forward
            .create
            .contains(r#""value":{"alpha":"alpha","zeta":"zeta"}"#)
    );
}

#[test]
fn entity_failures_redact_values() {
    let definition = definition();
    let planner = Planner::new(provenance(), definition.unit_maps().clone());
    let columns = ["MODEL", "FIRST_FLIGHT", "EMPTY_MASS", "MASS_UNIT"]
        .into_iter()
        .collect::<SinkColumns>();
    let secret = "sensitive-row-content";
    let values = ["DC-3", secret, secret, "KG"].map(|value| Value::Text(value.into()));
    let output = planner
        .plan_entity(
            sink(&definition),
            entity_id(AIRCRAFT),
            SinkRow::new(&columns, &values),
        )
        .expect("should omit unconvertible properties");
    assert_eq!(output.failures.len(), 2);
    assert!(!format!("{:?}", output.failures).contains(secret));
    assert!(!output.create.contains(secret));
    assert!(!output.patch.contains(secret));
}
