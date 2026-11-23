// From `engine/src/entity_id.rs:1-24`
use type_system::{
    knowledge::entity::id::{EntityId, EntityUuid},
    ontology::id::VersionedUrl,
    principal::actor_group::WebId,
};
use uuid::Uuid;

const NAMESPACE: Uuid = Uuid::from_u128(0xD6E2_C7A1_F84B_4E3A_9C0D_5B7F_1E3A_2D4C);

/// Derives a live entity ID from the integration namespace, entity type, and source record ID.
#[must_use]
pub fn derive_entity_id(
    web_id: WebId,
    namespace: &str,
    entity_type: &VersionedUrl,
    source_id: &str,
) -> EntityId {
    let name = format!("{namespace}::{entity_type}::{source_id}");
    EntityId {
        web_id,
        entity_uuid: EntityUuid::new(Uuid::new_v5(&NAMESPACE, name.as_bytes())),
        draft_id: None,
    }
}

// From `engine/src/graph/mod.rs:66-71`
/// One end of a link: the entity of `entity_type` that `source_id` identifies in the source.
#[derive(Debug, Clone, Copy)]
pub struct LinkEndpoint<'a> {
    pub entity_type: &'a VersionedUrl,
    pub source_id: &'a str,
}

// From `engine/src/graph/mod.rs:85-118`
impl LinkUpsert {
    /// An upsert of the link of `link_type` from `left` to `right`.
    ///
    /// The link's ID is derived from its type and both endpoints, so the same pair linked the
    /// other way round is a different link.
    #[must_use]
    pub fn new(
        web_id: WebId,
        namespace: &str,
        link_type: VersionedUrl,
        left: LinkEndpoint<'_>,
        right: LinkEndpoint<'_>,
        properties: Option<PropertyObjectWithMetadata>,
        provenance: ProvidedEntityEditionProvenance,
    ) -> Self {
        let link_source_id = format!(
            "{}::{}::{}::{}",
            left.entity_type, left.source_id, right.entity_type, right.source_id
        );
        Self {
            link_id: derive_entity_id(web_id, namespace, &link_type, &link_source_id),
            left_entity_id: derive_entity_id(web_id, namespace, left.entity_type, left.source_id),
            right_entity_id: derive_entity_id(
                web_id,
                namespace,
                right.entity_type,
                right.source_id,
            ),
            link_type,
            properties,
            provenance,
        }
    }
}

// From `engine/tests/entity_id.rs:1-46`
//! Deterministic entity ID derivation.

use hash_integrations_engine::derive_entity_id;
use pretty_assertions::assert_eq;
use serde::Deserialize;
use type_system::{
    knowledge::entity::id::EntityUuid, ontology::id::VersionedUrl, principal::actor_group::WebId,
};
use uuid::Uuid;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Case {
    ns: String,
    entity_type: VersionedUrl,
    entity_id: String,
    uuid: EntityUuid,
    composite: String,
    note: String,
}

#[test]
fn derive_entity_id_recorded_vectors() {
    let web_id = WebId::new(Uuid::from_u128(0xA2C8_E6C7_485D_4B54_A248_53C9_B9B0_14A2));
    let cases: Vec<Case> =
        serde_json::from_str(include_str!("fixtures/entity-ids-typescript.json"))
            .expect("entity ID fixtures should be valid");
    for case in cases {
        let entity_id = derive_entity_id(web_id, &case.ns, &case.entity_type, &case.entity_id);
        assert_eq!(
            entity_id.entity_uuid, case.uuid,
            "entity UUID should match the recorded value: {}",
            case.note
        );
        assert_eq!(
            entity_id.to_string(),
            case.composite.replace("web-fixture", &web_id.to_string()),
            "composite ID should match the recorded value: {}",
            case.note
        );
        assert!(
            entity_id.draft_id.is_none(),
            "derived entity ID should identify a live entity"
        );
    }
}

// From `engine/src/graph/tests.rs:1-29`
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

// From `engine/src/graph/tests.rs:60-91`
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

// From `engine/src/graph/tests.rs:108-146`
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
