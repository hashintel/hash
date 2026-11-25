use std::collections::HashMap;

use error_stack::Report;
use hash_graph_store::entity::{CreateEntityParams, PatchEntityParams};
use pretty_assertions::assert_eq;
use serde::de::DeserializeOwned;
use serde_json::value::RawValue;
use time::OffsetDateTime;
use type_system::{
    knowledge::{
        PropertyValue,
        entity::{
            Link,
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

use super::{RequestError, archive, create, integration_provenance, patch};
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

/// The provenance of a run that read a web page, which is recorded as an integration.
fn provenance() -> ProvidedEntityEditionProvenance {
    integration_provenance(SourceProvenance {
        ty: SourceType::Webpage,
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

fn text(body: Result<Box<RawValue>, Report<RequestError>>) -> String {
    body.expect("should build the body").get().to_owned()
}

/// The body as the Graph's own request type reads it.
fn read<T: DeserializeOwned>(body: Result<Box<RawValue>, Report<RequestError>>) -> T {
    serde_json::from_str(&text(body)).expect("the Graph should read the body")
}

#[test]
fn requests_graph_readable() {
    let aircraft = row(
        Op::CreateEntity,
        properties(&["model", "first-flight", "empty-mass"]),
    );

    let created: CreateEntityParams = read(create(&aircraft, &provenance()));
    assert_eq!(created.web_id, web_id());
    assert_eq!(created.entity_uuid, Some(aircraft_id().entity_uuid));
    assert!(
        created.read_only,
        "integration entities should be read-only"
    );
    assert_eq!(created.properties.value.len(), 3);
    assert!(created.link_data.is_none(), "an entity should have no ends");

    let patched: PatchEntityParams = read(patch(&aircraft, &provenance()));
    assert_eq!(patched.entity_id, aircraft_id());
    assert_eq!(
        patched.archived,
        Some(false),
        "a patch should revive the entity"
    );
    assert_eq!(patched.properties.len(), 3);

    let archived: PatchEntityParams = read(archive(&aircraft, &provenance()));
    assert_eq!(archived.entity_id, aircraft_id());
    assert_eq!(archived.archived, Some(true));

    // Send creates a link that an update did not find, so an update row also names its ends.
    for op in [Op::CreateLink, Op::UpdateLink] {
        let link: CreateEntityParams = read(create(&row(op, properties(&[])), &provenance()));
        let Some(Link::Directed { source, target }) = link.link_data else {
            panic!("a link should name its ends");
        };
        assert_eq!(
            source.entity_id,
            aircraft_id(),
            "the left end is the source"
        );
        assert_eq!(
            target.entity_id,
            entity_id("ESSA"),
            "the right end is the target"
        );
    }

    let unchanged: PatchEntityParams =
        read(patch(&row(Op::UpdateLink, properties(&[])), &provenance()));
    assert!(unchanged.properties.is_empty(), "should change no property");
    assert_eq!(unchanged.archived, Some(false));
}

#[test]
fn link_without_ends() {
    let mut link = row(Op::CreateLink, properties(&[]));
    link.right_entity_id = None;

    let error = create(&link, &provenance()).expect_err("should refuse a link without an end");

    assert_eq!(error.current_context().entity_id, link.entity_id);
}

#[test]
fn payload_property_order() {
    let forward = row(
        Op::UpdateEntity,
        properties(&["model", "operator", "registry"]),
    );
    let backward = row(
        Op::UpdateEntity,
        properties(&["registry", "operator", "model"]),
    );

    for build in [create, patch] {
        assert_eq!(
            text(build(&forward, &provenance())),
            text(build(&backward, &provenance())),
            "the same properties should encode to the same bytes"
        );
    }
}

/// Pins the whole body, and with it the provenance: a machine writing through the API from an
/// integration source.
#[test]
fn archive_payload() {
    assert_eq!(
        text(archive(
            &row(Op::ArchiveEntity, properties(&[])),
            &provenance()
        )),
        format!(
            r#"{{"archived":true,"entityId":"{}","provenance":{{"actorType":"machine","origin":{{"type":"api"}},"sources":[{{"loadedAt":"2026-11-06T12:00:00.000000000Z","location":{{"name":"aviation"}},"type":"integration"}}]}}}}"#,
            aircraft_id()
        ),
    );
}
