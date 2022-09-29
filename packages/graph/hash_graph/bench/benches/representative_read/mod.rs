mod knowledge;
mod ontology;

use std::{
    collections::{hash_map::Entry, HashMap},
    str::FromStr,
};

use criterion::{BenchmarkId, Criterion};
use criterion_macro::criterion;
use graph::{
    knowledge::{Entity, EntityId},
    ontology::AccountId,
    store::{AccountStore, EntityStore},
};
use graph_test_data::{data_type, entity, entity_type, link_type, property_type};
use rand::{seq::IteratorRandom, thread_rng};
use type_system::{uri::VersionedUri, EntityType};
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
    //  https://app.asana.com/0/1200211978612931/1203071961523000/f
    // We use a hard-coded UUID to keep it consistent across tests so that we can use it as a
    // parameter argument to criterion and get comparison analysis
    let account_id =
        AccountId::new(Uuid::from_str("d4e16033-c281-4cde-aa35-9085bf2e7579").unwrap());
    store_wrapper
        .store
        .insert_account_id(account_id)
        .await
        .expect("could not insert account id");

    // TODO: This is quite temporary at the moment. We'll want a lot more variation, a greater
    //  quantity of types, increased number of versions, etc.
    //  https://app.asana.com/0/0/1203072189010768/f
    // WARNING: Careful when reordering these, unfortunately ordering matters here due to
    // interdependencies, it's flakey and a bit hacky
    let (data_types, property_types, link_types, entity_types) = (
        [
            data_type::BOOLEAN_V1,
            data_type::EMPTY_LIST_V1,
            data_type::NULL_V1,
            data_type::NUMBER_V1,
            data_type::OBJECT_V1,
            data_type::TEXT_V1,
        ],
        [
            property_type::ADDRESS_LINE_1_V1,
            property_type::AGE_V1,
            property_type::BLURB_V1,
            property_type::CITY_V1,
            property_type::EMAIL_V1,
            property_type::FAVORITE_FILM_V1,
            property_type::FAVORITE_QUOTE_V1,
            property_type::FAVORITE_SONG_V1,
            property_type::HOBBY_V1,
            property_type::INTERESTS_V1,
            property_type::NAME_V1,
            property_type::NUMBERS_V1,
            property_type::PHONE_NUMBER_V1,
            property_type::POSTCODE_NUMBER_V1,
            property_type::PUBLISHED_ON_V1,
            property_type::TEXT_V1,
            property_type::USER_ID_V1,
            property_type::USER_ID_V2,
            property_type::CONTACT_INFORMATION_V1,
            property_type::CONTRIVED_PROPERTY_V1,
        ],
        [
            link_type::ACQUAINTANCE_OF_V1,
            link_type::CONTAINS_V1,
            link_type::FRIEND_OF_V1,
            link_type::LOCATED_AT_V1,
            link_type::OWNS_V1,
            link_type::OWNS_V2,
            link_type::SUBMITTED_BY_V1,
            link_type::TENANT_V1,
            link_type::WRITTEN_BY_V1,
        ],
        [
            entity_type::UK_ADDRESS_V1,
            entity_type::BLOCK_V1,
            entity_type::ORGANIZATION_V1,
            entity_type::SONG_V1,
            entity_type::PERSON_V1,
            entity_type::PAGE_V1,
            entity_type::PAGE_V2,
            entity_type::PLAYLIST_V1,
            entity_type::BOOK_V1,
            entity_type::BUILDING_V1,
        ],
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

    let mut samples = Samples {
        entities: HashMap::from([(account_id, HashMap::new())]),
    };

    let sample_map = samples.entities.get_mut(&account_id).unwrap();

    let mut rng = thread_rng();
    for (entity_type_str, entity_str, quantity) in [
        (entity_type::UK_ADDRESS_V1, entity::ADDRESS_V1, 100),
        (entity_type::BLOCK_V1, entity::BLOCK_V1, 1_000),
        (entity_type::BOOK_V1, entity::BOOK_V1, 1_000),
        (entity_type::BUILDING_V1, entity::BUILDING_V1, 1_000),
        (entity_type::ORGANIZATION_V1, entity::ORGANIZATION_V1, 1_000),
        // This is a little confusing at the moment but entity_type::PAGE_V2 refers to the entity
        // type version, but entity::PAGE_V1 refers to the version of the entity
        (entity_type::PAGE_V2, entity::PAGE_V1, 100),
        (entity_type::PAGE_V2, entity::PAGE_V2, 1_000),
        (entity_type::PERSON_V1, entity::PERSON_A_V1, 100),
        (entity_type::PERSON_V1, entity::PERSON_B_V1, 1_000),
        (entity_type::PERSON_V1, entity::PERSON_C_V1, 10_000),
        (entity_type::PLAYLIST_V1, entity::PLAYLIST_V1, 100),
        (entity_type::SONG_V1, entity::SONG_V1, 100),
    ] {
        let entity: Entity = serde_json::from_str(entity_str).expect("could not parse entity");
        let entity_type_id = EntityType::from_str(entity_type_str)
            .expect("could not parse entity type")
            .id()
            .clone();

        let store = &mut store_wrapper.store;

        let mut entity_ids = Vec::with_capacity(quantity);
        for _ in 0..quantity {
            entity_ids.push(
                store
                    .create_entity(entity.clone(), entity_type_id.clone(), account_id, None)
                    .await
                    .expect("failed to create entity")
                    .entity_id(),
            );
        }

        // For now we'll just pick a sample of 50 entities.
        let sample_entities = entity_ids
            .iter()
            .choose_multiple(&mut rng, 50)
            .into_iter()
            .copied();

        match sample_map.entry(entity_type_id) {
            Entry::Occupied(mut entry_slot) => entry_slot.get_mut().extend(sample_entities),
            Entry::Vacant(entry_slot) => {
                entry_slot.insert(sample_entities.collect::<Vec<_>>());
            }
        }
    }

    samples
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
