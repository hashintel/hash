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
