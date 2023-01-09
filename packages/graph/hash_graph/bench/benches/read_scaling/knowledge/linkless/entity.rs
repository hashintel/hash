use std::{iter::repeat, str::FromStr};

use criterion::{BatchSize::SmallInput, Bencher, BenchmarkId, Criterion};
use criterion_macro::criterion;
use graph::{
    identifier::{
        account::AccountId,
        time::{
            TimespanBound, UnresolvedImage, UnresolvedKernel, UnresolvedProjection,
            UnresolvedTimeProjection,
        },
    },
    knowledge::{EntityMetadata, EntityProperties},
    provenance::{OwnedById, UpdatedById},
    store::{query::Filter, AccountStore, EntityStore, Store as _, Transaction},
    subgraph::{edges::GraphResolveDepths, query::StructuralQuery},
};
use graph_test_data::{data_type, entity, entity_type, property_type};
use rand::{prelude::IteratorRandom, thread_rng};
use tokio::runtime::Runtime;
use type_system::{repr, EntityType};
use uuid::Uuid;

use crate::util::{seed, setup, Store, StoreWrapper};

const DB_NAME: &str = "entity_scale";

async fn seed_db(
    account_id: AccountId,
    store_wrapper: &mut StoreWrapper,
    total: usize,
) -> Vec<EntityMetadata> {
    let mut transaction = store_wrapper
        .store
        .transaction()
        .await
        .expect("failed to start transaction");

    let now = std::time::SystemTime::now();
    eprintln!("Seeding database: {}", store_wrapper.bench_db_name);

    transaction
        .insert_account_id(account_id)
        .await
        .expect("could not insert account id");

    seed(
        &mut transaction,
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
    let entity_type_repr: repr::EntityType = serde_json::from_str(entity_type::BOOK_V1)
        .expect("could not parse entity type representation");
    let entity_type_id = EntityType::try_from(entity_type_repr)
        .expect("could not parse entity type")
        .id()
        .clone();

    let entity_metadata_list = transaction
        .insert_entities_batched_by_type(
            repeat((OwnedById::new(account_id), None, properties, None, None)).take(total),
            UpdatedById::new(account_id),
            &entity_type_id,
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
        now.elapsed().unwrap()
    );

    entity_metadata_list
}

pub fn bench_get_entity_by_id(
    b: &mut Bencher,
    runtime: &Runtime,
    store: &Store,
    entity_metadata_list: &[EntityMetadata],
) {
    b.to_async(runtime).iter_batched(
        || {
            // Each iteration, *before timing*, pick a random entity from the sample to
            // query
            entity_metadata_list
                .iter()
                .map(EntityMetadata::edition_id)
                .choose(&mut thread_rng())
                .unwrap()
        },
        |entity_edition_id| async move {
            store
                .get_entity(&StructuralQuery {
                    filter: Filter::for_entity_by_entity_id(entity_edition_id.base_id()),
                    graph_resolve_depths: GraphResolveDepths::default(),
                    time_projection: UnresolvedTimeProjection::DecisionTime(UnresolvedProjection {
                        kernel: UnresolvedKernel::new(None),
                        image: UnresolvedImage::new(
                            Some(TimespanBound::Unbounded),
                            Some(TimespanBound::Unbounded),
                        ),
                    }),
                })
                .await
                .expect("failed to read entity from store");
        },
        SmallInput,
    );
}

#[criterion]
fn bench_scaling_read_entity(c: &mut Criterion) {
    let mut group = c.benchmark_group("scaling_read_entity_linkless");
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
                format!("Account ID: `{account_id}`, Number Of Entities: `{size}`"),
            ),
            &(account_id, entity_uuids),
            |b, (_account_id, entity_metadata_list)| {
                bench_get_entity_by_id(b, &runtime, store, entity_metadata_list)
            },
        );
    }
}
