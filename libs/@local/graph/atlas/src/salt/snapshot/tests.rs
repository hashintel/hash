use std::collections::{HashMap, HashSet};

use type_system::{
    knowledge::entity::id::{EntityEditionId, EntityId, EntityUuid},
    ontology::VersionedUrl,
    principal::actor_group::WebId,
};
use uuid::Uuid;

use crate::salt::snapshot::{EntityAtEdition, LinkCandidate, LinkRejection, authorize_link};

#[test]
fn admits_only_the_selected_visible_editions_and_all_type_metadata() {
    let link = entity_at(10);
    let left = entity_at(20);
    let right = entity_at(30);
    let types = [
        entity_type("link"),
        entity_type("source"),
        entity_type("target"),
    ];
    let candidate = LinkCandidate {
        link,
        left,
        right,
        required_entity_types: &types,
    };
    let permitted_entities = permission_map([link, left, right]);
    let permitted_types = types.iter().cloned().collect();

    let authorized = authorize_link(candidate, &permitted_entities, &permitted_types)
        .expect("complete permissions should admit the link");

    assert_eq!(authorized.candidate().link, link);
    assert_eq!(authorized.candidate().left, left);
    assert_eq!(authorized.candidate().right, right);
}

#[test]
fn same_entity_with_a_different_edition_fails_closed() {
    let link = entity_at(40);
    let left = entity_at(50);
    let right = entity_at(60);
    let candidate = LinkCandidate {
        link,
        left,
        right,
        required_entity_types: &[],
    };
    let mut permitted_entities = permission_map([link, left, right]);
    permitted_entities.insert(
        left.entity_id,
        vec![EntityEditionId::new(Uuid::from_u128(9_999))],
    );

    assert_eq!(
        authorize_link(candidate, &permitted_entities, &HashSet::new()),
        Err(LinkRejection::LeftEndpoint)
    );
}

#[test]
fn reports_the_first_missing_required_type_in_input_order() {
    let link = entity_at(70);
    let left = entity_at(80);
    let right = entity_at(90);
    let types = [
        entity_type("link"),
        entity_type("source"),
        entity_type("target"),
    ];
    let candidate = LinkCandidate {
        link,
        left,
        right,
        required_entity_types: &types,
    };
    let permitted_entities = permission_map([link, left, right]);
    let permitted_types = HashSet::from([types[0].clone(), types[2].clone()]);

    assert_eq!(
        authorize_link(candidate, &permitted_entities, &permitted_types),
        Err(LinkRejection::EntityType { index: 1 })
    );
}

fn permission_map(
    entities: impl IntoIterator<Item = EntityAtEdition>,
) -> HashMap<EntityId, Vec<EntityEditionId>> {
    entities
        .into_iter()
        .map(|entity| (entity.entity_id, vec![entity.edition_id]))
        .collect()
}

fn entity_at(seed: u128) -> EntityAtEdition {
    EntityAtEdition {
        entity_id: EntityId {
            web_id: WebId::new(Uuid::from_u128(seed)),
            entity_uuid: EntityUuid::new(Uuid::from_u128(seed + 1)),
            draft_id: None,
        },
        edition_id: EntityEditionId::new(Uuid::from_u128(seed + 2)),
    }
}

fn entity_type(slug: &str) -> VersionedUrl {
    format!("https://hash.ai/@example/types/entity-type/{slug}/v/1")
        .parse()
        .expect("fixture entity type should parse")
}
