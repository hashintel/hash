//! Atomic in-memory Graph behavior for pipeline recovery tests.

use core::mem;
use std::{collections::HashMap, sync::Mutex};

use hash_graph_store::entity::{CreateEntityParams, PatchEntityParams};
use serde_json::value::RawValue;
use type_system::{
    knowledge::{
        entity::{Link, id::EntityId},
        property::{PropertyObjectWithMetadata, PropertyPatchOperation, PropertyWithMetadata},
    },
    principal::actor::ActorEntityUuid,
};

use super::{Graph, GraphResponse, RequestKind};

/// An atomic in-memory Graph with scripted failures and observable editions.
#[derive(Debug, Default)]
pub struct FakeGraph {
    state: Mutex<State>,
}

#[derive(Debug, Default)]
struct State {
    entities: HashMap<EntityId, FakeEntity>,
    rules: Vec<Rule>,
    reachable_for: Option<u64>,
    recorded: Vec<Recorded>,
}

/// The current properties and edition count of one entity.
#[derive(Debug, Clone, PartialEq)]
pub struct FakeEntity {
    pub archived: bool,
    pub properties: PropertyObjectWithMetadata,
    pub editions: u64,
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

#[derive(Debug)]
struct Rule {
    kind: RequestKind,
    entity_id: EntityId,
    status: u16,
    remaining: Option<u32>,
}

impl FakeGraph {
    /// Answers `status` to later matching requests, without changing entities.
    ///
    /// # Panics
    /// Panics if another test operation poisoned the fake state lock.
    pub fn answer(&self, kind: RequestKind, entity_id: EntityId, status: u16) {
        self.state
            .lock()
            .expect("should not poison fake state")
            .rules
            .push(Rule {
                kind,
                entity_id,
                status,
                remaining: None,
            });
    }

    /// Answers `status` to the next `times` matching requests.
    ///
    /// # Panics
    /// Panics if another test operation poisoned the fake state lock.
    pub fn answer_times(&self, kind: RequestKind, entity_id: EntityId, status: u16, times: u32) {
        if times > 0 {
            self.state
                .lock()
                .expect("should not poison fake state")
                .rules
                .push(Rule {
                    kind,
                    entity_id,
                    status,
                    remaining: Some(times),
                });
        }
    }

    /// Removes scripted answers.
    ///
    /// # Panics
    /// Panics if another test operation poisoned the fake state lock.
    pub fn clear_answers(&self) {
        self.state
            .lock()
            .expect("should not poison fake state")
            .rules
            .clear();
    }

    /// Allows `requests` more attempts before becoming unreachable.
    ///
    /// # Panics
    /// Panics if another test operation poisoned the fake state lock.
    pub fn unreachable_after(&self, requests: u64) {
        self.state
            .lock()
            .expect("should not poison fake state")
            .reachable_for = Some(requests);
    }

    /// Restores reachability.
    ///
    /// # Panics
    /// Panics if another test operation poisoned the fake state lock.
    pub fn reachable(&self) {
        self.state
            .lock()
            .expect("should not poison fake state")
            .reachable_for = None;
    }

    /// Drains recorded attempts in their arrival order.
    ///
    /// # Panics
    /// Panics if another test operation poisoned the fake state lock.
    pub fn requests(&self) -> Vec<Recorded> {
        mem::take(
            &mut self
                .state
                .lock()
                .expect("should not poison fake state")
                .recorded,
        )
    }

    /// Returns the current state of an entity, including archived entities.
    ///
    /// # Panics
    /// Panics if another test operation poisoned the fake state lock.
    pub fn entity(&self, entity_id: EntityId) -> Option<FakeEntity> {
        self.state
            .lock()
            .expect("should not poison fake state")
            .entities
            .get(&entity_id)
            .cloned()
    }

    fn handle(
        &self,
        kind: RequestKind,
        actor: ActorEntityUuid,
        bodies: &[&RawValue],
    ) -> GraphResponse {
        let decoded = decode(kind, bodies);
        let entity_ids: Vec<_> = decoded
            .iter()
            .filter_map(|request| request.as_ref().ok().and_then(Request::entity_id))
            .collect();
        let mut state = self.state.lock().expect("should not poison fake state");
        let response = if state.reachable_for == Some(0) {
            GraphResponse::Unreachable
        } else {
            if let Some(remaining) = &mut state.reachable_for {
                *remaining -= 1;
            }
            match decoded.into_iter().collect::<Result<Vec<_>, _>>() {
                Err(status) => GraphResponse::Status(status),
                Ok(requests) => state.apply(kind, &entity_ids, requests),
            }
        };
        state.recorded.push(Recorded {
            kind,
            actor,
            entity_ids,
            bodies: bodies.iter().map(|body| body.get().into()).collect(),
            response,
        });
        response
    }
}

#[expect(
    clippy::unused_async_trait_impl,
    reason = "fake effects occur only when the Graph future is polled"
)]
impl Graph for FakeGraph {
    async fn create(&self, actor: ActorEntityUuid, bodies: &[&RawValue]) -> GraphResponse {
        self.handle(RequestKind::Create, actor, bodies)
    }

    async fn patch(&self, actor: ActorEntityUuid, bodies: &[&RawValue]) -> GraphResponse {
        self.handle(RequestKind::Patch, actor, bodies)
    }
}

enum Request {
    Create(Box<CreateEntityParams>),
    Patch(Box<PatchEntityParams>),
}

impl Request {
    fn entity_id(&self) -> Option<EntityId> {
        match self {
            Self::Create(request) => request.entity_uuid.map(|entity_uuid| EntityId {
                web_id: request.web_id,
                entity_uuid,
                draft_id: None,
            }),
            Self::Patch(request) => Some(request.entity_id),
        }
    }
}

fn decode(kind: RequestKind, bodies: &[&RawValue]) -> Vec<Result<Request, u16>> {
    bodies
        .iter()
        .map(|body| match kind {
            RequestKind::Create => serde_json::from_str(body.get())
                .map(|request| Request::Create(Box::new(request)))
                .map_err(|_error| 400),
            RequestKind::Patch => serde_json::from_str(body.get())
                .map(|request| Request::Patch(Box::new(request)))
                .map_err(|_error| 422),
        })
        .collect()
}

impl State {
    fn apply(
        &mut self,
        kind: RequestKind,
        ids: &[EntityId],
        requests: Vec<Request>,
    ) -> GraphResponse {
        if let Some(index) = self
            .rules
            .iter()
            .position(|rule| rule.kind == kind && ids.contains(&rule.entity_id))
        {
            let rule = self
                .rules
                .get_mut(index)
                .expect("should find the matched rule");
            let status = rule.status;
            if let Some(remaining) = &mut rule.remaining {
                *remaining -= 1;
            }
            if rule.remaining == Some(0) {
                self.rules.remove(index);
            }
            return GraphResponse::Status(status);
        }
        let mut entities = self.entities.clone();
        for request in requests {
            if let Err(status) = apply(&mut entities, request) {
                return GraphResponse::Status(status);
            }
        }
        self.entities = entities;
        GraphResponse::Applied
    }
}

fn apply(entities: &mut HashMap<EntityId, FakeEntity>, request: Request) -> Result<(), u16> {
    match request {
        Request::Create(request) => {
            let entity_id = EntityId {
                web_id: request.web_id,
                entity_uuid: request.entity_uuid.ok_or(400_u16)?,
                draft_id: None,
            };
            if entities.contains_key(&entity_id) {
                return Err(409);
            }
            if let Some(Link::Directed { source, target }) = request.link_data
                && (!entities.contains_key(&source.entity_id)
                    || !entities.contains_key(&target.entity_id))
            {
                return Err(500);
            }
            entities.insert(
                entity_id,
                FakeEntity {
                    archived: false,
                    properties: request.properties,
                    editions: 1,
                },
            );
        }
        Request::Patch(request) => {
            let entity = entities.get_mut(&request.entity_id).ok_or(404_u16)?;
            let properties = match request.properties.as_slice() {
                [] => &entity.properties,
                [
                    PropertyPatchOperation::Replace {
                        path,
                        property: PropertyWithMetadata::Object(properties),
                    },
                ] if path.is_empty() => properties,
                _ => return Err(500),
            };
            let archived = request.archived.unwrap_or(entity.archived);
            if archived != entity.archived || *properties != entity.properties {
                entity.properties = properties.clone();
                entity.archived = archived;
                entity.editions += 1;
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use serde_json::{Value, json, value::RawValue};
    use similar_asserts::assert_eq;
    use type_system::{knowledge::entity::id::EntityId, principal::actor::ActorEntityUuid};
    use uuid::Uuid;

    use super::FakeGraph;
    use crate::graph::{Graph as _, GraphResponse};

    fn body(alias: &str, request: &str) -> Box<RawValue> {
        let catalog: Value =
            serde_json::from_str(include_str!("../../tests/fixtures/requests.json"))
                .expect("should decode independent bodies");
        RawValue::from_string(
            catalog["bodies"][alias][request]
                .as_str()
                .expect("should name a body")
                .to_owned(),
        )
        .expect("should decode body")
    }
    fn id(alias: &str) -> EntityId {
        let catalog: Value =
            serde_json::from_str(include_str!("../../tests/fixtures/entity-ids.json"))
                .expect("should decode independent IDs");
        serde_json::from_value(catalog["entities"][alias]["entity_id"].clone())
            .expect("should parse identity")
    }
    fn actor() -> ActorEntityUuid {
        ActorEntityUuid::new(Uuid::nil())
    }

    #[tokio::test]
    async fn bulk_failure_is_atomic() {
        let graph = FakeGraph::default();
        assert_eq!(
            graph.create(actor(), &[&body("AC-SEXXX", "create")]).await,
            GraphResponse::Applied
        );
        assert_eq!(
            graph
                .create(
                    actor(),
                    &[&body("AC-N100", "create"), &body("AC-SEXXX", "create")]
                )
                .await,
            GraphResponse::Status(409)
        );
        assert_eq!(graph.entity(id("AC-N100")), None);
        assert_eq!(
            graph
                .patch(
                    actor(),
                    &[
                        &body("AC-SEXXX-empty-properties", "patch"),
                        &body("AC-N100", "patch")
                    ]
                )
                .await,
            GraphResponse::Status(404)
        );
        assert_eq!(
            graph
                .entity(id("AC-SEXXX"))
                .expect("should retain entity")
                .editions,
            1
        );
        assert_eq!(
            graph
                .entity(id("AC-SEXXX"))
                .expect("should retain properties")
                .properties
                .value
                .len(),
            3
        );
    }

    #[tokio::test]
    async fn root_replacement_and_replay_editions() {
        let graph = FakeGraph::default();
        assert_eq!(
            graph.create(actor(), &[&body("AC-SEXXX", "create")]).await,
            GraphResponse::Applied
        );
        for (alias, request, editions, properties, archived) in [
            ("AC-SEXXX", "patch", 1, 3, false),
            ("AC-SEXXX-empty-properties", "patch", 2, 0, false),
            ("AC-SEXXX-empty-properties", "patch", 2, 0, false),
            ("AC-SEXXX", "archive", 3, 0, true),
            ("AC-SEXXX", "archive", 3, 0, true),
        ] {
            assert_eq!(
                graph.patch(actor(), &[&body(alias, request)]).await,
                GraphResponse::Applied
            );
            let entity = graph.entity(id("AC-SEXXX")).expect("should retain entity");
            assert_eq!(
                (
                    entity.editions,
                    entity.properties.value.len(),
                    entity.archived
                ),
                (editions, properties, archived)
            );
        }
    }

    #[tokio::test]
    async fn malformed_body_records_readable_identities() {
        let graph = FakeGraph::default();
        let malformed = serde_json::value::to_raw_value(&json!({"unknown":"field"}))
            .expect("should encode malformed create");
        assert_eq!(
            graph
                .create(actor(), &[&body("AC-SEXXX", "create"), &malformed])
                .await,
            GraphResponse::Status(400)
        );
        assert_eq!(graph.requests()[0].entity_ids, [id("AC-SEXXX")]);
        assert_eq!(graph.entity(id("AC-SEXXX")), None);
    }
}
