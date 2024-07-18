use core::{iter::repeat, str::FromStr};
use std::collections::{hash_map::Entry, HashMap, HashSet};

use authorization::{schema::WebOwnerSubject, AuthorizationApi};
use graph::store::{
    account::{InsertAccountIdParams, InsertWebIdParams},
    knowledge::CreateEntityParams,
    AccountStore, AsClient, EntityStore,
};
use graph_test_data::{data_type, entity, entity_type, property_type};
use graph_types::{
    account::AccountId,
    knowledge::{
        entity::{EntityUuid, ProvidedEntityEditionProvenance},
        link::LinkData,
        PropertyObject, PropertyProvenance, PropertyWithMetadataObject,
    },
    owned_by_id::OwnedById,
};
use type_system::{schema::EntityType, url::VersionedUrl};
use uuid::Uuid;

use crate::util::{seed, StoreWrapper};

// SEE: This is quite temporary at the moment. We'll want a lot more variation, a greater
//  quantity of types, increased number of versions, etc.
//  See https://linear.app/hash/issue/H-1628
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

const SEED_PROPERTY_TYPES: [&str; 21] = [
    property_type::ADDRESS_LINE_1_V1,
    property_type::AGE_V1,
    property_type::BUILT_AT,
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

const SEED_ENTITY_TYPES: [&str; 20] = [
    entity_type::LINK_V1,
    entity_type::link::ACQUAINTANCE_OF_V1,
    entity_type::link::CONTAINS_V1,
    entity_type::link::FRIEND_OF_V1,
    entity_type::link::LOCATED_AT_V1,
    entity_type::link::OWNS_V1,
    entity_type::link::OWNS_V2,
    entity_type::link::SUBMITTED_BY_V1,
    entity_type::link::TENANT_V1,
    entity_type::link::WRITTEN_BY_V1,
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
    (entity_type::PERSON_V1, entity::PERSON_ALICE_V1, 100),
    (entity_type::PERSON_V1, entity::PERSON_BOB_V1, 1_000),
    (entity_type::PERSON_V1, entity::PERSON_CHARLES_V1, 10_000),
    (entity_type::PLAYLIST_V1, entity::PLAYLIST_V1, 100),
    (entity_type::SONG_V1, entity::SONG_V1, 100),
];

/// Seeding data for links between entities.
///
/// The first entity is always the link entity, the second is the left entity index in
/// `SEED_ENTITIES`, the third is the right entity index in `SEED_ENTITIES`.
const SEED_LINKS: &[(&str, usize, usize)] = &[
    (entity_type::link::WRITTEN_BY_V1, 2, 7),
    (entity_type::link::WRITTEN_BY_V1, 2, 8),
    (entity_type::link::WRITTEN_BY_V1, 2, 9),
    (entity_type::link::CONTAINS_V1, 10, 11),
    (entity_type::link::WRITTEN_BY_V1, 5, 9),
    (entity_type::link::WRITTEN_BY_V1, 6, 8),
];

/// Sets up the sample "representative" environment in which operations are benchmarked.
///
/// This initializes the database for all benchmarks within this module, and therefore should be a
/// single point to swap out the seeding of test data when we can invest time in creating a
/// representative environment.
#[expect(clippy::too_many_lines)]
#[expect(
    clippy::significant_drop_tightening,
    reason = "transaction is committed which consumes the object"
)]
async fn seed_db<A: AuthorizationApi>(account_id: AccountId, store_wrapper: &mut StoreWrapper<A>) {
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
        SEED_DATA_TYPES,
        SEED_PROPERTY_TYPES,
        SEED_ENTITY_TYPES,
    )
    .await;

    let mut total_entities = 0;
    let mut total_link_entities = 0;
    let mut entity_uuids = Vec::new();
    for (entity_type_str, entity_str, quantity) in SEED_ENTITIES {
        let properties: PropertyObject =
            serde_json::from_str(entity_str).expect("could not parse entity");
        let entity_type: EntityType =
            serde_json::from_str(entity_type_str).expect("could not parse entity type");
        let entity_type_id = entity_type.id;

        let uuids = transaction
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
                .take(quantity)
                .collect(),
            )
            .await
            .expect("failed to create entities");
        entity_uuids.push(uuids);

        total_entities += quantity;
    }

    for (entity_type_str, left_entity_index, right_entity_index) in SEED_LINKS {
        let entity_type: EntityType =
            serde_json::from_str(entity_type_str).expect("could not parse entity type");
        let entity_type_id = entity_type.id;

        let uuids = transaction
            .create_entities(
                account_id,
                entity_uuids[*left_entity_index]
                    .iter()
                    .zip(&entity_uuids[*right_entity_index])
                    .map(|(left_entity, right_entity)| CreateEntityParams {
                        owned_by_id: OwnedById::new(account_id.into_uuid()),
                        entity_uuid: None,
                        decision_time: None,
                        entity_type_ids: HashSet::from([entity_type_id.clone()]),
                        properties: PropertyWithMetadataObject::from_parts(
                            PropertyObject::empty(),
                            None,
                        )
                        .expect("could not create property with metadata object"),
                        confidence: None,
                        link_data: Some(LinkData {
                            left_entity_id: left_entity.metadata.record_id.entity_id,
                            right_entity_id: right_entity.metadata.record_id.entity_id,
                            left_entity_confidence: None,
                            left_entity_provenance: PropertyProvenance::default(),
                            right_entity_confidence: None,
                            right_entity_provenance: PropertyProvenance::default(),
                        }),
                        draft: false,
                        relationships: [],
                        provenance: ProvidedEntityEditionProvenance::default(),
                    })
                    .collect(),
            )
            .await
            .expect("failed to create entities");
        total_link_entities += uuids.len();
    }

    transaction
        .commit()
        .await
        .expect("failed to commit transaction");

    eprintln!(
        "Finished seeding database {} with {} entities and {} entity links after {:#?}",
        store_wrapper.bench_db_name,
        total_entities,
        total_link_entities,
        now.elapsed().expect("failed to get elapsed time")
    );
}

/// DOC - TODO
pub struct Samples {
    pub entities: HashMap<AccountId, HashMap<VersionedUrl, Vec<EntityUuid>>>,
    pub entity_types: HashMap<AccountId, Vec<VersionedUrl>>,
}

async fn get_samples<A: AuthorizationApi>(
    account_id: AccountId,
    store_wrapper: &StoreWrapper<A>,
) -> Samples {
    let mut entity_types = HashMap::new();
    entity_types.insert(
        account_id,
        SEED_ENTITY_TYPES
            .into_iter()
            .map(|entity_type_str| {
                let entity_type: EntityType =
                    serde_json::from_str(entity_type_str).expect("could not parse entity type");
                entity_type.id
            })
            .collect(),
    );

    let mut samples = Samples {
        entities: HashMap::from([(account_id, HashMap::new())]),
        entity_types,
    };

    let sample_map = samples
        .entities
        .get_mut(&account_id)
        .expect("could not get sample map");

    for entity_type_id in SEED_ENTITIES.map(|(entity_type_str, ..)| {
        let entity_type: EntityType =
            serde_json::from_str(entity_type_str).expect("could not parse entity type");
        entity_type.id
    }) {
        // For now we'll just pick a sample of 50 entities.
        let sample_entity_uuids = store_wrapper
            .store
            .as_client()
            .query(
                "
                -- Very naive and slow sampling, we can replace when this becomes a bottleneck
                SELECT entity_uuid FROM entity_temporal_metadata
                INNER JOIN entity_is_of_type ON entity_is_of_type.entity_edition_id = \
                 entity_temporal_metadata.entity_edition_id
                INNER JOIN ontology_ids ON ontology_ids.ontology_id = \
                 entity_is_of_type.entity_type_ontology_id
                WHERE ontology_ids.base_url = $1 AND ontology_ids.version = $2
                ORDER BY RANDOM()
                LIMIT 50
                ",
                &[&entity_type_id.base_url, &entity_type_id.version],
            )
            .await
            .unwrap_or_else(|err| {
                panic!("failed to sample entities for entity type `{entity_type_id}`: {err}");
            })
            .into_iter()
            .map(|row| EntityUuid::new(row.get(0)));

        match sample_map.entry(entity_type_id) {
            Entry::Occupied(mut entry_slot) => entry_slot.get_mut().extend(sample_entity_uuids),
            Entry::Vacant(entry_slot) => {
                entry_slot.insert(sample_entity_uuids.collect::<Vec<_>>());
            }
        }
    }

    samples
}

pub async fn setup_and_extract_samples<A: AuthorizationApi>(
    store_wrapper: &mut StoreWrapper<A>,
) -> Samples {
    // TODO: We'll want to test distribution across accounts
    //   see https://linear.app/hash/issue/H-3012
    //
    // We use a hard-coded UUID to keep it consistent across tests so that we can use it as a
    // parameter argument to criterion and get comparison analysis
    let account_id = AccountId::new(
        Uuid::from_str("d4e16033-c281-4cde-aa35-9085bf2e7579").expect("invalid UUID"),
    );

    // We use the existence of the account ID as a marker for if the DB has been seeded already
    let already_seeded: bool = store_wrapper
        .store
        .as_client()
        .query_one(
            "
            SELECT EXISTS(SELECT 1 FROM accounts WHERE account_id=$1)
            ",
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
