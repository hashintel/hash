use core::iter::repeat_n;
use std::collections::{HashMap, HashSet, hash_map::Entry};

use hash_graph_authorization::policies::store::{
    CreateWebParameter, PolicyStore as _, PrincipalStore as _,
};
use hash_graph_postgres_store::store::AsClient as _;
use hash_graph_store::entity::{CreateEntityParams, EntityStore as _};
use hash_graph_test_data::{data_type, entity, entity_type, property_type};
use tracing::Instrument as _;
use type_system::{
    knowledge::{
        entity::{LinkData, id::EntityUuid, provenance::ProvidedEntityEditionProvenance},
        property::{PropertyObject, PropertyObjectWithMetadata, metadata::PropertyProvenance},
    },
    ontology::{VersionedUrl, entity_type::EntityType},
    principal::{
        actor::{ActorEntityUuid, ActorId, ActorType},
        actor_group::WebId,
    },
    provenance::{OriginProvenance, OriginType},
};

use crate::util::{StoreWrapper, seed};

// TODO: Make this more representative. We'll want a lot more variation, a greater quantity of
//       types, increased number of versions, etc.
//   see https://linear.app/hash/issue/H-1628
// WARNING: Careful when reordering these, unfortunately ordering matters here due to
// interdependencies, it's flakey and a bit hacky
const SEED_DATA_TYPES: [&str; 7] = [
    data_type::VALUE_V1,
    data_type::BOOLEAN_V1,
    data_type::LIST_V1,
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
pub(crate) async fn seed_db(account_id: ActorEntityUuid, store_wrapper: &mut StoreWrapper) {
    let mut transaction = store_wrapper
        .store
        .transaction()
        .await
        .expect("failed to start transaction");

    let now = std::time::SystemTime::now();
    eprintln!("Seeding database: {}", store_wrapper.bench_db_name);

    if !transaction
        .is_web(account_id)
        .await
        .expect("Should be able to check actor")
    {
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
    }

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
                repeat_n(
                    CreateEntityParams {
                        web_id: WebId::new(account_id),
                        entity_uuid: None,
                        decision_time: None,
                        entity_type_ids: HashSet::from([entity_type_id]),
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
                    quantity,
                )
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
                entity_uuids
                    .get(*left_entity_index)
                    .unwrap_or_else(|| {
                        panic!("left entity index `{left_entity_index}` out of bounds")
                    })
                    .iter()
                    .zip(entity_uuids.get(*right_entity_index).unwrap_or_else(|| {
                        panic!("right entity index `{right_entity_index}` out of bounds")
                    }))
                    .map(|(left_entity, right_entity)| CreateEntityParams {
                        web_id: WebId::new(account_id),
                        entity_uuid: None,
                        decision_time: None,
                        entity_type_ids: HashSet::from([entity_type_id.clone()]),
                        properties: PropertyObjectWithMetadata::from_parts(
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
                        policies: Vec::new(),
                        provenance: ProvidedEntityEditionProvenance {
                            actor_type: ActorType::User,
                            origin: OriginProvenance::from_empty_type(OriginType::Api),
                            sources: Vec::new(),
                        },
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

/// DOC - TODO.
pub struct Samples {
    pub entities: HashMap<ActorEntityUuid, HashMap<VersionedUrl, Vec<EntityUuid>>>,
    pub entity_types: HashMap<ActorEntityUuid, Vec<VersionedUrl>>,
}

async fn get_samples(account_id: ActorEntityUuid, store_wrapper: &StoreWrapper) -> Samples {
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
            .instrument(tracing::info_span!(
                "SELECT",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres",
            ))
            .await
            .unwrap_or_else(|err| {
                panic!("failed to sample entities for entity type `{entity_type_id}`: {err}");
            })
            .into_iter()
            .map(|row| row.get::<_, EntityUuid>(0));

        match sample_map.entry(entity_type_id) {
            Entry::Occupied(mut entry_slot) => entry_slot.get_mut().extend(sample_entity_uuids),
            Entry::Vacant(entry_slot) => {
                entry_slot.insert(sample_entity_uuids.collect::<Vec<_>>());
            }
        }
    }

    samples
}

pub async fn setup_and_extract_samples(
    store_wrapper: &mut StoreWrapper,
    account_id: ActorEntityUuid,
) -> Samples {
    // We use the existence of the account ID as a marker for if the DB has been seeded already
    let already_seeded: bool = store_wrapper
        .store
        .as_client()
        .query_one(
            "
            SELECT EXISTS(SELECT 1 FROM web WHERE id=$1)
            ",
            &[&account_id],
        )
        .instrument(tracing::info_span!(
            "SELECT",
            otel.kind = "client",
            db.system = "postgresql",
            peer.service = "Postgres"
        ))
        .await
        .expect("failed to check if account id exists")
        .get(0);

    if !already_seeded {
        seed_db(account_id, store_wrapper).await;
    }

    get_samples(account_id, store_wrapper).await
}
