use core::{iter::repeat, str::FromStr};
use std::collections::HashSet;

use authorization::{schema::WebOwnerSubject, AuthorizationApi, NoAuthorization};
use criterion::{BatchSize::SmallInput, Bencher, BenchmarkId, Criterion};
use criterion_macro::criterion;
use graph::{
    store::{
        account::{InsertAccountIdParams, InsertWebIdParams},
        knowledge::{CreateEntityParams, GetEntitiesParams},
        query::Filter,
        AccountStore, EntityQuerySorting, EntityStore,
    },
    subgraph::temporal_axes::{
        PinnedTemporalAxisUnresolved, QueryTemporalAxesUnresolved, VariableTemporalAxisUnresolved,
    },
};
use graph_test_data::{data_type, entity, entity_type, property_type};
use graph_types::{
    account::AccountId,
    knowledge::{
        entity::{Entity, ProvidedEntityEditionProvenance},
        property::{PropertyObject, PropertyWithMetadataObject},
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

#[expect(
    clippy::significant_drop_tightening,
    reason = "transaction is committed which consumes the object"
)]
async fn seed_db<A: AuthorizationApi>(
    account_id: AccountId,
    store_wrapper: &mut StoreWrapper<A>,
    total: usize,
) -> Vec<Entity> {
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
        serde_json::from_str(entity::BOOK_V1).expect("could not parse entity");
    let entity_type: EntityType =
        serde_json::from_str(entity_type::BOOK_V1).expect("could not parse entity type");
    let entity_type_id = entity_type.id;

    let entity_list = transaction
        .create_entities(
            account_id,
            repeat(CreateEntityParams {
                owned_by_id: OwnedById::new(account_id.into_uuid()),
                entity_uuid: None,
                decision_time: None,
                entity_type_ids: HashSet::from([entity_type_id]),
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

    transaction
        .commit()
        .await
        .expect("failed to commit transaction");

    eprintln!(
        "Finished seeding database {} with {} entities after {:#?}",
        store_wrapper.bench_db_name,
        total,
        now.elapsed().expect("could not get elapsed time")
    );

    entity_list
}

pub fn bench_get_entity_by_id<A: AuthorizationApi>(
    bencher: &mut Bencher,
    runtime: &Runtime,
    store: &Store<A>,
    actor_id: AccountId,
    entity_metadata_list: &[Entity],
) {
    bencher.to_async(runtime).iter_batched(
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
                .get_entities(
                    actor_id,
                    GetEntitiesParams {
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
fn bench_scaling_read_entity(crit: &mut Criterion) {
    let group_id = "scaling_read_entity_linkless";
    let mut group = crit.benchmark_group(group_id);
    // We use a hard-coded UUID to keep it consistent across tests so that we can use it as a
    // parameter argument to criterion and get comparison analysis
    let account_id = AccountId::new(
        Uuid::from_str("bf5a9ef5-dc3b-43cf-a291-6210c0321eba").expect("invalid uuid"),
    );

    for size in [1, 10, 100, 1_000, 10_000] {
        let (runtime, mut store_wrapper) = setup(DB_NAME, true, true, account_id, NoAuthorization);

        let entity_uuids = runtime.block_on(seed_db(account_id, &mut store_wrapper, size));
        let store = &store_wrapper.store;

        let function_id = "entity_by_id";
        let parameter = format!("{size} entities");
        group.bench_with_input(
            BenchmarkId::new(function_id, &parameter),
            &(account_id, entity_uuids),
            |bencher, (_account_id, entity_list)| {
                let _guard = setup_subscriber(group_id, Some(function_id), Some(&parameter));
                bench_get_entity_by_id(bencher, &runtime, store, account_id, entity_list);
            },
        );
    }
}
