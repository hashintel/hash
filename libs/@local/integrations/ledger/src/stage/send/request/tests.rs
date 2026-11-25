use std::collections::HashMap;

use hash_graph_store::entity::{CreateEntityParams, PatchEntityParams};
use pretty_assertions::assert_eq;
use serde_json::json;
use time::OffsetDateTime;
use type_system::{
    knowledge::{
        PropertyValue,
        entity::{
            id::{EntityId, EntityUuid},
            provenance::ProvidedEntityEditionProvenance,
        },
        property::{PropertyObjectWithMetadata, PropertyValueWithMetadata, PropertyWithMetadata},
        value::metadata::ValueMetadata,
    },
    ontology::{BaseUrl, VersionedUrl},
    principal::actor_group::WebId,
    provenance::{Location, SourceProvenance, SourceType},
};
use uuid::Uuid;

use super::{archive, create, integration_provenance, patch};
use crate::{
    RunId,
    sync_table::{Op, SyncRow},
};

const TYPES: &str = "https://example.com/@demo/types";

fn url(path: &str) -> VersionedUrl {
    format!("{TYPES}/{path}/v/1")
        .parse()
        .expect("should be a valid versioned URL")
}

fn web_id() -> WebId {
    WebId::new(Uuid::from_u128(0xA2C8_E6C7_485D_4B54_A248_53C9_B9B0_14A2))
}

/// The id of the entity `name`, a version 5 UUID as Prepare derives one.
fn entity_id(name: &str) -> EntityId {
    EntityId {
        web_id: web_id(),
        entity_uuid: EntityUuid::new(Uuid::new_v5(&Uuid::NAMESPACE_OID, name.as_bytes())),
        draft_id: None,
    }
}

/// The aircraft `SE-XXX`.
fn aircraft_id() -> EntityId {
    entity_id("SE-XXX")
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

/// A row of the aircraft `SE-XXX`, or of a link from it to an airfield for a link `op`.
fn row(op: Op, properties: PropertyObjectWithMetadata) -> SyncRow {
    let link = matches!(op, Op::CreateLink | Op::UpdateLink | Op::ArchiveLink);
    SyncRow {
        run: RunId::new(),
        seq: 1,
        op,
        entity_id: if link {
            entity_id("SE-XXX based at ESSA")
        } else {
            aircraft_id()
        },
        entity_type: url(if link {
            "entity-type/based-at"
        } else {
            "entity-type/aircraft"
        }),
        left_entity_id: link.then(aircraft_id),
        right_entity_id: link.then(|| entity_id("ESSA")),
        properties,
    }
}

#[test]
fn requests_graph_readable() {
    let aircraft = row(
        Op::CreateEntity,
        properties(&["model", "first-flight", "empty-mass"]),
    );

    let created: CreateEntityParams = serde_json::from_str(
        create(&aircraft, &provenance())
            .expect("should build the create")
            .get(),
    )
    .expect("the Graph should read the create request");
    assert_eq!(created.web_id, web_id());
    assert_eq!(created.entity_uuid, Some(aircraft_id().entity_uuid));
    assert!(
        created.read_only,
        "integration entities should be read-only"
    );
    assert_eq!(created.properties.value.len(), 3);
    assert!(created.link_data.is_none(), "an entity should have no ends");

    let patched: PatchEntityParams = serde_json::from_str(
        patch(&aircraft, &provenance())
            .expect("should build the patch")
            .get(),
    )
    .expect("the Graph should read the patch request");
    assert_eq!(patched.entity_id, aircraft_id());
    assert_eq!(
        patched.archived,
        Some(false),
        "a patch should revive the entity"
    );
    assert_eq!(patched.properties.len(), 3);

    let archived: PatchEntityParams = serde_json::from_str(
        archive(&aircraft, &provenance())
            .expect("should build the archive")
            .get(),
    )
    .expect("the Graph should read the archive request");
    assert_eq!(archived.entity_id, aircraft_id());
    assert_eq!(archived.archived, Some(true));

    let link: CreateEntityParams = serde_json::from_str(
        create(
            &row(Op::CreateLink, PropertyObjectWithMetadata::default()),
            &provenance(),
        )
        .expect("should build the create")
        .get(),
    )
    .expect("the Graph should read the create request of a link");
    assert!(link.link_data.is_some(), "a link should name its ends");
}

#[test]
fn link_without_ends() {
    let mut link = row(Op::CreateLink, PropertyObjectWithMetadata::default());
    link.right_entity_id = None;

    let error = create(&link, &provenance()).expect_err("should refuse a link without an end");

    assert_eq!(error.current_context().entity_id, link.entity_id);
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
    let forward = row(Op::UpdateEntity, properties(&names));
    let backward = row(Op::UpdateEntity, properties(&reversed));

    for build in [create, patch] {
        assert_eq!(
            build(&forward, &provenance())
                .expect("should build the body")
                .get(),
            build(&backward, &provenance())
                .expect("should build the body")
                .get(),
            "the same properties should encode to the same bytes"
        );
    }
}

#[test]
fn archive_payload() {
    let body = archive(
        &row(Op::ArchiveEntity, PropertyObjectWithMetadata::default()),
        &provenance(),
    )
    .expect("should build the archive");
    assert_eq!(
        body.get(),
        format!(
            r#"{{"archived":true,"entityId":"{}","provenance":{{"actorType":"machine","origin":{{"type":"api"}},"sources":[{{"loadedAt":"2026-11-06T12:00:00.000000000Z","location":{{"name":"aviation"}},"type":"integration"}}]}}}}"#,
            aircraft_id()
        ),
        "the archive request should be built exactly"
    );
}

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
