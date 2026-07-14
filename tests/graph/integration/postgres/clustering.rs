use core::num::NonZero;
use std::collections::HashSet;

use hash_graph_store::{
    entity::{
        ClusterEntitiesParams, CreateEntityParams, EntityStore as _, UpdateEntityEmbeddingsParams,
    },
    error::ClusterError,
};
use hash_graph_temporal_versioning::Timestamp;
use hash_graph_test_data::{data_type, entity, entity_type, property_type};
use hash_graph_types::{Embedding, knowledge::entity::EntityEmbedding};
use type_system::{
    knowledge::{
        entity::{EntityId, id::EntityUuid, provenance::ProvidedEntityEditionProvenance},
        property::{PropertyObject, PropertyObjectWithMetadata},
    },
    ontology::id::{BaseUrl, OntologyTypeVersion, VersionedUrl},
    principal::{actor::ActorType, actor_group::WebId},
    provenance::{OriginProvenance, OriginType},
};
use uuid::Uuid;

use crate::{DatabaseApi, DatabaseTestWrapper};

/// Dimension used for clustering requests in these tests.
///
/// Embeddings are stored as 3072-dimensional vectors but matryoshka-truncated
/// server-side, so only the first `CLUSTER_DIM` components carry signal here.
const CLUSTER_DIM: u16 = 8;

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

async fn create_person(api: &mut DatabaseApi<'_>) -> EntityId {
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
            draft: false,
            policies: Vec::new(),
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

/// Builds a full-width stored embedding pointing along `axis` within the first
/// [`CLUSTER_DIM`] components, with a small per-entity `jitter` so vectors in
/// the same group are distinct but remain tightly clustered.
#[expect(clippy::indexing_slicing, clippy::float_arithmetic)]
fn embedding_along_axis(axis: usize, jitter_axis: usize, jitter: f32) -> Embedding<'static> {
    assert!(axis < usize::from(CLUSTER_DIM));
    assert!(jitter_axis < usize::from(CLUSTER_DIM));

    let mut vector = vec![0.0_f32; Embedding::DIM];
    vector[axis] = 1.0;
    vector[jitter_axis] += jitter;
    Embedding::from(vector)
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

const fn cluster_params(entity_ids: Vec<EntityId>, cluster_count: u16) -> ClusterEntitiesParams {
    ClusterEntitiesParams {
        entity_ids,
        cluster_count,
        dimension: NonZero::new(CLUSTER_DIM).expect("dimension should be non-zero"),
        seed: Some(0),
    }
}

#[tokio::test]
async fn clusters_entities_by_embedding_direction() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    // Two well-separated groups: group A points along axis 0, group B along
    // axis 1. Spherical k-means with `k = 2` must separate them.
    let mut group_a = Vec::new();
    for index in 0..3_usize {
        let entity_id = create_person(&mut api).await;
        #[expect(clippy::cast_precision_loss, reason = "tiny test-only jitter values")]
        insert_embedding(
            &mut api,
            entity_id,
            embedding_along_axis(0, 2, 0.01 * index as f32),
        )
        .await;
        group_a.push(entity_id);
    }

    let mut group_b = Vec::new();
    for index in 0..2_usize {
        let entity_id = create_person(&mut api).await;
        #[expect(clippy::cast_precision_loss, reason = "tiny test-only jitter values")]
        insert_embedding(
            &mut api,
            entity_id,
            embedding_along_axis(1, 3, 0.01 * index as f32),
        )
        .await;
        group_b.push(entity_id);
    }

    // One existing entity without any stored embedding ...
    let entity_without_embedding = create_person(&mut api).await;
    // ... and one entity ID that does not exist at all.
    let nonexistent_entity = EntityId {
        web_id: WebId::new(api.account_id),
        entity_uuid: EntityUuid::new(Uuid::new_v4()),
        draft_id: None,
    };

    let mut requested = group_a.clone();
    requested.extend(&group_b);
    requested.push(entity_without_embedding);
    requested.push(nonexistent_entity);

    let response = api
        .cluster_entities(api.account_id, cluster_params(requested, 2))
        .await
        .expect("could not cluster entities");

    assert_eq!(
        response
            .missing_embeddings
            .iter()
            .copied()
            .collect::<HashSet<_>>(),
        HashSet::from([entity_without_embedding, nonexistent_entity]),
        "entities without embeddings and unknown entities should be reported as missing"
    );

    assert_eq!(response.clusters.len(), 2, "expected exactly two clusters");

    let group_a_set: HashSet<EntityId> = group_a.iter().copied().collect();
    let group_b_set: HashSet<EntityId> = group_b.iter().copied().collect();

    let cluster_with_a = response
        .clusters
        .iter()
        .find(|cluster| cluster.entity_ids.contains(&group_a[0]))
        .expect("group A should be assigned to a cluster");
    let cluster_with_b = response
        .clusters
        .iter()
        .find(|cluster| cluster.entity_ids.contains(&group_b[0]))
        .expect("group B should be assigned to a cluster");

    assert_eq!(
        cluster_with_a
            .entity_ids
            .iter()
            .copied()
            .collect::<HashSet<_>>(),
        group_a_set,
        "group A should form one cluster"
    );
    assert_eq!(
        cluster_with_b
            .entity_ids
            .iter()
            .copied()
            .collect::<HashSet<_>>(),
        group_b_set,
        "group B should form the other cluster"
    );

    for cluster in &response.clusters {
        assert_eq!(
            cluster.centroid.len(),
            usize::from(CLUSTER_DIM),
            "centroid length should match the requested dimension"
        );
    }

    assert!(
        response.inertia < 0.01,
        "tightly clustered groups should have near-zero inertia, got {}",
        response.inertia
    );
}

#[tokio::test]
async fn permission_denied_is_reported_as_missing() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity_id = create_person(&mut api).await;
    insert_embedding(&mut api, entity_id, embedding_along_axis(0, 1, 0.0)).await;

    // The owning actor can cluster the entity.
    let response = api
        .cluster_entities(api.account_id, cluster_params(vec![entity_id], 1))
        .await
        .expect("could not cluster entities");
    assert_eq!(response.clusters.len(), 1);
    assert!(response.missing_embeddings.is_empty());

    // A machine actor without access to the web must not see the entity. To
    // avoid leaking permission information, the entity is reported exactly as
    // if it had no embedding.
    let machine_id = api.create_machine("clustering-outsider").await;
    let response = api
        .cluster_entities(machine_id.into(), cluster_params(vec![entity_id], 1))
        .await
        .expect("could not cluster entities");

    assert!(
        response.clusters.is_empty(),
        "unauthorized entities should not be clustered"
    );
    assert_eq!(
        response.missing_embeddings,
        HashSet::from([entity_id]),
        "unauthorized entities should be indistinguishable from missing embeddings"
    );
    assert!(response.inertia.abs() < f32::EPSILON);
}

#[tokio::test]
async fn zero_cluster_count_returns_no_clusters() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity_id = create_person(&mut api).await;
    insert_embedding(&mut api, entity_id, embedding_along_axis(0, 1, 0.0)).await;

    let response = api
        .cluster_entities(api.account_id, cluster_params(vec![entity_id], 0))
        .await
        .expect("could not cluster entities");

    assert!(response.clusters.is_empty());
    assert!(
        response.missing_embeddings.is_empty(),
        "entities with embeddings should not be reported as missing even when `k = 0`"
    );
    assert!(response.inertia.abs() < f32::EPSILON);
}

#[tokio::test]
async fn rejects_invalid_parameters() {
    let mut database = DatabaseTestWrapper::new().await;
    let api = seed(&mut database).await;

    // Dimension must be a multiple of 8.
    let report = api
        .cluster_entities(
            api.account_id,
            ClusterEntitiesParams {
                entity_ids: Vec::new(),
                cluster_count: 2,
                dimension: NonZero::new(7).expect("dimension should be non-zero"),
                seed: Some(0),
            },
        )
        .await
        .expect_err("dimension not a multiple of 8 should be rejected");
    assert!(matches!(
        report.current_context(),
        ClusterError::InvalidDimension { .. }
    ));

    // Dimension must not exceed 512.
    let report = api
        .cluster_entities(
            api.account_id,
            ClusterEntitiesParams {
                entity_ids: Vec::new(),
                cluster_count: 2,
                dimension: NonZero::new(520).expect("dimension should be non-zero"),
                seed: Some(0),
            },
        )
        .await
        .expect_err("dimension above 512 should be rejected");
    assert!(matches!(
        report.current_context(),
        ClusterError::DimensionTooLarge { .. }
    ));

    // Cluster count must not exceed 64.
    let report = api
        .cluster_entities(
            api.account_id,
            ClusterEntitiesParams {
                entity_ids: Vec::new(),
                cluster_count: 65,
                dimension: NonZero::new(CLUSTER_DIM).expect("dimension should be non-zero"),
                seed: Some(0),
            },
        )
        .await
        .expect_err("cluster count above 64 should be rejected");
    assert!(matches!(
        report.current_context(),
        ClusterError::KTooLarge { .. }
    ));
}
