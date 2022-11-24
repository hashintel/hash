use std::{iter::repeat, str::FromStr};

use criterion::{BatchSize::SmallInput, Bencher, BenchmarkId, Criterion};
use criterion_macro::criterion;
use graph::{
    identifier::account::AccountId,
    knowledge::{EntityProperties, EntityQueryPath, EntityUuid},
    provenance::{CreatedById, OwnedById},
    store::{
        query::{Filter, FilterExpression, Parameter},
        AccountStore, AsClient, EntityStore, PostgresStore,
    },
    subgraph::{depths::GraphResolveDepths, query::StructuralQuery},
};
use graph_test_data::{data_type, entity, entity_type, property_type};
use rand::{prelude::IteratorRandom, thread_rng};
use tokio::runtime::Runtime;
use type_system::EntityType;
use uuid::Uuid;

use crate::util::{seed, setup, Store, StoreWrapper};

const DB_NAME: &str = "entity_scale";

async fn seed_db(
    account_id: AccountId,
    store_wrapper: &mut StoreWrapper,
    total: usize,
) -> Vec<EntityUuid> {
    let transaction = store_wrapper
        .store
        .as_mut_client()
        .transaction()
        .await
        .expect("failed to start transaction");

    let mut store = PostgresStore::new(transaction);

    let now = std::time::SystemTime::now();
    eprintln!("Seeding database: {}", store_wrapper.bench_db_name);

    store
        .insert_account_id(account_id)
        .await
        .expect("could not insert account id");

    seed(
        &mut store,
        account_id,
        [data_type::TEXT_V1],
        [
            property_type::NAME_V1,
            property_type::BLURB_V1,
            property_type::PUBLISHED_ON_V1,
        ],
        [
            entity_type::LINK_V1,
            entity_type::link::FRIEND_OF_V1,
            entity_type::link::WRITTEN_BY_V1,
            entity_type::PERSON_V1,
            entity_type::BOOK_V1,
        ],
    )
    .await;

    let properties: EntityProperties =
        serde_json::from_str(entity::BOOK_V1).expect("could not parse entity");
    let entity_type_id = EntityType::from_str(entity_type::BOOK_V1)
        .expect("could not parse entity type")
        .id()
        .clone();

    let entity_uuids = store
        .insert_entities_batched_by_type(
            repeat((None, properties, None)).take(total),
            entity_type_id,
            OwnedById::new(account_id),
            CreatedById::new(account_id),
        )
        .await
        .expect("failed to create entities");

    store
        .into_client()
        .commit()
        .await
        .expect("failed to commit transaction");

    eprintln!(
        "Finished seeding database {} with {} entities after {:#?}",
        store_wrapper.bench_db_name,
        total,
        now.elapsed().unwrap()
    );

    entity_uuids
}

pub fn bench_get_entity_by_id(
    b: &mut Bencher,
    runtime: &Runtime,
    store: &Store,
    entity_uuids: &[EntityUuid],
) {
    b.to_async(runtime).iter_batched(
        || {
            // Each iteration, *before timing*, pick a random entity from the sample to
            // query
            *entity_uuids.iter().choose(&mut thread_rng()).unwrap()
        },
        |entity_uuid| async move {
            store
                .get_entity(&StructuralQuery {
                    filter: Filter::Equal(
                        Some(FilterExpression::Path(EntityQueryPath::Uuid)),
                        Some(FilterExpression::Parameter(Parameter::Uuid(
                            entity_uuid.as_uuid(),
                        ))),
                    ),
                    graph_resolve_depths: GraphResolveDepths::default(),
                })
                .await
                .expect("failed to read entity from store");
        },
        SmallInput,
    );
}

#[criterion]
fn bench_scaling_read_entity(c: &mut Criterion) {
    let mut group = c.benchmark_group("scaling_read_entity");
    // We use a hard-coded UUID to keep it consistent across tests so that we can use it as a
    // parameter argument to criterion and get comparison analysis
    let account_id =
        AccountId::new(Uuid::from_str("bf5a9ef5-dc3b-43cf-a291-6210c0321eba").unwrap());

    for size in [1, 10, 100, 1_000, 10_000] {
        let (runtime, mut store_wrapper) = setup(DB_NAME, true, true);

        let entity_uuids = runtime.block_on(seed_db(account_id, &mut store_wrapper, size));
        let store = &store_wrapper.store;

        group.bench_with_input(
            BenchmarkId::new(
                "get_entity_by_id",
                format!(
                    "Account ID: `{}`, Number Of Entities: `{}`",
                    account_id, size
                ),
            ),
            &(account_id, entity_uuids),
            |b, (_account_id, entity_uuids)| {
                bench_get_entity_by_id(b, &runtime, store, entity_uuids)
            },
        );
    }
}
