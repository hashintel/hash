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
