//! Atomic in-memory Graph behavior for recovery tests.

use std::sync::Mutex;

use serde_json::value::RawValue;
use type_system::{knowledge::entity::id::EntityId, principal::actor::ActorEntityUuid};

use super::{Graph, GraphResponse, RequestKind};

/// An atomic in-memory Graph with scripted failures and recorded requests.
#[derive(Debug, Default)]
pub struct FakeGraph {
    recorded: Mutex<Vec<Recorded>>,
}

/// One attempted request, including exact body text and its result.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Recorded {
    pub kind: RequestKind,
    pub actor: ActorEntityUuid,
    pub entity_ids: Vec<EntityId>,
    pub bodies: Vec<Box<str>>,
    pub response: GraphResponse,
}

impl FakeGraph {
    /// Answers `status` to later requests of `kind` for `entity_id`, without changing entities.
    pub fn answer(&self, kind: RequestKind, entity_id: EntityId, status: u16) {
        unimplemented!()
    }

    /// The requests received so far, in order.
    #[must_use]
    pub fn requests(&self) -> Vec<Recorded> {
        unimplemented!()
    }
}

impl Graph for FakeGraph {
    async fn create(&self, actor: ActorEntityUuid, bodies: &[&RawValue]) -> GraphResponse {
        unimplemented!()
    }

    async fn patch(&self, actor: ActorEntityUuid, bodies: &[&RawValue]) -> GraphResponse {
        unimplemented!()
    }
}
