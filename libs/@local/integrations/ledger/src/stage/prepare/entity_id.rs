//! The ids of the entities and links Prepare writes, derived from the records of the source.

use type_system::{
    knowledge::entity::id::{EntityId, EntityUuid},
    ontology::id::VersionedUrl,
    principal::actor_group::WebId,
};
use uuid::Uuid;

const NAMESPACE: Uuid = Uuid::from_u128(0xD6E2_C7A1_F84B_4E3A_9C0D_5B7F_1E3A_2D4C);

/// Derives a live entity ID from the integration namespace, entity type, and source record ID.
#[must_use]
pub(crate) fn derive_entity_id(
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

/// One end of a link: the entity of `entity_type` that `source_id` identifies in the source.
#[derive(Debug, Clone, Copy)]
pub(crate) struct LinkEndpoint<'a> {
    pub entity_type: &'a VersionedUrl,
    pub source_id: &'a str,
}

/// Derives the ID of the link of `link_type` from `left` to `right`.
///
/// The ID is derived from the link's type and both endpoints, so the same pair linked the other
/// way round is a different link.
#[must_use]
pub(crate) fn derive_link_id(
    web_id: WebId,
    namespace: &str,
    link_type: &VersionedUrl,
    left: LinkEndpoint<'_>,
    right: LinkEndpoint<'_>,
) -> EntityId {
    let link_source_id = format!(
        "{}::{}::{}::{}",
        left.entity_type, left.source_id, right.entity_type, right.source_id
    );
    derive_entity_id(web_id, namespace, link_type, &link_source_id)
}

#[cfg(test)]
mod tests {
    use core::str::FromStr as _;

    use pretty_assertions::{assert_eq, assert_ne};
    use serde::Deserialize;
    use type_system::{
        knowledge::entity::id::EntityUuid, ontology::id::VersionedUrl,
        principal::actor_group::WebId,
    };
    use uuid::Uuid;

    use super::{LinkEndpoint, derive_entity_id, derive_link_id};

    const NAMESPACE: &str = "aviation";

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

    fn web_id() -> WebId {
        WebId::new(Uuid::from_u128(0xA2C8_E6C7_485D_4B54_A248_53C9_B9B0_14A2))
    }

    fn url(name: &str) -> VersionedUrl {
        VersionedUrl::from_str(&format!("https://hash.ai/@h/types/entity-type/{name}/v/1"))
            .expect("should be a valid versioned URL")
    }

    fn link(left: (&str, &str), right: (&str, &str)) -> EntityUuid {
        derive_link_id(
            web_id(),
            NAMESPACE,
            &url("stationed-at"),
            LinkEndpoint {
                entity_type: &url(left.0),
                source_id: left.1,
            },
            LinkEndpoint {
                entity_type: &url(right.0),
                source_id: right.1,
            },
        )
        .entity_uuid
    }

    #[test]
    fn derive_entity_id_recorded_vectors() {
        let cases: Vec<Case> = serde_json::from_str(include_str!(
            "../../../tests/fixtures/entity-ids-typescript.json"
        ))
        .expect("entity ID fixtures should be valid");
        for case in cases {
            let entity_id =
                derive_entity_id(web_id(), &case.ns, &case.entity_type, &case.entity_id);
            assert_eq!(
                entity_id.entity_uuid, case.uuid,
                "entity UUID should match the recorded value: {}",
                case.note
            );
            assert_eq!(
                entity_id.to_string(),
                case.composite.replace("web-fixture", &web_id().to_string()),
                "composite ID should match the recorded value: {}",
                case.note
            );
            assert!(
                entity_id.draft_id.is_none(),
                "derived entity ID should identify a live entity"
            );
        }
    }

    #[test]
    fn entity_id_from_source_record() {
        assert_eq!(
            derive_entity_id(web_id(), NAMESPACE, &url("aircraft"), "G-ABCD").entity_uuid,
            EntityUuid::new(Uuid::from_u128(0x119A_2C54_334F_537F_97DB_9D7B_BB67_B3B1)),
            "should match the UUID the TypeScript engine derives"
        );
    }

    #[test]
    fn link_id_recorded_vector() {
        let url = |name: &str| {
            VersionedUrl::from_str(&format!("https://x/@t/types/entity-type/{name}/v/1"))
                .expect("should be a valid versioned URL")
        };
        let link_id = derive_link_id(
            web_id(),
            "conn-a",
            &url("stored-at"),
            LinkEndpoint {
                entity_type: &url("material"),
                source_id: "M-0001",
            },
            LinkEndpoint {
                entity_type: &url("plant"),
                source_id: "P-0100",
            },
        );
        assert_eq!(
            link_id.entity_uuid,
            EntityUuid::new(Uuid::from_u128(0x25BB_B6E3_3E0A_53C2_A2F3_B8B8_3F7F_F314)),
            "should match the recorded link UUID of the fixture"
        );
    }

    #[test]
    fn link_id_from_type_and_endpoints() {
        let stationed_at = link(("aircraft", "G-ABCD"), ("airfield", "EGLL"));
        assert_eq!(
            stationed_at,
            EntityUuid::new(Uuid::from_u128(0x4AB1_1B11_9B66_5F0F_8341_6877_67FA_D6CF)),
            "should match the UUID the TypeScript engine derives for the link"
        );
        assert_eq!(
            stationed_at,
            link(("aircraft", "G-ABCD"), ("airfield", "EGLL")),
            "the same link should keep its ID"
        );
        assert_ne!(
            stationed_at,
            link(("aircraft", "G-ABCD"), ("airfield", "EGKK")),
            "another endpoint should be another link"
        );
        assert_ne!(
            stationed_at,
            link(("airfield", "EGLL"), ("aircraft", "G-ABCD")),
            "the reversed link should be another link"
        );
    }
}
