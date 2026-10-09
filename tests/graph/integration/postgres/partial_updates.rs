use core::{iter::once, str::FromStr as _};
use std::collections::{HashMap, HashSet};

use hash_codec::numeric::Real;
use hash_graph_postgres_store::store::AsClient as _;
use hash_graph_store::{
    entity::{
        CreateEntityParams, EntityQuerySorting, EntityStore as _, EntityValidationReport,
        PatchEntityParams, QueryEntitiesParams,
    },
    filter::Filter,
    query::Read,
    subgraph::temporal_axes::QueryTemporalAxesUnresolved,
};
use hash_graph_test_data::{data_type, entity, entity_type, property_type};
use pretty_assertions::assert_eq;
use type_system::{
    knowledge::{
        PropertyValue,
        entity::{Entity, EntityId, id::EntityUuid, provenance::ProvidedEntityEditionProvenance},
        property::{
            Property, PropertyObject, PropertyObjectWithMetadata, PropertyPatchOperation,
            PropertyPathElement, PropertyValueWithMetadata, PropertyWithMetadata,
        },
        value::{ValueMetadata, metadata::ValueProvenance},
    },
    ontology::{BaseUrl, VersionedUrl},
    principal::{actor::ActorType, actor_group::WebId},
    provenance::{OriginProvenance, OriginType},
};
use uuid::Uuid;

use crate::{DatabaseApi, DatabaseTestWrapper};

async fn seed(database: &mut DatabaseTestWrapper) -> DatabaseApi<'_> {
    database
        .seed(
            [
                data_type::VALUE_V1,
                data_type::TEXT_V1,
                data_type::NUMBER_V1,
            ],
            [
                property_type::NAME_V1,
                property_type::AGE_V1,
                property_type::FAVORITE_SONG_V1,
                property_type::FAVORITE_FILM_V1,
                property_type::HOBBY_V1,
                property_type::INTERESTS_V1,
            ],
            [
                entity_type::PERSON_V1,
                entity_type::ORGANIZATION_V1,
                entity_type::LINK_V1,
                entity_type::link::FRIEND_OF_V1,
                entity_type::link::ACQUAINTANCE_OF_V1,
            ],
        )
        .await
        .expect("could not seed database")
}

fn person_entity_type_id() -> VersionedUrl {
    VersionedUrl::from_str("https://blockprotocol.org/@alice/types/entity-type/person/v/1")
        .expect("couldn't construct entity type id")
}

fn org_entity_type_id() -> VersionedUrl {
    VersionedUrl::from_str("https://blockprotocol.org/@alice/types/entity-type/organization/v/1")
        .expect("couldn't construct entity type id")
}

fn name_property_type_id() -> BaseUrl {
    BaseUrl::new("https://blockprotocol.org/@alice/types/property-type/name/".to_owned())
        .expect("couldn't construct Base URL")
}
fn age_property_type_id() -> BaseUrl {
    BaseUrl::new("https://blockprotocol.org/@alice/types/property-type/age/".to_owned())
        .expect("couldn't construct Base URL")
}

fn alice() -> PropertyObject {
    serde_json::from_str(entity::PERSON_ALICE_V1).expect("could not parse entity")
}

#[tokio::test]
#[expect(clippy::too_many_lines)]
async fn properties_add() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity = api
        .create_entity(
            api.account_id,
            CreateEntityParams {
                web_id: WebId::new(api.account_id),
                entity_uuid: None,
                decision_time: None,
                entity_type_ids: HashSet::from([person_entity_type_id()]),
                properties: PropertyObjectWithMetadata::from_parts(alice(), None)
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
                read_only: false,
            },
        )
        .await
        .expect("could not create entity");
    let entity_id = entity.metadata.record_id.entity_id;

    api.patch_entity(
        api.account_id,
        PatchEntityParams {
            entity_id,
            decision_time: None,
            entity_type_ids: HashSet::new(),
            properties: vec![
                PropertyPatchOperation::Add {
                    path: once(PropertyPathElement::from(age_property_type_id())).collect(),
                    property: PropertyWithMetadata::Value(PropertyValueWithMetadata {
                        value: PropertyValue::Number(Real::from(30)),
                        metadata: ValueMetadata {
                            confidence: None,
                            data_type_id: None,
                            original_data_type_id: None,
                            provenance: ValueProvenance::default(),
                            canonical: HashMap::default(),
                        },
                    }),
                },
                PropertyPatchOperation::Add {
                    path: once(PropertyPathElement::from(name_property_type_id())).collect(),
                    property: PropertyWithMetadata::Value(PropertyValueWithMetadata {
                        value: PropertyValue::String("Alice Allison".to_owned()),
                        metadata: ValueMetadata {
                            confidence: None,
                            data_type_id: None,
                            original_data_type_id: None,
                            provenance: ValueProvenance::default(),
                            canonical: HashMap::default(),
                        },
                    }),
                },
            ],
            draft: None,
            archived: None,
            confidence: None,
            provenance: ProvidedEntityEditionProvenance {
                actor_type: ActorType::User,
                origin: OriginProvenance::from_empty_type(OriginType::Api),
                sources: Vec::new(),
            },
        },
    )
    .await
    .expect("could not patch entity");

    let entities = Box::pin(api.query_entities(
        Some(api.account_id),
        QueryEntitiesParams {
            filter: Filter::for_entity_by_entity_id(entity_id),
            temporal_axes: QueryTemporalAxesUnresolved::live_only(),
            sorting: EntityQuerySorting {
                paths: Vec::new(),
                cursor: None,
            },
            limit: 1000,
            conversions: Vec::new(),
            include_entity_types: None,
            include_drafts: false,
            include_permissions: false,
        },
    ))
    .await
    .expect("could not get entity")
    .entities;
    assert_eq!(entities.len(), 1, "unexpected number of entities found");
    let entity = entities.into_iter().next().unwrap();

    let properties = entity.properties.properties();
    assert_eq!(properties.len(), 2);
    assert_eq!(
        properties[&name_property_type_id()],
        PropertyValue::String("Alice Allison".to_owned())
    );
    assert_eq!(
        properties[&age_property_type_id()],
        PropertyValue::Number(Real::from(30))
    );
}

#[tokio::test]
async fn properties_remove() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity = api
        .create_entity(
            api.account_id,
            CreateEntityParams {
                web_id: WebId::new(api.account_id),
                entity_uuid: None,
                decision_time: None,
                entity_type_ids: HashSet::from([person_entity_type_id()]),
                properties: PropertyObjectWithMetadata::from_parts(alice(), None)
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
                read_only: false,
            },
        )
        .await
        .expect("could not create entity");
    let entity_id = entity.metadata.record_id.entity_id;

    api.patch_entity(
        api.account_id,
        PatchEntityParams {
            entity_id,
            decision_time: None,
            entity_type_ids: HashSet::new(),
            properties: vec![PropertyPatchOperation::Remove {
                path: once(PropertyPathElement::from(name_property_type_id())).collect(),
            }],
            draft: None,
            archived: None,
            confidence: None,
            provenance: ProvidedEntityEditionProvenance {
                actor_type: ActorType::User,
                origin: OriginProvenance::from_empty_type(OriginType::Api),
                sources: Vec::new(),
            },
        },
    )
    .await
    .expect("could not patch entity");

    let entities = Box::pin(api.query_entities(
        Some(api.account_id),
        QueryEntitiesParams {
            filter: Filter::for_entity_by_entity_id(entity_id),
            temporal_axes: QueryTemporalAxesUnresolved::live_only(),
            sorting: EntityQuerySorting {
                paths: Vec::new(),
                cursor: None,
            },
            limit: 1000,
            conversions: Vec::new(),
            include_entity_types: None,
            include_drafts: false,
            include_permissions: false,
        },
    ))
    .await
    .expect("could not get entity")
    .entities;
    assert_eq!(entities.len(), 1, "unexpected number of entities found");
    let entity = entities.into_iter().next().unwrap();

    let properties = entity.properties.properties();
    assert_eq!(properties.len(), 0);
}

#[tokio::test]
async fn properties_replace() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity = api
        .create_entity(
            api.account_id,
            CreateEntityParams {
                web_id: WebId::new(api.account_id),
                entity_uuid: None,
                decision_time: None,
                entity_type_ids: HashSet::from([person_entity_type_id()]),
                properties: PropertyObjectWithMetadata::from_parts(alice(), None)
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
                read_only: false,
            },
        )
        .await
        .expect("could not create entity");
    let entity_id = entity.metadata.record_id.entity_id;

    api.patch_entity(
        api.account_id,
        PatchEntityParams {
            entity_id,
            decision_time: None,
            entity_type_ids: HashSet::new(),
            properties: vec![PropertyPatchOperation::Replace {
                path: once(PropertyPathElement::from(name_property_type_id())).collect(),
                property: PropertyWithMetadata::Value(PropertyValueWithMetadata {
                    value: PropertyValue::String("Bob".to_owned()),
                    metadata: ValueMetadata {
                        confidence: None,
                        data_type_id: None,
                        original_data_type_id: None,
                        provenance: ValueProvenance::default(),
                        canonical: HashMap::default(),
                    },
                }),
            }],
            draft: None,
            archived: None,
            confidence: None,
            provenance: ProvidedEntityEditionProvenance {
                actor_type: ActorType::User,
                origin: OriginProvenance::from_empty_type(OriginType::Api),
                sources: Vec::new(),
            },
        },
    )
    .await
    .expect("could not patch entity");

    let entities = Box::pin(api.query_entities(
        Some(api.account_id),
        QueryEntitiesParams {
            filter: Filter::for_entity_by_entity_id(entity_id),
            temporal_axes: QueryTemporalAxesUnresolved::live_only(),
            sorting: EntityQuerySorting {
                paths: Vec::new(),
                cursor: None,
            },
            limit: 1000,
            conversions: Vec::new(),
            include_entity_types: None,
            include_drafts: false,
            include_permissions: false,
        },
    ))
    .await
    .expect("could not get entity")
    .entities;
    assert_eq!(entities.len(), 1, "unexpected number of entities found");
    let entity = entities.into_iter().next().unwrap();

    let properties = entity.properties.properties();
    assert_eq!(properties.len(), 1);
    assert_eq!(
        properties[&name_property_type_id()],
        PropertyValue::String("Bob".to_owned())
    );
}

#[tokio::test]
#[expect(clippy::too_many_lines)]
async fn type_ids() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity = api
        .create_entity(
            api.account_id,
            CreateEntityParams {
                web_id: WebId::new(api.account_id),
                entity_uuid: None,
                decision_time: None,
                entity_type_ids: HashSet::from([person_entity_type_id()]),
                properties: PropertyObjectWithMetadata::from_parts(PropertyObject::empty(), None)
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
                read_only: false,
            },
        )
        .await
        .expect("could not create entity");
    let entity_id = entity.metadata.record_id.entity_id;

    api.patch_entity(
        api.account_id,
        PatchEntityParams {
            entity_id,
            decision_time: None,
            entity_type_ids: HashSet::new(),
            properties: vec![],
            draft: None,
            archived: None,
            confidence: None,
            provenance: ProvidedEntityEditionProvenance {
                actor_type: ActorType::User,
                origin: OriginProvenance::from_empty_type(OriginType::Api),
                sources: Vec::new(),
            },
        },
    )
    .await
    .expect("could not patch entity");

    let entities = Box::pin(api.query_entities(
        Some(api.account_id),
        QueryEntitiesParams {
            filter: Filter::for_entity_by_entity_id(entity_id),
            temporal_axes: QueryTemporalAxesUnresolved::live_only(),
            sorting: EntityQuerySorting {
                paths: Vec::new(),
                cursor: None,
            },
            limit: 1000,
            conversions: Vec::new(),
            include_entity_types: None,
            include_drafts: false,
            include_permissions: false,
        },
    ))
    .await
    .expect("could not get entity")
    .entities;
    assert_eq!(entities.len(), 1, "unexpected number of entities found");
    let entity = entities.into_iter().next().unwrap();
    assert!(
        entity
            .metadata
            .entity_type_ids
            .contains(&person_entity_type_id()),
        "Entity type ids changed even though none were provided in the patch operation"
    );

    api.patch_entity(
        api.account_id,
        PatchEntityParams {
            entity_id,
            decision_time: None,
            entity_type_ids: HashSet::from([person_entity_type_id(), org_entity_type_id()]),
            properties: vec![],
            draft: None,
            archived: None,
            confidence: None,
            provenance: ProvidedEntityEditionProvenance {
                actor_type: ActorType::User,
                origin: OriginProvenance::from_empty_type(OriginType::Api),
                sources: Vec::new(),
            },
        },
    )
    .await
    .expect("could not patch entity");

    let entities = Box::pin(api.query_entities(
        Some(api.account_id),
        QueryEntitiesParams {
            filter: Filter::for_entity_by_entity_id(entity_id),
            temporal_axes: QueryTemporalAxesUnresolved::live_only(),
            sorting: EntityQuerySorting {
                paths: Vec::new(),
                cursor: None,
            },
            limit: 1000,
            conversions: Vec::new(),
            include_entity_types: None,
            include_drafts: false,
            include_permissions: false,
        },
    ))
    .await
    .expect("could not get entity")
    .entities;
    assert_eq!(entities.len(), 1, "unexpected number of entities found");
    let entity = entities.into_iter().next().unwrap();
    assert_eq!(
        entity
            .metadata
            .entity_type_ids
            .iter()
            .cloned()
            .collect::<HashSet<_>>(),
        HashSet::from([person_entity_type_id(), org_entity_type_id()]),
    );

    api.patch_entity(
        api.account_id,
        PatchEntityParams {
            entity_id,
            decision_time: None,
            entity_type_ids: HashSet::from([person_entity_type_id()]),
            properties: vec![],
            draft: None,
            archived: None,
            confidence: None,
            provenance: ProvidedEntityEditionProvenance {
                actor_type: ActorType::User,
                origin: OriginProvenance::from_empty_type(OriginType::Api),
                sources: Vec::new(),
            },
        },
    )
    .await
    .expect("could not patch entity");

    let entities = Box::pin(api.query_entities(
        Some(api.account_id),
        QueryEntitiesParams {
            filter: Filter::for_entity_by_entity_id(entity_id),
            temporal_axes: QueryTemporalAxesUnresolved::live_only(),
            sorting: EntityQuerySorting {
                paths: Vec::new(),
                cursor: None,
            },
            limit: 1000,
            conversions: Vec::new(),
            include_entity_types: None,
            include_drafts: false,
            include_permissions: false,
        },
    ))
    .await
    .expect("could not get entity")
    .entities;
    assert_eq!(entities.len(), 1, "unexpected number of entities found");
    let entity = entities.into_iter().next().unwrap();

    assert!(
        entity
            .metadata
            .entity_type_ids
            .contains(&person_entity_type_id())
    );
}

async fn create_person(api: &mut DatabaseApi<'_>) -> Entity {
    api.create_entity(
        api.account_id,
        CreateEntityParams {
            web_id: WebId::new(api.account_id),
            entity_uuid: None,
            decision_time: None,
            entity_type_ids: HashSet::from([person_entity_type_id()]),
            properties: PropertyObjectWithMetadata::from_parts(alice(), None)
                .expect("should construct person properties"),
            confidence: None,
            link_data: None,
            draft: false,
            policies: Vec::new(),
            provenance: ProvidedEntityEditionProvenance {
                actor_type: ActorType::User,
                origin: OriginProvenance::from_empty_type(OriginType::Api),
                sources: Vec::new(),
            },
            read_only: false,
        },
    )
    .await
    .expect("should create a person")
}

fn patch_params(entity_id: EntityId, properties: Vec<PropertyPatchOperation>) -> PatchEntityParams {
    PatchEntityParams {
        entity_id,
        decision_time: None,
        entity_type_ids: HashSet::new(),
        properties,
        draft: None,
        archived: None,
        confidence: None,
        provenance: ProvidedEntityEditionProvenance {
            actor_type: ActorType::User,
            origin: OriginProvenance::from_empty_type(OriginType::Api),
            sources: Vec::new(),
        },
    }
}

fn add_property(property_type_id: BaseUrl, value: PropertyValue) -> PropertyPatchOperation {
    PropertyPatchOperation::Add {
        path: once(PropertyPathElement::from(property_type_id)).collect(),
        property: PropertyWithMetadata::Value(PropertyValueWithMetadata {
            value,
            metadata: ValueMetadata::default(),
        }),
    }
}

#[tokio::test]
async fn patch_entities_input_order() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;
    let first = create_person(&mut api).await;
    let second = create_person(&mut api).await;

    let patched = api
        .patch_entities(
            api.account_id,
            vec![
                patch_params(
                    second.metadata.record_id.entity_id,
                    vec![add_property(
                        age_property_type_id(),
                        PropertyValue::Number(Real::from(20)),
                    )],
                ),
                patch_params(
                    first.metadata.record_id.entity_id,
                    vec![add_property(
                        age_property_type_id(),
                        PropertyValue::Number(Real::from(30)),
                    )],
                ),
            ],
        )
        .await
        .expect("should patch both entities");

    let [patched_second, patched_first]: [Entity; 2] = patched
        .try_into()
        .expect("should return one entity per patch");
    for (original, patched, age) in [(second, patched_second, 20), (first, patched_first, 30)] {
        assert_eq!(
            patched.metadata.record_id.entity_id, original.metadata.record_id.entity_id,
            "should return entities in input order"
        );
        assert_ne!(
            patched.metadata.record_id.edition_id, original.metadata.record_id.edition_id,
            "should create a new edition"
        );
        let stored = api
            .get_entity_by_id(
                Some(api.account_id),
                original.metadata.record_id.entity_id,
                None,
                None,
            )
            .await
            .expect("should read the patched entity");
        assert_eq!(
            stored.metadata.record_id.edition_id, patched.metadata.record_id.edition_id,
            "should persist the returned edition"
        );
        assert_eq!(
            stored.properties.properties().get(&age_property_type_id()),
            Some(&Property::Value(PropertyValue::Number(Real::from(age)))),
            "should persist the patched age"
        );
    }
}

#[tokio::test]
async fn patch_entities_missing_entity() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;
    let original = create_person(&mut api).await;
    let entity_id = original.metadata.record_id.entity_id;
    let missing_id = EntityId {
        entity_uuid: EntityUuid::new(Uuid::new_v4()),
        ..entity_id
    };

    let error = api
        .patch_entities(
            api.account_id,
            vec![
                patch_params(
                    entity_id,
                    vec![add_property(
                        age_property_type_id(),
                        PropertyValue::Number(Real::from(30)),
                    )],
                ),
                patch_params(missing_id, Vec::new()),
            ],
        )
        .await
        .expect_err("should reject a batch containing a missing entity");
    assert_eq!(
        error.downcast_ref::<hash_status::StatusCode>(),
        Some(&hash_status::StatusCode::NotFound),
        "should report the missing entity"
    );
    let stored = api
        .get_entity_by_id(Some(api.account_id), entity_id, None, None)
        .await
        .expect("should read the original entity after rollback");
    assert_eq!(stored, original, "should roll back the earlier patch");
}

#[tokio::test]
async fn patch_entities_duplicate_ids() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;
    let original = create_person(&mut api).await;
    let entity_id = original.metadata.record_id.entity_id;

    let patched = api
        .patch_entities(
            api.account_id,
            vec![
                patch_params(
                    entity_id,
                    vec![add_property(
                        name_property_type_id(),
                        PropertyValue::String("Bob".to_owned()),
                    )],
                ),
                patch_params(
                    entity_id,
                    vec![add_property(
                        age_property_type_id(),
                        PropertyValue::Number(Real::from(30)),
                    )],
                ),
            ],
        )
        .await
        .expect("should apply duplicate-ID patches sequentially");
    let [first, second]: [Entity; 2] = patched
        .try_into()
        .expect("should return both patch results");
    assert_eq!(
        first.properties.properties().get(&name_property_type_id()),
        Some(&Property::Value(PropertyValue::String("Bob".to_owned()))),
        "should apply the first patch"
    );
    assert_eq!(
        second.properties.properties().get(&name_property_type_id()),
        first.properties.properties().get(&name_property_type_id()),
        "should preserve the first patch in the second result"
    );
    assert_eq!(
        second.properties.properties().get(&age_property_type_id()),
        Some(&Property::Value(PropertyValue::Number(Real::from(30)))),
        "should apply the second patch"
    );
    assert_ne!(
        first.metadata.record_id.edition_id, second.metadata.record_id.edition_id,
        "should create an edition for each patch"
    );
    let invalid_intervals: i64 = api
        .store
        .as_client()
        .query_one(
            "SELECT count(*) FROM entity_temporal_metadata
             WHERE web_id = $1 AND entity_uuid = $2
               AND (isempty(transaction_time) OR isempty(decision_time))",
            &[&entity_id.web_id, &entity_id.entity_uuid],
        )
        .await
        .expect("should inspect duplicate patch history")
        .get(0);
    assert_eq!(
        invalid_intervals, 0,
        "should not create empty temporal intervals"
    );
    let history = Read::<Entity>::read_vec(&api.store, &[], None, true)
        .await
        .expect("should decode entity history after duplicate patches");
    assert!(
        history.iter().any(|entity| {
            entity.metadata.record_id.edition_id == original.metadata.record_id.edition_id
        }),
        "should preserve the original edition in history"
    );
    let stored = api
        .get_entity_by_id(Some(api.account_id), entity_id, None, None)
        .await
        .expect("should read the final entity");
    assert_eq!(stored, second, "should persist the combined patch result");
}

#[tokio::test]
async fn patch_entities_validation_index() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;
    let first = create_person(&mut api).await;
    let second = create_person(&mut api).await;

    let error = api
        .patch_entities(
            api.account_id,
            vec![
                patch_params(
                    first.metadata.record_id.entity_id,
                    vec![add_property(
                        age_property_type_id(),
                        PropertyValue::Number(Real::from(30)),
                    )],
                ),
                patch_params(
                    second.metadata.record_id.entity_id,
                    vec![add_property(
                        age_property_type_id(),
                        PropertyValue::String("invalid age".to_owned()),
                    )],
                ),
            ],
        )
        .await
        .expect_err("should reject an invalid age");
    let reports = error
        .downcast_ref::<HashMap<usize, EntityValidationReport>>()
        .expect("should attach indexed validation reports");
    assert_eq!(reports.len(), 1, "should report the failing patch");
    assert!(
        !reports
            .get(&1)
            .expect("should identify patch index one")
            .is_valid(),
        "should report invalid properties"
    );
    for original in [first, second] {
        let stored = api
            .get_entity_by_id(
                Some(api.account_id),
                original.metadata.record_id.entity_id,
                None,
                None,
            )
            .await
            .expect("should read the original entity after rollback");
        assert_eq!(stored, original, "should roll back the whole invalid batch");
    }
}

#[tokio::test]
async fn patch_entities_unchanged_then_changed() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;
    let unchanged = create_person(&mut api).await;
    let changed = create_person(&mut api).await;

    let patched = api
        .patch_entities(
            api.account_id,
            vec![
                patch_params(unchanged.metadata.record_id.entity_id, Vec::new()),
                patch_params(
                    changed.metadata.record_id.entity_id,
                    vec![add_property(
                        age_property_type_id(),
                        PropertyValue::Number(Real::from(30)),
                    )],
                ),
            ],
        )
        .await
        .expect("should continue after an unchanged entity");
    let [patched_unchanged, patched_changed]: [Entity; 2] = patched
        .try_into()
        .expect("should return unchanged and changed entities");
    assert_eq!(
        patched_unchanged, unchanged,
        "should retain the unchanged edition"
    );
    assert_ne!(
        patched_changed.metadata.record_id.edition_id, changed.metadata.record_id.edition_id,
        "should create an edition for the changed entity"
    );
    let stored = api
        .get_entity_by_id(
            Some(api.account_id),
            changed.metadata.record_id.entity_id,
            None,
            None,
        )
        .await
        .expect("should read the changed entity");
    assert_eq!(
        stored, patched_changed,
        "should persist the patch after the unchanged entity"
    );
}
