use core::{iter::repeat, str::FromStr};
use std::collections::HashSet;

use authorization::{schema::WebOwnerSubject, AuthorizationApi, NoAuthorization};
use criterion::{BatchSize::SmallInput, Bencher, BenchmarkId, Criterion, SamplingMode};
use criterion_macro::criterion;
use graph::{
    store::{
        account::{InsertAccountIdParams, InsertWebIdParams},
        knowledge::{CreateEntityParams, GetEntitySubgraphParams},
        query::Filter,
        AccountStore, EntityQuerySorting, EntityStore,
    },
    subgraph::{
        edges::{EdgeResolveDepths, GraphResolveDepths, OutgoingEdgeResolveDepth},
        temporal_axes::{
            PinnedTemporalAxisUnresolved, QueryTemporalAxesUnresolved,
            VariableTemporalAxisUnresolved,
        },
    },
};
use graph_test_data::{data_type, entity, entity_type, property_type};
use graph_types::{
    account::AccountId,
    knowledge::{
        entity::{Entity, ProvidedEntityEditionProvenance},
        link::LinkData,
        PropertyObject, PropertyProvenance, PropertyWithMetadataObject,
    },
    owned_by_id::OwnedById,
};
use rand::{prelude::IteratorRandom, thread_rng};
use temporal_versioning::TemporalBound;
use tokio::runtime::Runtime;
use type_system::schema::EntityType;
use uuid::Uuid;

use crate::util::{seed, setup, setup_subscriber, Store, StoreWrapper};

const DB_NAME: &str = "entity_scale";

struct DatastoreEntitiesMetadata {
    pub entity_list: Vec<Entity>,
    // TODO: we should also check average query time for link entities, but combining them here
    //   would affect the distribution within sampling
    #[expect(dead_code, reason = "See TODO")]
    pub link_entity_list: Vec<Entity>,
}

#[expect(clippy::too_many_lines)]
#[expect(
    clippy::significant_drop_tightening,
    reason = "transaction is committed which consumes the object"
)]
async fn seed_db<A: AuthorizationApi>(
    account_id: AccountId,
    store_wrapper: &mut StoreWrapper<A>,
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
        .insert_account_id(account_id, InsertAccountIdParams { account_id })
        .await
        .expect("could not insert account id");
    transaction
        .insert_web_id(
            account_id,
            InsertWebIdParams {
                owned_by_id: OwnedById::new(account_id.into_uuid()),
                owner: WebOwnerSubject::Account { id: account_id },
            },
        )
        .await
        .expect("could not create web id");

    seed(
        &mut transaction,
        account_id,
        [data_type::TEXT_V1, data_type::NUMBER_V1],
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

    let owned_by_id = OwnedById::new(account_id.into_uuid());

    let entity_list = transaction
        .create_entities(
            account_id,
            repeat(CreateEntityParams {
                owned_by_id,
                entity_uuid: None,
                decision_time: None,
                entity_type_ids: HashSet::from([entity_type.id]),
                properties: PropertyWithMetadataObject::from_parts(properties, None)
                    .expect("could not create property with metadata object"),
                confidence: None,
                link_data: None,
                draft: false,
                relationships: [],
                provenance: ProvidedEntityEditionProvenance::default(),
            })
            .take(total)
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
                        owned_by_id,
                        entity_uuid: None,
                        decision_time: None,
                        entity_type_ids: HashSet::from([link_type.id.clone()]),
                        properties: PropertyWithMetadataObject::from_parts(
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
                        relationships: [],
                        provenance: ProvidedEntityEditionProvenance::default(),
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

pub fn bench_get_entity_by_id<A: AuthorizationApi>(
    b: &mut Bencher,
    runtime: &Runtime,
    store: &Store<A>,
    actor_id: AccountId,
    entity_metadata_list: &[Entity],
    graph_resolve_depths: GraphResolveDepths,
) {
    b.to_async(runtime).iter_batched(
        || {
            // Each iteration, *before timing*, pick a random entity from the sample to
            // query
            entity_metadata_list
                .iter()
                .map(|entity| entity.metadata.record_id)
                .choose(&mut thread_rng())
                .expect("could not choose random entity")
        },
        |entity_record_id| async move {
            store
                .get_entity_subgraph(
                    actor_id,
                    GetEntitySubgraphParams {
                        filter: Filter::for_entity_by_entity_id(entity_record_id.entity_id),
                        graph_resolve_depths,
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
                        include_count: false,
                        include_drafts: false,
                    },
                )
                .await
                .expect("failed to read entity from store");
        },
        SmallInput,
    );
}

#[criterion]
fn bench_scaling_read_entity_zero_depths(c: &mut Criterion) {
    let group_id = "scaling_read_entity_complete_zero_depth";
    let mut group = c.benchmark_group(group_id);

    group.sample_size(10);
    group.sampling_mode(SamplingMode::Flat);

    // We use a hard-coded UUID to keep it consistent across tests so that we can use it as a
    // parameter argument to criterion and get comparison analysis
    let account_id = AccountId::new(
        Uuid::from_str("bf5a9ef5-dc3b-43cf-a291-6210c0321eba").expect("invalid uuid"),
    );

    for size in [1, 5, 10, 25, 50] {
        // TODO: reuse the database if it already exists like we do for representative_read
        let (runtime, mut store_wrapper) = setup(DB_NAME, true, true, account_id, NoAuthorization);

        let DatastoreEntitiesMetadata {
            entity_list: entity_metadata_list,
            ..
        } = runtime.block_on(seed_db(account_id, &mut store_wrapper, size));
        let store = &store_wrapper.store;

        let function_id = "entity_by_id";
        let parameter = format!("{size} entities");
        group.bench_with_input(
            BenchmarkId::new(function_id, &parameter),
            &(account_id, entity_metadata_list),
            |b, (_account_id, entity_list)| {
                let _guard = setup_subscriber(group_id, Some(function_id), Some(&parameter));
                bench_get_entity_by_id(
                    b,
                    &runtime,
                    store,
                    account_id,
                    entity_list,
                    GraphResolveDepths {
                        inherits_from: OutgoingEdgeResolveDepth::default(),
                        constrains_values_on: OutgoingEdgeResolveDepth::default(),
                        constrains_properties_on: OutgoingEdgeResolveDepth::default(),
                        constrains_links_on: OutgoingEdgeResolveDepth::default(),
                        constrains_link_destinations_on: OutgoingEdgeResolveDepth::default(),
                        is_of_type: OutgoingEdgeResolveDepth::default(),
                        has_left_entity: EdgeResolveDepths::default(),
                        has_right_entity: EdgeResolveDepths::default(),
                    },
                );
            },
        );
    }
}

#[criterion]
fn bench_scaling_read_entity_one_depth(c: &mut Criterion) {
    let group_id = "scaling_read_entity_complete_one_depth";
    let mut group = c.benchmark_group(group_id);

    group.sample_size(10);
    group.sampling_mode(SamplingMode::Flat);

    // We use a hard-coded UUID to keep it consistent across tests so that we can use it as a
    // parameter argument to criterion and get comparison analysis
    let account_id = AccountId::new(
        Uuid::from_str("bf5a9ef5-dc3b-43cf-a291-6210c0321eba").expect("invalid uuid"),
    );

    for size in [1, 5, 10, 25, 50] {
        // TODO: reuse the database if it already exists like we do for representative_read
        let (runtime, mut store_wrapper) = setup(DB_NAME, true, true, account_id, NoAuthorization);

        let DatastoreEntitiesMetadata {
            entity_list: entity_metadata_list,
            ..
        } = runtime.block_on(seed_db(account_id, &mut store_wrapper, size));
        let store = &store_wrapper.store;

        let function_id = "entity_by_id";
        let parameter = format!("{size} entities");
        group.bench_with_input(
            BenchmarkId::new(function_id, &parameter),
            &(account_id, entity_metadata_list),
            |b, (_account_id, entity_metadata_list)| {
                let _guard = setup_subscriber(group_id, Some(function_id), Some(&parameter));
                bench_get_entity_by_id(
                    b,
                    &runtime,
                    store,
                    account_id,
                    entity_metadata_list,
                    GraphResolveDepths {
                        inherits_from: OutgoingEdgeResolveDepth::default(),
                        constrains_values_on: OutgoingEdgeResolveDepth::default(),
                        constrains_properties_on: OutgoingEdgeResolveDepth::default(),
                        constrains_links_on: OutgoingEdgeResolveDepth::default(),
                        constrains_link_destinations_on: OutgoingEdgeResolveDepth::default(),
                        is_of_type: OutgoingEdgeResolveDepth::default(),
                        has_left_entity: EdgeResolveDepths {
                            incoming: 1,
                            outgoing: 1,
                        },
                        has_right_entity: EdgeResolveDepths {
                            incoming: 1,
                            outgoing: 1,
                        },
                    },
                );
            },
        );
    }
}
