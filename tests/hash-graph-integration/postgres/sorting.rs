use alloc::borrow::Cow;
use std::collections::HashSet;

use authorization::AuthorizationApi;
use graph::{
    knowledge::EntityQueryPath,
    store::{
        knowledge::{CreateEntityParams, GetEntitiesParams, GetEntitiesResponse},
        query::{Filter, JsonPath, PathToken},
        EntityQuerySorting, EntityQuerySortingRecord, EntityStore, NullOrdering, Ordering,
    },
    subgraph::temporal_axes::{
        PinnedTemporalAxisUnresolved, QueryTemporalAxesUnresolved, VariableTemporalAxisUnresolved,
    },
};
use graph_test_data::{data_type, entity, entity_type, property_type};
use graph_types::{
    knowledge::{
        entity::{EntityUuid, ProvidedEntityEditionProvenance},
        PropertyMetadataMap, PropertyObject,
    },
    owned_by_id::OwnedById,
};
use pretty_assertions::assert_eq;
use type_system::url::{BaseUrl, OntologyTypeVersion, VersionedUrl};
use uuid::Uuid;

use crate::{DatabaseApi, DatabaseTestWrapper};

async fn test_root_sorting_chunked<const N: usize, const M: usize, A: AuthorizationApi>(
    api: &DatabaseApi<'_, A>,
    sort: [(EntityQueryPath<'static>, Ordering, NullOrdering); N],
    expected_order: [PropertyObject; M],
) {
    for chunk_size in 0..expected_order.len() {
        test_root_sorting(api, chunk_size + 1, sort.clone(), &expected_order).await;
    }
}

async fn test_root_sorting<A: AuthorizationApi>(
    api: &DatabaseApi<'_, A>,
    chunk_size: usize,
    sort: impl IntoIterator<Item = (EntityQueryPath<'static>, Ordering, NullOrdering)> + Send,
    expected_order: impl IntoIterator<Item = &PropertyObject> + Send,
) {
    let sorting_paths = sort
        .into_iter()
        .map(|(path, ordering, nulls)| EntityQuerySortingRecord {
            path,
            ordering,
            nulls: Some(nulls),
        })
        .collect::<Vec<_>>();
    let mut cursor = None;
    let expected_order = expected_order.into_iter().collect::<Vec<_>>();

    let mut found_entities = HashSet::new();
    let mut entities = Vec::new();

    loop {
        let GetEntitiesResponse {
            entities: new_entities,
            count,
            cursor: new_cursor,
        } = api
            .get_entities(
                api.account_id,
                GetEntitiesParams {
                    filter: Filter::All(Vec::new()),
                    temporal_axes: QueryTemporalAxesUnresolved::DecisionTime {
                        pinned: PinnedTemporalAxisUnresolved::new(None),
                        variable: VariableTemporalAxisUnresolved::new(None, None),
                    },
                    sorting: EntityQuerySorting {
                        paths: sorting_paths.clone(),
                        cursor: cursor.take(),
                    },
                    limit: Some(chunk_size),
                    include_count: true,
                    include_drafts: false,
                },
            )
            .await
            .expect("could not get entity");
        assert_eq!(count, Some(expected_order.len()));
        let num_entities = new_entities.len();

        for entity in new_entities {
            assert!(
                found_entities.insert(entity.metadata.record_id.entity_id),
                "duplicate entity found: {:#?}",
                entity.properties
            );
            entities.push(entity);
        }
        if num_entities < chunk_size {
            break;
        }
        if let Some(new_cursor) = new_cursor {
            cursor.replace(new_cursor);
        }
    }

    assert_eq!(
        entities
            .iter()
            .map(|entity| &entity.properties)
            .collect::<Vec<_>>(),
        expected_order.into_iter().collect::<Vec<_>>()
    );
}

async fn insert<A: AuthorizationApi>(
    database: &mut DatabaseTestWrapper<A>,
) -> DatabaseApi<'_, &mut A> {
    let mut api = database
        .seed(
            [data_type::TEXT_V1, data_type::NUMBER_V1],
            [
                property_type::NAME_V1,
                property_type::AGE_V1,
                property_type::TEXT_V1,
                property_type::FAVORITE_SONG_V1,
                property_type::FAVORITE_FILM_V1,
                property_type::HOBBY_V1,
                property_type::INTERESTS_V1,
            ],
            [
                entity_type::PERSON_V1,
                entity_type::PAGE_V1,
                entity_type::LINK_V1,
                entity_type::link::FRIEND_OF_V1,
                entity_type::link::ACQUAINTANCE_OF_V1,
            ],
        )
        .await
        .expect("could not seed database");

    let person_entity_type = VersionedUrl {
        base_url: BaseUrl::new(
            "https://blockprotocol.org/@alice/types/entity-type/person/".to_owned(),
        )
        .expect("couldn't construct Base URL"),
        version: OntologyTypeVersion::new(1),
    };
    let page_entity_type = VersionedUrl {
        base_url: BaseUrl::new(
            "https://blockprotocol.org/@alice/types/entity-type/page/".to_owned(),
        )
        .expect("couldn't construct Base URL"),
        version: OntologyTypeVersion::new(1),
    };
    let entities_properties = [
        (entity::PERSON_ALICE_V1, &person_entity_type),
        (entity::PERSON_BOB_V1, &person_entity_type),
        (entity::PERSON_CHARLES_V1, &person_entity_type),
        (entity::PAGE_V1, &page_entity_type),
        (entity::PAGE_V2, &page_entity_type),
    ];

    for (idx, (entity, type_id)) in entities_properties.into_iter().enumerate() {
        let properties: PropertyObject =
            serde_json::from_str(entity).expect("could not parse entity");
        api.create_entity(
            api.account_id,
            CreateEntityParams {
                owned_by_id: OwnedById::new(api.account_id.into_uuid()),
                entity_uuid: Some(EntityUuid::new(Uuid::from_u128(idx as u128))),
                decision_time: None,
                entity_type_ids: vec![type_id.clone()],
                properties: properties.clone(),
                confidence: None,
                property_metadata: PropertyMetadataMap::default(),
                link_data: None,
                draft: false,
                relationships: [],
                provenance: ProvidedEntityEditionProvenance::default(),
            },
        )
        .await
        .expect("could not create entity");
    }

    api
}

fn age_property_path() -> EntityQueryPath<'static> {
    EntityQueryPath::Properties(Some(JsonPath::from_path_tokens(vec![PathToken::Field(
        Cow::Borrowed("https://blockprotocol.org/@alice/types/property-type/age/"),
    )])))
}
fn name_property_path() -> EntityQueryPath<'static> {
    EntityQueryPath::Properties(Some(JsonPath::from_path_tokens(vec![PathToken::Field(
        Cow::Borrowed("https://blockprotocol.org/@alice/types/property-type/name/"),
    )])))
}

fn alice() -> PropertyObject {
    serde_json::from_str(entity::PERSON_ALICE_V1).expect("could not parse entity")
}

fn bob() -> PropertyObject {
    serde_json::from_str(entity::PERSON_BOB_V1).expect("could not parse entity")
}

fn charles() -> PropertyObject {
    serde_json::from_str(entity::PERSON_CHARLES_V1).expect("could not parse entity")
}

fn page_v1() -> PropertyObject {
    serde_json::from_str(entity::PAGE_V1).expect("could not parse entity")
}

fn page_v2() -> PropertyObject {
    serde_json::from_str(entity::PAGE_V2).expect("could not parse entity")
}

#[tokio::test]
async fn uuid_ascending() {
    let mut database = DatabaseTestWrapper::new().await;
    let api = insert(&mut database).await;

    test_root_sorting_chunked(
        &api,
        [(
            EntityQueryPath::Uuid,
            Ordering::Ascending,
            NullOrdering::First,
        )],
        [alice(), bob(), charles(), page_v1(), page_v2()],
    )
    .await;
}

#[tokio::test]
async fn uuid_descending() {
    let mut database = DatabaseTestWrapper::new().await;
    let api = insert(&mut database).await;

    test_root_sorting_chunked(
        &api,
        [(
            EntityQueryPath::Uuid,
            Ordering::Descending,
            NullOrdering::Last,
        )],
        [page_v2(), page_v1(), charles(), bob(), alice()],
    )
    .await;
}

#[tokio::test]
async fn age_ascending_last() {
    let mut database = DatabaseTestWrapper::new().await;
    let api = insert(&mut database).await;

    test_root_sorting_chunked(
        &api,
        [
            (age_property_path(), Ordering::Ascending, NullOrdering::Last),
            (
                EntityQueryPath::Uuid,
                Ordering::Ascending,
                NullOrdering::Last,
            ),
        ],
        [bob(), charles(), alice(), page_v1(), page_v2()],
    )
    .await;
}

#[tokio::test]
async fn age_ascending_first() {
    let mut database = DatabaseTestWrapper::new().await;
    let api = insert(&mut database).await;

    test_root_sorting_chunked(
        &api,
        [
            (
                age_property_path(),
                Ordering::Ascending,
                NullOrdering::First,
            ),
            (
                EntityQueryPath::Uuid,
                Ordering::Ascending,
                NullOrdering::Last,
            ),
        ],
        [alice(), page_v1(), page_v2(), bob(), charles()],
    )
    .await;
}

#[tokio::test]
async fn age_descending_last() {
    let mut database = DatabaseTestWrapper::new().await;
    let api = insert(&mut database).await;
    test_root_sorting_chunked(
        &api,
        [
            (
                age_property_path(),
                Ordering::Descending,
                NullOrdering::Last,
            ),
            (
                EntityQueryPath::Uuid,
                Ordering::Ascending,
                NullOrdering::Last,
            ),
        ],
        [bob(), charles(), alice(), page_v1(), page_v2()],
    )
    .await;
}

#[tokio::test]
async fn age_descending_first() {
    let mut database = DatabaseTestWrapper::new().await;
    let api = insert(&mut database).await;
    test_root_sorting_chunked(
        &api,
        [
            (
                age_property_path(),
                Ordering::Descending,
                NullOrdering::First,
            ),
            (
                EntityQueryPath::Uuid,
                Ordering::Ascending,
                NullOrdering::Last,
            ),
        ],
        [alice(), page_v1(), page_v2(), bob(), charles()],
    )
    .await;
}

#[tokio::test]
async fn age_ascending_last_name_ascending_last() {
    let mut database = DatabaseTestWrapper::new().await;
    let api = insert(&mut database).await;
    test_root_sorting_chunked(
        &api,
        [
            (age_property_path(), Ordering::Ascending, NullOrdering::Last),
            (
                name_property_path(),
                Ordering::Ascending,
                NullOrdering::Last,
            ),
            (
                EntityQueryPath::Uuid,
                Ordering::Ascending,
                NullOrdering::Last,
            ),
        ],
        [bob(), charles(), alice(), page_v1(), page_v2()],
    )
    .await;
}

#[tokio::test]
async fn age_ascending_last_name_ascending_first() {
    let mut database = DatabaseTestWrapper::new().await;
    let api = insert(&mut database).await;
    test_root_sorting_chunked(
        &api,
        [
            (age_property_path(), Ordering::Ascending, NullOrdering::Last),
            (
                name_property_path(),
                Ordering::Ascending,
                NullOrdering::First,
            ),
            (
                EntityQueryPath::Uuid,
                Ordering::Ascending,
                NullOrdering::Last,
            ),
        ],
        [bob(), charles(), page_v1(), page_v2(), alice()],
    )
    .await;
}

#[tokio::test]
async fn age_ascending_first_name_ascending_last() {
    let mut database = DatabaseTestWrapper::new().await;
    let api = insert(&mut database).await;
    test_root_sorting_chunked(
        &api,
        [
            (
                age_property_path(),
                Ordering::Ascending,
                NullOrdering::First,
            ),
            (
                name_property_path(),
                Ordering::Ascending,
                NullOrdering::Last,
            ),
            (
                EntityQueryPath::Uuid,
                Ordering::Ascending,
                NullOrdering::Last,
            ),
        ],
        [alice(), page_v1(), page_v2(), bob(), charles()],
    )
    .await;
}

#[tokio::test]
async fn age_ascending_first_name_ascending_first() {
    let mut database = DatabaseTestWrapper::new().await;
    let api = insert(&mut database).await;
    test_root_sorting_chunked(
        &api,
        [
            (
                age_property_path(),
                Ordering::Ascending,
                NullOrdering::First,
            ),
            (
                name_property_path(),
                Ordering::Ascending,
                NullOrdering::First,
            ),
            (
                EntityQueryPath::Uuid,
                Ordering::Ascending,
                NullOrdering::Last,
            ),
        ],
        [page_v1(), page_v2(), alice(), bob(), charles()],
    )
    .await;
}

#[tokio::test]
async fn age_ascending_last_name_descending_last() {
    let mut database = DatabaseTestWrapper::new().await;
    let api = insert(&mut database).await;
    test_root_sorting_chunked(
        &api,
        [
            (age_property_path(), Ordering::Ascending, NullOrdering::Last),
            (
                name_property_path(),
                Ordering::Descending,
                NullOrdering::Last,
            ),
            (
                EntityQueryPath::Uuid,
                Ordering::Ascending,
                NullOrdering::Last,
            ),
        ],
        [charles(), bob(), alice(), page_v1(), page_v2()],
    )
    .await;
}

#[tokio::test]
async fn age_ascending_first_name_descending_last() {
    let mut database = DatabaseTestWrapper::new().await;
    let api = insert(&mut database).await;
    test_root_sorting_chunked(
        &api,
        [
            (
                age_property_path(),
                Ordering::Ascending,
                NullOrdering::First,
            ),
            (
                name_property_path(),
                Ordering::Descending,
                NullOrdering::Last,
            ),
            (
                EntityQueryPath::Uuid,
                Ordering::Ascending,
                NullOrdering::Last,
            ),
        ],
        [alice(), page_v1(), page_v2(), charles(), bob()],
    )
    .await;
}

#[tokio::test]
async fn age_ascending_last_name_descending_first() {
    let mut database = DatabaseTestWrapper::new().await;
    let api = insert(&mut database).await;
    test_root_sorting_chunked(
        &api,
        [
            (age_property_path(), Ordering::Ascending, NullOrdering::Last),
            (
                name_property_path(),
                Ordering::Descending,
                NullOrdering::First,
            ),
            (
                EntityQueryPath::Uuid,
                Ordering::Ascending,
                NullOrdering::Last,
            ),
        ],
        [charles(), bob(), page_v1(), page_v2(), alice()],
    )
    .await;
}

#[tokio::test]
async fn age_ascending_first_name_descending_first() {
    let mut database = DatabaseTestWrapper::new().await;
    let api = insert(&mut database).await;
    test_root_sorting_chunked(
        &api,
        [
            (
                age_property_path(),
                Ordering::Ascending,
                NullOrdering::First,
            ),
            (
                name_property_path(),
                Ordering::Descending,
                NullOrdering::First,
            ),
            (
                EntityQueryPath::Uuid,
                Ordering::Ascending,
                NullOrdering::Last,
            ),
        ],
        [page_v1(), page_v2(), alice(), charles(), bob()],
    )
    .await;
}

#[tokio::test]
async fn age_descending_last_name_ascending_last() {
    let mut database = DatabaseTestWrapper::new().await;
    let api = insert(&mut database).await;
    test_root_sorting_chunked(
        &api,
        [
            (
                age_property_path(),
                Ordering::Descending,
                NullOrdering::Last,
            ),
            (
                name_property_path(),
                Ordering::Ascending,
                NullOrdering::Last,
            ),
            (
                EntityQueryPath::Uuid,
                Ordering::Ascending,
                NullOrdering::Last,
            ),
        ],
        [bob(), charles(), alice(), page_v1(), page_v2()],
    )
    .await;
}

#[tokio::test]
async fn age_descending_first_name_ascending_last() {
    let mut database = DatabaseTestWrapper::new().await;
    let api = insert(&mut database).await;
    test_root_sorting_chunked(
        &api,
        [
            (
                age_property_path(),
                Ordering::Descending,
                NullOrdering::First,
            ),
            (
                name_property_path(),
                Ordering::Ascending,
                NullOrdering::Last,
            ),
            (
                EntityQueryPath::Uuid,
                Ordering::Ascending,
                NullOrdering::Last,
            ),
        ],
        [alice(), page_v1(), page_v2(), bob(), charles()],
    )
    .await;
}

#[tokio::test]
async fn age_descending_last_name_ascending_first() {
    let mut database = DatabaseTestWrapper::new().await;
    let api = insert(&mut database).await;
    test_root_sorting_chunked(
        &api,
        [
            (
                age_property_path(),
                Ordering::Descending,
                NullOrdering::Last,
            ),
            (
                name_property_path(),
                Ordering::Ascending,
                NullOrdering::First,
            ),
            (
                EntityQueryPath::Uuid,
                Ordering::Ascending,
                NullOrdering::Last,
            ),
        ],
        [bob(), charles(), page_v1(), page_v2(), alice()],
    )
    .await;
}

#[tokio::test]
async fn age_descending_first_name_ascending_first() {
    let mut database = DatabaseTestWrapper::new().await;
    let api = insert(&mut database).await;
    test_root_sorting_chunked(
        &api,
        [
            (
                age_property_path(),
                Ordering::Descending,
                NullOrdering::First,
            ),
            (
                name_property_path(),
                Ordering::Ascending,
                NullOrdering::First,
            ),
            (
                EntityQueryPath::Uuid,
                Ordering::Ascending,
                NullOrdering::Last,
            ),
        ],
        [page_v1(), page_v2(), alice(), bob(), charles()],
    )
    .await;
}

#[tokio::test]
async fn age_descending_last_name_descending_last() {
    let mut database = DatabaseTestWrapper::new().await;
    let api = insert(&mut database).await;
    test_root_sorting_chunked(
        &api,
        [
            (
                age_property_path(),
                Ordering::Descending,
                NullOrdering::Last,
            ),
            (
                name_property_path(),
                Ordering::Descending,
                NullOrdering::Last,
            ),
            (
                EntityQueryPath::Uuid,
                Ordering::Ascending,
                NullOrdering::Last,
            ),
        ],
        [charles(), bob(), alice(), page_v1(), page_v2()],
    )
    .await;
}

#[tokio::test]
async fn age_descending_first_name_descending_last() {
    let mut database = DatabaseTestWrapper::new().await;
    let api = insert(&mut database).await;
    test_root_sorting_chunked(
        &api,
        [
            (
                age_property_path(),
                Ordering::Descending,
                NullOrdering::First,
            ),
            (
                name_property_path(),
                Ordering::Descending,
                NullOrdering::Last,
            ),
            (
                EntityQueryPath::Uuid,
                Ordering::Ascending,
                NullOrdering::Last,
            ),
        ],
        [alice(), page_v1(), page_v2(), charles(), bob()],
    )
    .await;
}

#[tokio::test]
async fn age_descending_last_name_descending_first() {
    let mut database = DatabaseTestWrapper::new().await;
    let api = insert(&mut database).await;
    test_root_sorting_chunked(
        &api,
        [
            (
                age_property_path(),
                Ordering::Descending,
                NullOrdering::Last,
            ),
            (
                name_property_path(),
                Ordering::Descending,
                NullOrdering::First,
            ),
            (
                EntityQueryPath::Uuid,
                Ordering::Ascending,
                NullOrdering::Last,
            ),
        ],
        [charles(), bob(), page_v1(), page_v2(), alice()],
    )
    .await;
}

#[tokio::test]
async fn age_descending_first_name_descending_first() {
    let mut database = DatabaseTestWrapper::new().await;
    let api = insert(&mut database).await;
    test_root_sorting_chunked(
        &api,
        [
            (
                age_property_path(),
                Ordering::Descending,
                NullOrdering::First,
            ),
            (
                name_property_path(),
                Ordering::Descending,
                NullOrdering::First,
            ),
            (
                EntityQueryPath::Uuid,
                Ordering::Ascending,
                NullOrdering::Last,
            ),
        ],
        [page_v1(), page_v2(), alice(), charles(), bob()],
    )
    .await;
}
