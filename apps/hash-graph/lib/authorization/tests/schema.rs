use graph_types::{
    account::AccountId,
    knowledge::entity::{EntityId, EntityUuid},
    provenance::OwnedById,
};
use uuid::Uuid;

pub const ALICE: AccountId = AccountId::new(Uuid::from_fields(1, 0, 0, &[0; 8]));
pub const BOB: AccountId = AccountId::new(Uuid::from_fields(2, 0, 0, &[0; 8]));

pub const ENTITY_A: EntityId = EntityId {
    owned_by_id: OwnedById::new(ALICE.into_uuid()),
    entity_uuid: EntityUuid::new(Uuid::from_fields(0, 1, 0, &[0; 8])),
};
pub const ENTITY_B: EntityId = EntityId {
    owned_by_id: OwnedById::new(BOB.into_uuid()),
    entity_uuid: EntityUuid::new(Uuid::from_fields(0, 2, 0, &[0; 8])),
};
