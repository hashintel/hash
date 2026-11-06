use core::str::FromStr as _;

use pretty_assertions::assert_eq;
use serde_json::json;
use time::OffsetDateTime;
use type_system::{
    knowledge::{entity::id::EntityUuid, property::PropertyObjectWithMetadata},
    ontology::VersionedUrl,
    principal::actor_group::WebId,
    provenance::{Location, SourceProvenance, SourceType},
};
use uuid::Uuid;

use super::{
    Archive, EntityUpsert, GraphOperation, LinkEndpoint, LinkUpsert, OperationKind,
    integration_provenance,
};
use crate::derive_entity_id;

const NAMESPACE: &str = "aviation";

fn web_id() -> WebId {
    WebId::new(Uuid::from_u128(0xA2C8_E6C7_485D_4B54_A248_53C9_B9B0_14A2))
}

fn url(name: &str) -> VersionedUrl {
    VersionedUrl::from_str(&format!("https://hash.ai/@h/types/entity-type/{name}/v/1"))
        .expect("should be a valid versioned URL")
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

fn aircraft(source_id: &str) -> EntityUpsert {
    EntityUpsert::new(
        web_id(),
        NAMESPACE,
        url("aircraft"),
        source_id,
        PropertyObjectWithMetadata::default(),
        integration_provenance(source()),
    )
}

fn stationed_at(aircraft: &str, airfield: &str) -> LinkUpsert {
    LinkUpsert::new(
        web_id(),
        NAMESPACE,
        url("stationed-at"),
        LinkEndpoint {
            entity_type: &url("aircraft"),
            source_id: aircraft,
        },
        LinkEndpoint {
            entity_type: &url("airfield"),
            source_id: airfield,
        },
        None,
        integration_provenance(source()),
    )
}

#[test]
fn entity_id_from_source_record() {
    let upsert = aircraft("G-ABCD");
    assert_eq!(
        upsert.entity_id,
        derive_entity_id(web_id(), NAMESPACE, &url("aircraft"), "G-ABCD"),
        "should derive the ID from the namespace, type and source ID"
    );
    assert_eq!(
        upsert.entity_id.entity_uuid,
        EntityUuid::new(Uuid::from_u128(0x119A_2C54_334F_537F_97DB_9D7B_BB67_B3B1)),
        "should match the UUID the TypeScript engine derives"
    );
}

#[test]
fn link_endpoints_match_entities() {
    let link = stationed_at("G-ABCD", "EGLL");
    assert_eq!(
        link.left_entity_id,
        aircraft("G-ABCD").entity_id,
        "the left endpoint should be the entity its source record writes"
    );
    assert_eq!(
        link.right_entity_id,
        derive_entity_id(web_id(), NAMESPACE, &url("airfield"), "EGLL"),
        "the right endpoint should be the entity its source record writes"
    );
}

#[test]
fn link_id_from_type_and_endpoints() {
    let link = stationed_at("G-ABCD", "EGLL");
    assert_eq!(
        link.link_id.entity_uuid,
        EntityUuid::new(Uuid::from_u128(0x4AB1_1B11_9B66_5F0F_8341_6877_67FA_D6CF)),
        "should match the UUID the TypeScript engine derives for the link"
    );
    assert_eq!(
        link.link_id,
        stationed_at("G-ABCD", "EGLL").link_id,
        "the same link should keep its ID"
    );
    assert_ne!(
        link.link_id,
        stationed_at("G-ABCD", "EGKK").link_id,
        "another endpoint should be another link"
    );
    assert_ne!(
        link.link_id,
        LinkUpsert::new(
            web_id(),
            NAMESPACE,
            url("stationed-at"),
            LinkEndpoint {
                entity_type: &url("airfield"),
                source_id: "EGLL",
            },
            LinkEndpoint {
                entity_type: &url("aircraft"),
                source_id: "G-ABCD",
            },
            None,
            integration_provenance(source()),
        )
        .link_id,
        "the reversed link should be another link"
    );
}

#[test]
fn operations_sort_into_application_order() {
    let archive = Archive {
        entity_id: aircraft("G-ABCD").entity_id,
        provenance: integration_provenance(source()),
    };
    let mut operations = [
        GraphOperation::ArchiveEntity(archive.clone()),
        GraphOperation::UpsertLink(stationed_at("G-ABCD", "EGLL")),
        GraphOperation::ArchiveLink(archive),
        GraphOperation::UpsertEntity(aircraft("G-ABCD")),
    ];
    operations.sort_by_key(GraphOperation::kind);
    assert_eq!(
        operations.map(|operation| operation.kind()),
        [
            OperationKind::UpsertEntity,
            OperationKind::UpsertLink,
            OperationKind::ArchiveLink,
            OperationKind::ArchiveEntity,
        ],
        "entities should exist before links to them, and links should go before their entities"
    );
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
