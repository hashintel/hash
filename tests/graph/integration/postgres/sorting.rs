use alloc::borrow::Cow;
use std::collections::HashSet;

use hash_graph_store::{
    entity::{
        CreateEntityParams, EntityQueryPath, EntityQuerySorting, EntityQuerySortingRecord,
        EntityStore as _, GetEntitySubgraphParams, GetEntitySubgraphResponse,
    },
    filter::{Filter, JsonPath, PathToken},
    query::{NullOrdering, Ordering},
    subgraph::{
        edges::GraphResolveDepths,
        identifier::GraphElementVertexId,
        temporal_axes::{
            PinnedTemporalAxisUnresolved, QueryTemporalAxesUnresolved,
            VariableTemporalAxisUnresolved,
        },
    },
};
use hash_graph_test_data::{data_type, entity, entity_type, property_type};
use pretty_assertions::assert_eq;
use type_system::{
    knowledge::{
        entity::{id::EntityUuid, provenance::ProvidedEntityEditionProvenance},
        property::{PropertyObject, PropertyObjectWithMetadata},
    },
    ontology::{
        VersionedUrl,
        id::{BaseUrl, OntologyTypeVersion},
    },
    principal::{actor::ActorType, actor_group::WebId},
    provenance::{OriginProvenance, OriginType},
};
use uuid::Uuid;

use crate::{DatabaseApi, DatabaseTestWrapper};

async fn test_root_sorting_chunked<const N: usize, const M: usize>(
    api: &DatabaseApi<'_>,
    sort: [(EntityQueryPath<'static>, Ordering, NullOrdering); N],
    expected_order: [PropertyObject; M],
) {
    for chunk_size in 0..expected_order.len() {
        test_root_sorting(api, chunk_size + 1, sort.clone(), &expected_order).await;
    }
}

async fn test_root_sorting(
    api: &DatabaseApi<'_>,
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
        let GetEntitySubgraphResponse {
            mut subgraph,
            count,
            cursor: new_cursor,
            closed_multi_entity_types: _,
            definitions: _,
            web_ids: _,
            created_by_ids: _,
            edition_created_by_ids: _,
            type_ids: _,
            type_titles: _,
        } = api
            .get_entity_subgraph(
                api.account_id,
                GetEntitySubgraphParams {
                    filter: Filter::All(Vec::new()),
                    temporal_axes: QueryTemporalAxesUnresolved::DecisionTime {
                        pinned: PinnedTemporalAxisUnresolved::new(None),
                        variable: VariableTemporalAxisUnresolved::new(None, None),
                    },
                    sorting: EntityQuerySorting {
                        paths: sorting_paths.clone(),
                        cursor: Option::take(&mut cursor),
                    },
                    limit: Some(chunk_size),
                    conversions: Vec::new(),
                    graph_resolve_depths: GraphResolveDepths::default(),
                    include_count: true,
                    include_entity_types: None,
                    include_drafts: false,
                    include_web_ids: false,
                    include_created_by_ids: false,
                    include_edition_created_by_ids: false,
                    include_type_ids: false,
                    include_type_titles: false,
                },
            )
            .await
            .expect("could not get entity");
        let new_entities = subgraph
            .roots
            .into_iter()
            .filter_map(|root| match root {
                GraphElementVertexId::KnowledgeGraph(entity_vertex_id) => {
                    subgraph.vertices.entities.remove(&entity_vertex_id)
                }
                GraphElementVertexId::DataType(_)
                | GraphElementVertexId::PropertyType(_)
                | GraphElementVertexId::EntityType(_) => unreachable!(),
            })
            .collect::<Vec<_>>();
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

async fn insert(database: &mut DatabaseTestWrapper) -> DatabaseApi<'_> {
    let mut api = database
        .seed(
            [
                data_type::VALUE_V1,
                data_type::TEXT_V1,
                data_type::NUMBER_V1,
            ],
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
                web_id: WebId::new(api.account_id),
                entity_uuid: Some(EntityUuid::new(Uuid::from_u128(idx as u128))),
                decision_time: None,
                entity_type_ids: HashSet::from([type_id.clone()]),
                properties: PropertyObjectWithMetadata::from_parts(properties.clone(), None)
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
