use std::{
    collections::{hash_map::Entry, HashMap},
    str::FromStr,
};

use graph::{
    knowledge::{Entity, EntityId},
    ontology::AccountId,
    store::{AccountStore, AsClient, EntityStore, PostgresStore},
};
use graph_test_data::{data_type, entity, entity_type, link_type, property_type};
use type_system::{uri::VersionedUri, EntityType};
use uuid::Uuid;

use crate::util::{seed, StoreWrapper};

// TODO: This is quite temporary at the moment. We'll want a lot more variation, a greater
//  quantity of types, increased number of versions, etc.
//  https://app.asana.com/0/0/1203072189010768/f
// WARNING: Careful when reordering these, unfortunately ordering matters here due to
// interdependencies, it's flakey and a bit hacky
const SEED_DATA_TYPES: [&str; 6] = [
    data_type::BOOLEAN_V1,
    data_type::EMPTY_LIST_V1,
    data_type::NULL_V1,
    data_type::NUMBER_V1,
    data_type::OBJECT_V1,
    data_type::TEXT_V1,
];

const SEED_PROPERTY_TYPES: [&str; 20] = [
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
];

const SEED_LINK_TYPES: [&str; 9] = [
    link_type::ACQUAINTANCE_OF_V1,
    link_type::CONTAINS_V1,
    link_type::FRIEND_OF_V1,
    link_type::LOCATED_AT_V1,
    link_type::OWNS_V1,
    link_type::OWNS_V2,
    link_type::SUBMITTED_BY_V1,
    link_type::TENANT_V1,
    link_type::WRITTEN_BY_V1,
];

const SEED_ENTITY_TYPES: [&str; 10] = [
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
];

const SEED_ENTITIES: [(&str, &str, usize); 12] = [
    (entity_type::UK_ADDRESS_V1, entity::ADDRESS_V1, 100),
    (entity_type::BLOCK_V1, entity::BLOCK_V1, 1_000),
    (entity_type::BOOK_V1, entity::BOOK_V1, 1_000),
    (entity_type::BUILDING_V1, entity::BUILDING_V1, 1_000),
    (entity_type::ORGANIZATION_V1, entity::ORGANIZATION_V1, 1_000),
    // This is a little confusing at the moment but entity_type::PAGE_V2 refers to the
    // entity type version, but entity::PAGE_V1 refers to the version of the
    // entity
    (entity_type::PAGE_V2, entity::PAGE_V1, 100),
    (entity_type::PAGE_V2, entity::PAGE_V2, 1_000),
    (entity_type::PERSON_V1, entity::PERSON_A_V1, 100),
    (entity_type::PERSON_V1, entity::PERSON_B_V1, 1_000),
    (entity_type::PERSON_V1, entity::PERSON_C_V1, 10_000),
    (entity_type::PLAYLIST_V1, entity::PLAYLIST_V1, 100),
    (entity_type::SONG_V1, entity::SONG_V1, 100),
];

/// Sets up the sample "representative" environment in which operations are benchmarked.
///
/// This initializes the database for all benchmarks within this module, and therefore should be a
/// single point to swap out the seeding of test data when we can invest time in creating a
/// representative environment.
async fn seed_db(account_id: AccountId, store_wrapper: &mut StoreWrapper) {
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
        SEED_DATA_TYPES,
        SEED_PROPERTY_TYPES,
        SEED_LINK_TYPES,
        SEED_ENTITY_TYPES,
    )
    .await;

    let mut total_entities = 0;
    for (entity_type_str, entity_str, quantity) in SEED_ENTITIES {
        let entity: Entity = serde_json::from_str(entity_str).expect("could not parse entity");
        let entity_type_id = EntityType::from_str(entity_type_str)
            .expect("could not parse entity type")
            .id()
            .clone();

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

        total_entities += quantity;
    }

    store
        .into_client()
        .commit()
        .await
        .expect("failed to commit transaction");

    eprintln!(
        "Finished seeding database {} with {} entities after {:#?}",
        store_wrapper.bench_db_name,
        total_entities,
        now.elapsed().unwrap()
    );
}

/// DOC - TODO
pub struct Samples {
    pub entities: HashMap<AccountId, HashMap<VersionedUri, Vec<EntityId>>>,
}

async fn get_samples(account_id: AccountId, store_wrapper: &mut StoreWrapper) -> Samples {
    let mut samples = Samples {
        entities: HashMap::from([(account_id, HashMap::new())]),
    };

    let sample_map = samples.entities.get_mut(&account_id).unwrap();

    for entity_type_id in SEED_ENTITIES.map(|(entity_type_str, ..)| {
        EntityType::from_str(entity_type_str)
            .expect("could not parse entity type")
            .id()
            .clone()
    }) {
        // For now we'll just pick a sample of 50 entities.
        let sample_entity_ids = store_wrapper
            .store
            .as_client()
            .query(
                r#"
                -- Very naive and slow sampling, we can replace when this becomes a bottleneck
                SELECT entity_id FROM entities
                INNER JOIN type_ids
                ON type_ids.version_id = entities.entity_type_version_id
                WHERE type_ids.base_uri = $1 AND type_ids.version = $2
                ORDER BY RANDOM()
                LIMIT 50
                "#,
                &[
                    &entity_type_id.base_uri().as_str(),
                    &(entity_type_id.version() as i64),
                ],
            )
            .await
            .unwrap_or_else(|err| {
                panic!("failed to sample entities for entity type `{entity_type_id}`: {err}");
            })
            .into_iter()
            .map(|row| row.get(0));

        match sample_map.entry(entity_type_id) {
            Entry::Occupied(mut entry_slot) => entry_slot.get_mut().extend(sample_entity_ids),
            Entry::Vacant(entry_slot) => {
                entry_slot.insert(sample_entity_ids.collect::<Vec<_>>());
            }
        }
    }

    samples
}

pub async fn setup_and_extract_samples(store_wrapper: &mut StoreWrapper) -> Samples {
    // TODO: We'll want to test distribution across accounts
    //  https://app.asana.com/0/1200211978612931/1203071961523000/f
    // We use a hard-coded UUID to keep it consistent across tests so that we can use it as a
    // parameter argument to criterion and get comparison analysis
    let account_id =
        AccountId::new(Uuid::from_str("d4e16033-c281-4cde-aa35-9085bf2e7579").unwrap());

    // We use the existence of the account ID as a marker for if the DB has been seeded already
    let already_seeded: bool = store_wrapper
        .store
        .as_client()
        .query_one(
            r#"
            SELECT EXISTS(SELECT 1 FROM accounts WHERE account_id=$1)
            "#,
            &[&account_id],
        )
        .await
        .expect("failed to check if account id exists")
        .get(0);

    if !(already_seeded) {
        seed_db(account_id, store_wrapper).await;
    }

    get_samples(account_id, store_wrapper).await
}
