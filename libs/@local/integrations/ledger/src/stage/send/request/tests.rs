// From `engine/src/graph/plan/tests.rs:1-28`
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

// From `engine/src/graph/plan/tests.rs:72-98`
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

// From `engine/src/graph/plan/tests.rs:142-254`
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

// From `engine/src/graph/tests.rs:31-47`
fn source() -> SourceProvenance {
    SourceProvenance {
        ty: SourceType::Webpage,
        entity_id: None,
        authors: vec!["CAA".to_owned()],
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
    }
}

// From `engine/src/graph/tests.rs:173-190`
#[test]
fn integration_provenance_wire_shape() {
    assert_eq!(
        serde_json::to_value(integration_provenance(source()))
            .expect("provenance should serialize"),
        json!({
            "actorType": "machine",
            "origin": {"type": "api"},
            "sources": [{
                "type": "integration",
                "authors": ["CAA"],
                "location": {"name": "aviation"},
                "loadedAt": "2026-11-06T12:00:00.000000000Z",
            }],
        }),
        "should record a machine writing through the API from an integration source"
    );
}
