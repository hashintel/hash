//! Behavioural coverage for [`EntityStore::search_entities`].
//!
//! The embeddings are constructed in the first two vector components, so every cosine distance
//! to the query is known exactly: same direction is `0`, a 60° angle is `0.5`, orthogonal is
//! `1`, and opposite is `2`. The assertions therefore pin the full pipeline — per-branch
//! candidate reads, cross-branch deduplication, the exact rerank, and the rank-preserving
//! hydration — against ground truth.

use std::collections::HashSet;

use hash_graph_authorization::policies::{Effect, action::ActionName};
use hash_graph_store::{
    entity::{
        CreateEntityParams, CreateEntityPolicyParams, EntityStore as _, SearchEntitiesFilter,
        SearchEntitiesParams, UpdateEntityEmbeddingsParams,
    },
    filter::SemanticDistance,
};
use hash_graph_temporal_versioning::Timestamp;
use hash_graph_test_data::{data_type, entity, entity_type, property_type};
use hash_graph_types::{Embedding, knowledge::entity::EntityEmbedding};
use type_system::{
    knowledge::{
        entity::{EntityId, provenance::ProvidedEntityEditionProvenance},
        property::{PropertyObject, PropertyObjectWithMetadata},
    },
    ontology::id::{BaseUrl, OntologyTypeVersion, VersionedUrl},
    principal::{
        actor::{ActorEntityUuid, ActorType},
        actor_group::WebId,
    },
    provenance::{OriginProvenance, OriginType},
};
use uuid::Uuid;

use crate::{DatabaseApi, DatabaseTestWrapper};

async fn seed(database: &mut DatabaseTestWrapper) -> DatabaseApi<'_> {
    database
        .seed(
            [
                data_type::VALUE_V1,
                data_type::TEXT_V1,
                data_type::NUMBER_V1,
            ],
            [
                property_type::NAME_V1,
                property_type::AGE_V1,
                property_type::FAVORITE_SONG_V1,
                property_type::FAVORITE_FILM_V1,
                property_type::HOBBY_V1,
                property_type::INTERESTS_V1,
            ],
            [
                entity_type::LINK_V1,
                entity_type::link::FRIEND_OF_V1,
                entity_type::link::ACQUAINTANCE_OF_V1,
                entity_type::PERSON_V1,
            ],
        )
        .await
        .expect("could not seed database")
}

fn person_entity_type_id() -> VersionedUrl {
    VersionedUrl {
        base_url: BaseUrl::new(
            "https://blockprotocol.org/@alice/types/entity-type/person/".to_owned(),
        )
        .expect("couldn't construct Base URL"),
        version: OntologyTypeVersion {
            major: 1,
            pre_release: None,
        },
    }
}

async fn create_person(
    api: &mut DatabaseApi<'_>,
    draft: bool,
    policies: Vec<CreateEntityPolicyParams>,
) -> EntityId {
    let person: PropertyObject =
        serde_json::from_str(entity::PERSON_ALICE_V1).expect("could not parse entity");

    api.create_entity(
        api.account_id,
        CreateEntityParams {
            web_id: WebId::new(api.account_id),
            entity_uuid: None,
            decision_time: None,
            entity_type_ids: HashSet::from([person_entity_type_id()]),
            properties: PropertyObjectWithMetadata::from_parts(person, None)
                .expect("could not create property with metadata object"),
            confidence: None,
            link_data: None,
            draft,
            policies,
            provenance: ProvidedEntityEditionProvenance {
                actor_type: ActorType::User,
                origin: OriginProvenance::from_empty_type(OriginType::Api),
                sources: Vec::new(),
            },
            read_only: false,
        },
    )
    .await
    .expect("could not create entity")
    .metadata
    .record_id
    .entity_id
}

/// A policy that permits every actor to view the entity it is attached to.
fn public_view_policy() -> CreateEntityPolicyParams {
    CreateEntityPolicyParams {
        name: "semantic-search-test-public-view".to_owned(),
        effect: Effect::Permit,
        principal: None,
        actions: vec![ActionName::ViewEntity],
    }
}

/// A full-width embedding pointing along `(x, y)` in the first two components.
#[expect(clippy::indexing_slicing)]
fn embedding_towards(x: f32, y: f32) -> Embedding<'static> {
    let mut vector = vec![0.0_f32; Embedding::DIM];
    vector[0] = x;
    vector[1] = y;
    Embedding::from(vector)
}

fn query_embedding() -> Embedding<'static> {
    embedding_towards(1.0, 0.0)
}

#[expect(clippy::float_arithmetic)]
fn sixty_degrees() -> Embedding<'static> {
    embedding_towards(0.5, 3.0_f32.sqrt() / 2.0)
}

async fn insert_embedding(
    api: &mut DatabaseApi<'_>,
    entity_id: EntityId,
    embedding: Embedding<'static>,
) {
    api.update_entity_embeddings(
        api.account_id,
        UpdateEntityEmbeddingsParams {
            entity_id,
            embeddings: vec![EntityEmbedding {
                property: None,
                embedding,
            }],
            updated_at_transaction_time: Timestamp::now(),
            updated_at_decision_time: Timestamp::now(),
            reset: false,
        },
    )
    .await
    .expect("could not insert entity embedding");
}

async fn search(
    api: &mut DatabaseApi<'_>,
    actor_id: ActorEntityUuid,
    filter: SearchEntitiesFilter,
    maximum_semantic_distance: f64,
    limit: usize,
) -> Vec<EntityId> {
    api.search_entities(
        actor_id,
        SearchEntitiesParams {
            embedding: query_embedding(),
            maximum_semantic_distance: SemanticDistance::try_from(maximum_semantic_distance)
                .expect("the maximum should be a valid cosine distance"),
            limit,
            include_entity_types: false,
            filter,
        },
    )
    .await
    .expect("the search should succeed")
    .entities
    .into_iter()
    .map(|entity| entity.metadata.record_id.entity_id)
    .collect()
}

fn web_filter(web_id: WebId) -> SearchEntitiesFilter {
    SearchEntitiesFilter {
        web_ids: vec![web_id],
        ..SearchEntitiesFilter::default()
    }
}

/// Four entities at the exact cosine distances `0`, `0.5`, `1`, and `2`, created in scrambled
/// order so the ranking cannot accidentally mirror the insertion order.
async fn seed_ranked_persons(api: &mut DatabaseApi<'_>) -> [EntityId; 4] {
    let opposite = create_person(api, false, Vec::new()).await;
    insert_embedding(api, opposite, embedding_towards(-1.0, 0.0)).await;

    let mid = create_person(api, false, Vec::new()).await;
    insert_embedding(api, mid, sixty_degrees()).await;

    let near = create_person(api, false, Vec::new()).await;
    insert_embedding(api, near, embedding_towards(1.0, 0.0)).await;

    let far = create_person(api, false, Vec::new()).await;
    insert_embedding(api, far, embedding_towards(0.0, 1.0)).await;

    [near, mid, far, opposite]
}

#[tokio::test]
async fn ranks_by_exact_distance() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;
    let actor = api.account_id;
    let own_web = WebId::new(actor);

    let [near, mid, far, opposite] = seed_ranked_persons(&mut api).await;

    let results = search(&mut api, actor, web_filter(own_web), 2.0, 10).await;
    assert_eq!(
        results,
        [near, mid, far, opposite],
        "the results should be ordered by ascending cosine distance"
    );
}

#[tokio::test]
async fn applies_the_distance_threshold() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;
    let actor = api.account_id;
    let own_web = WebId::new(actor);

    let [near, mid, _far, _opposite] = seed_ranked_persons(&mut api).await;

    let results = search(&mut api, actor, web_filter(own_web), 0.75, 10).await;
    assert_eq!(
        results,
        [near, mid],
        "entities beyond the distance threshold should be cut"
    );
}

#[tokio::test]
async fn respects_the_limit() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;
    let actor = api.account_id;
    let own_web = WebId::new(actor);

    let [near, mid, _far, _opposite] = seed_ranked_persons(&mut api).await;

    let results = search(&mut api, actor, web_filter(own_web), 2.0, 2).await;
    assert_eq!(
        results,
        [near, mid],
        "the limit should keep the nearest entities"
    );
}

#[tokio::test]
async fn isolates_actors() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;
    let actor = api.account_id;
    let own_web = WebId::new(actor);

    let visible = create_person(&mut api, false, Vec::new()).await;
    insert_embedding(&mut api, visible, embedding_towards(1.0, 0.0)).await;
    let second = create_person(&mut api, false, Vec::new()).await;
    insert_embedding(&mut api, second, embedding_towards(0.0, 1.0)).await;

    let results = search(&mut api, actor, web_filter(own_web), 2.0, 10).await;
    assert_eq!(results, [visible, second]);

    // The machine actor has no access to the owner's web, so the search must not surface its
    // entities no matter what else it returns.
    let outsider = api.create_machine("semantic-search-outsider").await;
    let results = search(
        &mut api,
        outsider.into(),
        SearchEntitiesFilter::default(),
        2.0,
        10,
    )
    .await;
    assert!(
        !results.contains(&visible) && !results.contains(&second),
        "an actor without web access should not see the web's entities"
    );
}

#[tokio::test]
async fn deduplicates_overlapping_policy_branches() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;
    let actor = api.account_id;
    let own_web = WebId::new(actor);

    // The owner sees this entity through the web permit AND through the entity-scoped policy,
    // so it ranks in two branches and must still appear exactly once.
    let public = create_person(&mut api, false, vec![public_view_policy()]).await;
    insert_embedding(&mut api, public, embedding_towards(1.0, 0.0)).await;
    let private = create_person(&mut api, false, Vec::new()).await;
    insert_embedding(&mut api, private, sixty_degrees()).await;

    let results = search(&mut api, actor, web_filter(own_web), 2.0, 10).await;
    assert_eq!(
        results,
        [public, private],
        "overlapping permits should not duplicate an entity"
    );

    // The entity-scoped policy has no principal constraint, so it permits the outsider as well —
    // but only for that one entity.
    let outsider = api.create_machine("semantic-search-outsider").await;
    let results = search(
        &mut api,
        outsider.into(),
        SearchEntitiesFilter::default(),
        2.0,
        10,
    )
    .await;
    assert!(
        results.contains(&public),
        "the entity-scoped permit should make the entity visible to any actor"
    );
    assert!(
        !results.contains(&private),
        "the web's other entities should stay invisible"
    );
    assert_eq!(
        results.iter().filter(|&&id| id == public).count(),
        1,
        "the entity should appear exactly once"
    );
}

#[tokio::test]
async fn excludes_drafts_unless_requested() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;
    let actor = api.account_id;
    let own_web = WebId::new(actor);

    let draft = create_person(&mut api, true, Vec::new()).await;
    insert_embedding(&mut api, draft, embedding_towards(1.0, 0.0)).await;
    let live = create_person(&mut api, false, Vec::new()).await;
    insert_embedding(&mut api, live, sixty_degrees()).await;

    let results = search(&mut api, actor, web_filter(own_web), 2.0, 10).await;
    assert_eq!(results, [live], "drafts should be excluded by default");

    let results = search(
        &mut api,
        actor,
        SearchEntitiesFilter {
            include_drafts: true,
            ..web_filter(own_web)
        },
        2.0,
        10,
    )
    .await;
    assert_eq!(
        results,
        [draft, live],
        "requesting drafts should rank them alongside live entities"
    );
}

#[tokio::test]
async fn restricts_to_requested_types_and_webs() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;
    let actor = api.account_id;
    let own_web = WebId::new(actor);

    let person = create_person(&mut api, false, Vec::new()).await;
    insert_embedding(&mut api, person, embedding_towards(1.0, 0.0)).await;

    let results = search(
        &mut api,
        actor,
        web_filter(WebId::new(Uuid::new_v4())),
        2.0,
        10,
    )
    .await;
    assert!(
        results.is_empty(),
        "a foreign web restriction should exclude the entity"
    );

    let results = search(
        &mut api,
        actor,
        SearchEntitiesFilter {
            entity_type_ids: vec![person_entity_type_id()],
            ..web_filter(own_web)
        },
        2.0,
        10,
    )
    .await;
    assert_eq!(
        results,
        [person],
        "the type restriction should keep matching entities"
    );
}
