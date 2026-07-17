use std::collections::{HashMap, HashSet};

use type_system::{
    knowledge::entity::id::{EntityEditionId, EntityId, EntityUuid},
    ontology::VersionedUrl,
    principal::actor_group::WebId,
};
use uuid::Uuid;

use crate::salt::{
    manifest::RelationSecurityMode,
    snapshot::{
        EntityAtEdition, LinkCandidate, LinkRejection, RelationSecurityPolicy, authorize_link,
        security::authorize_relation_links_for_test,
    },
};

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
    let candidate = LinkCandidate::for_test(link, left, right, &types[0], &types);
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
    let relation_type = entity_type("link");
    let candidate = LinkCandidate::for_test(link, left, right, &relation_type, &[]);
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
    let candidate = LinkCandidate::for_test(link, left, right, &types[0], &types);
    let permitted_entities = permission_map([link, left, right]);
    let permitted_types = HashSet::from([types[0].clone(), types[2].clone()]);

    assert_eq!(
        authorize_link(candidate, &permitted_entities, &permitted_types),
        Err(LinkRejection::EntityType { index: 1 })
    );
}

#[test]
fn forbidden_public_link_is_noninterfering_in_geometry_identity() {
    let public_type = entity_type("public");
    let admitted = authorized_candidate(100, &public_type);
    let hidden = authorized_candidate(200, &public_type);
    let public_entities = HashSet::from([admitted.candidate().left, admitted.candidate().right]);
    let public_links = HashSet::from([admitted.candidate().link]);
    let policy = RelationSecurityPolicy::new(
        RelationSecurityMode::PublicLinksOnly,
        HashSet::new(),
        HashSet::new(),
        public_entities,
        public_links,
        HashSet::new(),
    );

    let baseline = authorize_relation_links_for_test(&[admitted.clone()], &policy);
    let with_hidden = authorize_relation_links_for_test(&[admitted, hidden], &policy);

    assert_eq!(baseline.links().len(), 1);
    assert_eq!(baseline.content_hash(), with_hidden.content_hash());
}

#[test]
fn atlas_safe_deny_override_wins_over_type_and_instance_admission() {
    let relation_type = entity_type("reviewed-safe");
    let link = authorized_candidate(300, &relation_type);
    let policy = RelationSecurityPolicy::new(
        RelationSecurityMode::AtlasSafeLinks,
        HashSet::from([relation_type.clone()]),
        HashSet::from([relation_type.clone()]),
        HashSet::new(),
        HashSet::new(),
        HashSet::from([link.candidate().link]),
    );

    assert!(
        authorize_relation_links_for_test(&[link], &policy)
            .links()
            .is_empty()
    );
}

#[test]
fn all_snapshot_mode_ignores_atlas_safe_type_decisions() {
    let relation_type = entity_type("denied-only-for-atlas-safe");
    let link = authorized_candidate(400, &relation_type);
    let policy = RelationSecurityPolicy::new(
        RelationSecurityMode::AllSnapshotLinks,
        HashSet::new(),
        HashSet::from([relation_type.clone()]),
        HashSet::new(),
        HashSet::new(),
        HashSet::new(),
    );

    assert_eq!(
        authorize_relation_links_for_test(&[link], &policy)
            .links()
            .len(),
        1
    );
}

#[test]
fn public_mode_ignores_atlas_safe_type_decisions() {
    let relation_type = entity_type("public-but-atlas-denied");
    let link = authorized_candidate(500, &relation_type);
    let candidate = link.candidate();
    let policy = RelationSecurityPolicy::new(
        RelationSecurityMode::PublicLinksOnly,
        HashSet::new(),
        HashSet::from([relation_type.clone()]),
        HashSet::from([candidate.left, candidate.right]),
        HashSet::from([candidate.link]),
        HashSet::new(),
    );

    assert_eq!(
        authorize_relation_links_for_test(&[link], &policy)
            .links()
            .len(),
        1
    );
}

#[test]
fn geometry_receipt_and_links_are_independent_of_snapshot_order() {
    let relation_type = entity_type("order-independent");
    let first = authorized_candidate(600, &relation_type);
    let second = authorized_candidate(700, &relation_type);
    let policy = RelationSecurityPolicy::new(
        RelationSecurityMode::AllSnapshotLinks,
        HashSet::new(),
        HashSet::new(),
        HashSet::new(),
        HashSet::new(),
        HashSet::new(),
    );

    let forward = authorize_relation_links_for_test(&[first.clone(), second.clone()], &policy);
    let reverse = authorize_relation_links_for_test(&[second, first], &policy);

    assert_eq!(forward.content_hash(), reverse.content_hash());
    assert_eq!(
        forward
            .links()
            .iter()
            .map(|link| link.link_entity())
            .collect::<Vec<_>>(),
        reverse
            .links()
            .iter()
            .map(|link| link.link_entity())
            .collect::<Vec<_>>()
    );
}

#[test]
fn geometry_identity_binds_the_authorized_required_type_closure() {
    let relation_type = entity_type("typed-relation");
    let first_required = entity_type("required-a");
    let second_required = entity_type("required-b");
    let link = entity_at(750);
    let left = entity_at(760);
    let right = entity_at(770);
    let permissions = permission_map([link, left, right]);
    let permitted_types = HashSet::from([first_required.clone(), second_required.clone()]);
    let baseline = authorize_link(
        LinkCandidate::for_test(
            link,
            left,
            right,
            &relation_type,
            std::slice::from_ref(&first_required),
        ),
        &permissions,
        &permitted_types,
    )
    .expect("baseline type closure should authorize");
    let expanded = authorize_link(
        LinkCandidate::for_test(
            link,
            left,
            right,
            &relation_type,
            &[first_required, second_required],
        ),
        &permissions,
        &permitted_types,
    )
    .expect("expanded type closure should authorize");
    let policy = RelationSecurityPolicy::new(
        RelationSecurityMode::AllSnapshotLinks,
        HashSet::new(),
        HashSet::new(),
        HashSet::new(),
        HashSet::new(),
        HashSet::new(),
    );

    assert_ne!(
        authorize_relation_links_for_test(&[baseline], &policy).content_hash(),
        authorize_relation_links_for_test(&[expanded], &policy).content_hash()
    );
}

#[test]
fn public_mode_requires_the_exact_snapshot_editions() {
    let relation_type = entity_type("edition-scoped-public");
    let link = authorized_candidate(800, &relation_type);
    let candidate = link.candidate();
    let wrong_left = EntityAtEdition {
        edition_id: EntityEditionId::new(Uuid::from_u128(999_999)),
        ..candidate.left
    };
    let policy = RelationSecurityPolicy::new(
        RelationSecurityMode::PublicLinksOnly,
        HashSet::new(),
        HashSet::new(),
        HashSet::from([wrong_left, candidate.right]),
        HashSet::from([candidate.link]),
        HashSet::new(),
    );

    assert!(
        authorize_relation_links_for_test(&[link], &policy)
            .links()
            .is_empty()
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

fn authorized_candidate(seed: u128, relation_type: &VersionedUrl) -> super::AuthorizedLink {
    let link = entity_at(seed);
    let left = entity_at(seed + 10);
    let right = entity_at(seed + 20);
    authorize_link(
        LinkCandidate::for_test(link, left, right, relation_type, &[]),
        &permission_map([link, left, right]),
        &HashSet::new(),
    )
    .expect("fixture permissions should admit the link")
}

fn entity_type(slug: &str) -> VersionedUrl {
    format!("https://hash.ai/@example/types/entity-type/{slug}/v/1")
        .parse()
        .expect("fixture entity type should parse")
}
