mod knowledge;
mod ontology;

use std::{collections::HashMap, str::FromStr};

use criterion::{BenchmarkId, Criterion};
use criterion_macro::criterion;
use graph::{
    knowledge::{Entity, EntityId},
    ontology::AccountId,
    store::{AccountStore, EntityStore},
};
use graph_test_data::{data_type, entity, entity_type, link_type, property_type};
use rand::{seq::IteratorRandom, thread_rng};
use type_system::uri::{BaseUri, VersionedUri};
use uuid::Uuid;

use crate::util::{setup, StoreWrapper};

/// DOC - TODO
struct Samples {
    pub entities: HashMap<AccountId, HashMap<VersionedUri, Vec<EntityId>>>,
}

/// Sets up the sample "representative" environment in which operations are benchmarked.
///
/// This initializes the database for all benchmarks within this module, and therefore should be a
/// single point to swap out the seeding of test data when we can invest time in creating a
/// representative environment.
async fn seed_db(store_wrapper: &mut StoreWrapper) -> Samples {
    // TODO: We'll want to test distribution across accounts
    // We use a hard-coded UUID to keep it consistent across tests so that we can use it as a
    // parameter argument to criterion and get comparison analysis
    let account_id =
        AccountId::new(Uuid::from_str("d4e16033-c281-4cde-aa35-9085bf2e7579").unwrap());
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

    let store = &mut store_wrapper.store;

    let mut entity_ids = Vec::with_capacity(100);
    for _ in 0..100 {
        entity_ids.push(
            store
                .create_entity(person.clone(), person_id.clone(), account_id, None)
                .await
                .expect("failed to create entity")
                .entity_id(),
        );
    }

    // For now we'll just pick 10 `Person` entities. We should try and sample a few types though
    let mut rng = thread_rng();
    let sampled_entity_ids = entity_ids
        .iter()
        .choose_multiple(&mut rng, 10)
        .into_iter()
        .copied()
        .collect();

    Samples {
        entities: HashMap::from([(account_id, HashMap::from([(person_id, sampled_entity_ids)]))]),
    }
}

#[criterion]
fn bench_representative_read(c: &mut Criterion) {
    let mut group = c.benchmark_group("representative_read");
    let (runtime, mut store_wrapper) = setup("representative_read");

    let samples = runtime.block_on(seed_db(&mut store_wrapper));
    let store = &store_wrapper.store;

    for (account_id, type_ids_and_entity_ids) in samples.entities {
        for (entity_type_id, entity_ids) in type_ids_and_entity_ids {
            group.bench_with_input(
                BenchmarkId::from_parameter(format!(
                    "Account ID: `{}`, Entity Type ID: `{}`",
                    account_id, entity_type_id
                )),
                &(account_id, entity_type_id, entity_ids),
                |b, (_account_id, _entity_type_id, entity_ids)| {
                    knowledge::entity::bench_get_entity_by_id(b, &runtime, store, entity_ids);
                },
            );
        }
    }
}
