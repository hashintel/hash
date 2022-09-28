#![feature(once_cell)]
#![feature(custom_test_frameworks)]
#![test_runner(criterion::runner)]

use criterion::{BenchmarkId, Criterion};
use criterion_macro::criterion;
use graph::{
    knowledge::{Entity, KnowledgeGraphQuery},
    ontology::AccountId,
    store::{query::Expression, AccountStore, EntityStore},
};
use graph_test_data::{data_type, entity, entity_type, link_type, property_type};
use hash_graph_bench_utils::{setup, StoreWrapper};
use type_system::uri::{BaseUri, VersionedUri};
use uuid::Uuid;

async fn seed_db(store_wrapper: &mut StoreWrapper) -> AccountId {
    let account_id = AccountId::new(Uuid::new_v4());
    store_wrapper
        .store
        .insert_account_id(account_id)
        .await
        .expect("could not insert account id");

    let (data_types, property_types, link_types, entity_types) = (
        [data_type::TEXT_V1],
        [property_type::NAME_V1],
        [link_type::FRIEND_OF_V1],
        [entity_type::ORGANIZATION_V1, entity_type::PERSON_V1],
    );

    store_wrapper
        .seed(
            account_id,
            data_types,
            property_types,
            link_types,
            entity_types,
        )
        .await;

    let person: Entity = serde_json::from_str(entity::PERSON_A_V1).expect("could not parse entity");
    let person_id = VersionedUri::new(
        BaseUri::new("https://blockprotocol.org/@alice/types/entity-type/person/".to_owned())
            .expect("couldn't construct Base URI"),
        1,
    );

    for _ in 0..100 {
        store_wrapper
            .store
            .create_entity(person.clone(), person_id.clone(), account_id, None)
            .await
            .expect("failed to create entity");
    }

    account_id
}

#[criterion]
fn bench_get_entity(c: &mut Criterion) {
    let (runtime, mut store_wrapper) = setup("get_entity");
    let entity_id = runtime.block_on(async {
        let account_id = seed_db(&mut store_wrapper).await;
        let person: Entity =
            serde_json::from_str(entity::PERSON_A_V1).expect("could not parse entity");

        store_wrapper
            .store
            .create_entity(
                person,
                VersionedUri::new(
                    BaseUri::new(
                        "https://blockprotocol.org/@alice/types/entity-type/person/".to_owned(),
                    )
                    .expect("couldn't construct Base URI"),
                    1,
                ),
                account_id,
                None,
            )
            .await
            .expect("failed to create entity")
            .entity_id()
    });

    let store = &store_wrapper.store;

    c.bench_with_input(
        BenchmarkId::new("get_entity", ""),
        &entity_id,
        |b, &entity_id| {
            b.to_async(&runtime).iter(|| async {
                let _ = store
                    .get_entity(&KnowledgeGraphQuery {
                        expression: Expression::for_latest_entity_id(entity_id),
                        data_type_query_depth: 0,
                        property_type_query_depth: 0,
                        link_type_query_depth: 0,
                        entity_type_query_depth: 0,
                        link_target_entity_query_depth: 0,
                        link_query_depth: 0,
                    })
                    .await
                    .expect("failed to read entity from store");
            });
        },
    );
}
