use core::{iter::repeat_n, str::FromStr as _};
use std::collections::HashSet;

use criterion::{BatchSize::SmallInput, Bencher, BenchmarkId, Criterion};
use criterion_macro::criterion;
use hash_graph_authorization::policies::store::{
    CreateWebParameter, PolicyStore as _, PrincipalStore as _,
};
use hash_graph_store::{
    entity::{
        CreateEntityParams, EntityQuerySorting, EntityStore as _, QueryEntitiesParams,
        QueryEntitySubgraphParams,
    },
    filter::Filter,
    subgraph::{
        edges::{EdgeDirection, SubgraphTraversalParams, TraversalEdge, TraversalPath},
        temporal_axes::{
            PinnedTemporalAxisUnresolved, QueryTemporalAxesUnresolved,
            VariableTemporalAxisUnresolved,
        },
    },
};
use hash_graph_temporal_versioning::TemporalBound;
use hash_graph_test_data::{data_type, entity, entity_type, property_type};
use rand::{prelude::IteratorRandom as _, rng};
use tokio::runtime::Runtime;
use type_system::{
    knowledge::{
        Entity,
        entity::{LinkData, provenance::ProvidedEntityEditionProvenance},
        property::{PropertyObject, PropertyObjectWithMetadata, metadata::PropertyProvenance},
    },
    ontology::entity_type::EntityType,
    principal::{
        actor::{ActorEntityUuid, ActorId, ActorType},
        actor_group::WebId,
    },
    provenance::{OriginProvenance, OriginType},
};
use uuid::Uuid;

use crate::util::{Store, StoreWrapper, seed, setup, setup_subscriber};

const DB_NAME: &str = "entity_scale";

struct DatastoreEntitiesMetadata {
    pub entity_list: Vec<Entity>,
    // TODO: we should also check average query time for link entities, but combining them here
    //   would affect the distribution within sampling
    #[expect(dead_code, reason = "See TODO")]
    pub link_entity_list: Vec<Entity>,
}

#[expect(clippy::too_many_lines)]
async fn seed_db(
    account_id: ActorEntityUuid,
    store_wrapper: &mut StoreWrapper,
    total: usize,
) -> DatastoreEntitiesMetadata {
    let mut transaction = store_wrapper
        .store
        .transaction()
        .await
        .expect("failed to start transaction");

    let now = std::time::SystemTime::now();
    eprintln!("Seeding database: {}", store_wrapper.bench_db_name);

    transaction
        .seed_system_policies()
        .await
        .expect("Should be able to seed system policies");

    let system_account_id = transaction
        .get_or_create_system_machine("h")
        .await
        .expect("could not read system account");

    let user_id = transaction
        .create_user(Some(account_id.into()))
        .await
        .expect("could not create user");

    transaction
        .create_web(
            ActorId::from(system_account_id),
            CreateWebParameter {
                id: Some(user_id.into()),
                administrator: Some(user_id.into()),
                shortname: Some("alice".to_owned()),
                is_actor_web: true,
            },
        )
        .await
        .expect("could not create web");

    seed(
        &mut transaction,
        account_id,
        [
            data_type::VALUE_V1,
            data_type::TEXT_V1,
            data_type::NUMBER_V1,
        ],
        [
            property_type::NAME_V1,
            property_type::BLURB_V1,
            property_type::PUBLISHED_ON_V1,
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
            entity_type::link::WRITTEN_BY_V1,
            entity_type::PERSON_V1,
            entity_type::BOOK_V1,
        ],
    )
    .await;

    let properties: PropertyObject =
        serde_json::from_str(entity::PERSON_ALICE_V1).expect("could not parse entity");
    let entity_type: EntityType =
        serde_json::from_str(entity_type::PERSON_V1).expect("could not parse entity type");

    let link_type: EntityType =
        serde_json::from_str(entity_type::link::FRIEND_OF_V1).expect("could not parse entity type");

    let web_id = WebId::new(account_id);

    let entity_list = transaction
        .create_entities(
            account_id,
            repeat_n(
                CreateEntityParams {
                    web_id,
                    entity_uuid: None,
                    decision_time: None,
                    entity_type_ids: HashSet::from([entity_type.id]),
                    properties: PropertyObjectWithMetadata::from_parts(properties, None)
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
                },
                total,
            )
            .collect(),
        )
        .await
        .expect("failed to create entities");

    let link_entity_metadata_list = transaction
        .create_entities(
            account_id,
            entity_list
                .iter()
                .flat_map(|entity_a| {
                    entity_list.iter().map(|entity_b| CreateEntityParams {
                        web_id,
                        entity_uuid: None,
                        decision_time: None,
                        entity_type_ids: HashSet::from([link_type.id.clone()]),
                        properties: PropertyObjectWithMetadata::from_parts(
                            PropertyObject::empty(),
                            None,
                        )
                        .expect("could not create property with metadata object"),
                        confidence: None,
                        link_data: Some(LinkData {
                            left_entity_id: entity_a.metadata.record_id.entity_id,
                            right_entity_id: entity_b.metadata.record_id.entity_id,
                            left_entity_confidence: None,
                            left_entity_provenance: PropertyProvenance::default(),
                            right_entity_confidence: None,
                            right_entity_provenance: PropertyProvenance::default(),
                        }),
                        draft: false,
                        policies: Vec::new(),
                        provenance: ProvidedEntityEditionProvenance {
                            actor_type: ActorType::User,
                            origin: OriginProvenance::from_empty_type(OriginType::Api),
                            sources: Vec::new(),
                        },
                    })
                })
                .collect(),
        )
        .await
        .expect("failed to create link entities");

    transaction
        .commit()
        .await
        .expect("failed to commit transaction");

    eprintln!(
        "Finished seeding database {} with {} entities and {} link entities after {:#?}",
        store_wrapper.bench_db_name,
        total,
        link_entity_metadata_list.len(),
        now.elapsed().expect("failed to get elapsed time")
    );

    DatastoreEntitiesMetadata {
        entity_list,
        link_entity_list: link_entity_metadata_list,
    }
}

pub fn bench_get_entity_by_id(
    bencher: &mut Bencher,
    runtime: &Runtime,
    store: &Store,
    actor_id: ActorEntityUuid,
    entity_metadata_list: &[Entity],
    traversal_params: &SubgraphTraversalParams,
) {
    bencher.to_async(runtime).iter_batched(
        || {
            // Each iteration, *before timing*, pick a random entity from the sample to
            // query
            entity_metadata_list
                .iter()
                .map(|entity| entity.metadata.record_id)
                .choose(&mut rng())
                .expect("could not choose random entity")
        },
        |entity_record_id| {
            let traversal_params = traversal_params.clone();
            async move {
                store
                    .query_entity_subgraph(
                        actor_id,
                        QueryEntitySubgraphParams::from_parts(
                            QueryEntitiesParams {
                                filter: Filter::for_entity_by_entity_id(entity_record_id.entity_id),
                                temporal_axes: QueryTemporalAxesUnresolved::DecisionTime {
                                    pinned: PinnedTemporalAxisUnresolved::new(None),
                                    variable: VariableTemporalAxisUnresolved::new(
                                        Some(TemporalBound::Unbounded),
                                        None,
                                    ),
                                },
                                sorting: EntityQuerySorting {
                                    paths: Vec::new(),
                                    cursor: None,
                                },
                                limit: None,
                                conversions: Vec::new(),
                                include_count: false,
                                include_entity_types: None,
                                include_drafts: false,
                                include_web_ids: false,
                                include_created_by_ids: false,
                                include_edition_created_by_ids: false,
                                include_type_ids: false,
                                include_type_titles: false,
                                include_permissions: false,
                            },
                            traversal_params,
                        ),
                    )
                    .await
                    .expect("failed to read entity from store");
            }
        },
        SmallInput,
    );
}

fn bench_scaling_read_entity(
    crit: &mut Criterion,
    name: &str,
    traversal_params: &SubgraphTraversalParams,
) {
    let group_id = "read_scaling_complete";
    let mut group = crit.benchmark_group(group_id);

    // We use a hard-coded UUID to keep it consistent across tests so that we can use it as a
    // parameter argument to criterion and get comparison analysis
    let account_id = ActorEntityUuid::new(
        Uuid::from_str("bf5a9ef5-dc3b-43cf-a291-6210c0321eba").expect("invalid uuid"),
    );

    for size in [1, 5, 10, 25, 50] {
        // TODO: reuse the database if it already exists like we do for representative_read
        let (runtime, mut store_wrapper) = setup(DB_NAME, true, true, account_id);

        let DatastoreEntitiesMetadata {
            entity_list: entity_metadata_list,
            ..
        } = runtime.block_on(seed_db(account_id, &mut store_wrapper, size));
        let store = &store_wrapper.store;

        let function_id = format!("entity_by_id;{name}");
        let parameter = format!("{size} entities");
        group.bench_with_input(
            BenchmarkId::new(&function_id, &parameter),
            &(account_id, entity_metadata_list),
            |bencher, (_account_id, entity_list)| {
                let _guard = setup_subscriber(group_id, Some(&function_id), Some(&parameter));
                bench_get_entity_by_id(
                    bencher,
                    &runtime,
                    store,
                    account_id,
                    entity_list,
                    traversal_params,
                );
            },
        );
    }
}

#[criterion]
fn bench_scaling_read_entity_zero_depths(crit: &mut Criterion) {
    bench_scaling_read_entity(
        crit,
        "zero_depth",
        &SubgraphTraversalParams::Paths {
            traversal_paths: vec![],
        },
    );
}

#[criterion]
fn bench_scaling_read_entity_one_depth(crit: &mut Criterion) {
    bench_scaling_read_entity(
        crit,
        "one_depth",
        &SubgraphTraversalParams::Paths {
            traversal_paths: vec![
                TraversalPath {
                    edges: vec![
                        TraversalEdge::HasLeftEntity {
                            direction: EdgeDirection::Incoming,
                        },
                        TraversalEdge::HasRightEntity {
                            direction: EdgeDirection::Outgoing,
                        },
                    ],
                },
                TraversalPath {
                    edges: vec![
                        TraversalEdge::HasRightEntity {
                            direction: EdgeDirection::Incoming,
                        },
                        TraversalEdge::HasLeftEntity {
                            direction: EdgeDirection::Outgoing,
                        },
                    ],
                },
                TraversalPath {
                    edges: vec![TraversalEdge::HasLeftEntity {
                        direction: EdgeDirection::Outgoing,
                    }],
                },
                TraversalPath {
                    edges: vec![TraversalEdge::HasLeftEntity {
                        direction: EdgeDirection::Outgoing,
                    }],
                },
            ],
        },
    );
}

#[criterion]
fn bench_scaling_read_entity_two_depth(crit: &mut Criterion) {
    bench_scaling_read_entity(
        crit,
        "two_depth",
        &SubgraphTraversalParams::Paths {
            traversal_paths: vec![
                TraversalPath {
                    edges: vec![
                        TraversalEdge::HasLeftEntity {
                            direction: EdgeDirection::Incoming,
                        },
                        TraversalEdge::HasRightEntity {
                            direction: EdgeDirection::Outgoing,
                        },
                        TraversalEdge::HasLeftEntity {
                            direction: EdgeDirection::Incoming,
                        },
                        TraversalEdge::HasRightEntity {
                            direction: EdgeDirection::Outgoing,
                        },
                    ],
                },
                TraversalPath {
                    edges: vec![
                        TraversalEdge::HasRightEntity {
                            direction: EdgeDirection::Incoming,
                        },
                        TraversalEdge::HasLeftEntity {
                            direction: EdgeDirection::Outgoing,
                        },
                        TraversalEdge::HasRightEntity {
                            direction: EdgeDirection::Incoming,
                        },
                        TraversalEdge::HasLeftEntity {
                            direction: EdgeDirection::Outgoing,
                        },
                    ],
                },
                TraversalPath {
                    edges: vec![
                        TraversalEdge::HasLeftEntity {
                            direction: EdgeDirection::Outgoing,
                        },
                        TraversalEdge::HasRightEntity {
                            direction: EdgeDirection::Incoming,
                        },
                    ],
                },
                TraversalPath {
                    edges: vec![
                        TraversalEdge::HasLeftEntity {
                            direction: EdgeDirection::Outgoing,
                        },
                        TraversalEdge::HasRightEntity {
                            direction: EdgeDirection::Incoming,
                        },
                    ],
                },
            ],
        },
    );
}
