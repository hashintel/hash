use core::{iter::once, str::FromStr as _};
use std::collections::{HashMap, HashSet};

use hash_codec::numeric::Real;
use hash_graph_authorization::policies::{
    Effect,
    action::ActionName,
    resource::{EntityResourceConstraint, EntityResourceFilter, ResourceConstraint},
    store::PolicyCreationParams,
};
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
use hash_graph_temporal_versioning::{
    ClosedTemporalBound, DecisionTime, OpenTemporalBound, Timestamp,
};
use hash_graph_test_data::{data_type, entity, entity_type, property_type};
use hash_status::StatusCode;
use pretty_assertions::assert_eq;
use time::Duration;
use type_system::{
    knowledge::{
        PropertyValue,
        entity::{
            Entity, EntityId, LinkData, id::EntityUuid, provenance::ProvidedEntityEditionProvenance,
        },
        property::{
            Property, PropertyObject, PropertyObjectWithMetadata, PropertyPatchOperation,
            PropertyPathElement, PropertyValueWithMetadata, PropertyWithMetadata,
            metadata::PropertyProvenance,
        },
        value::{ValueMetadata, metadata::ValueProvenance},
    },
    ontology::{BaseUrl, VersionedUrl},
    principal::{
        actor::{ActorEntityUuid, ActorId, ActorType},
        actor_group::WebId,
    },
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
    create_person_at(api, None).await
}

async fn create_person_at(
    api: &mut DatabaseApi<'_>,
    decision_time: Option<Timestamp<DecisionTime>>,
) -> Entity {
    api.create_entity(
        api.account_id,
        CreateEntityParams {
            web_id: WebId::new(api.account_id),
            entity_uuid: None,
            decision_time,
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
            .expect("should read the patched entity")
            .expect("the patched entity should exist");
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
        .expect("should read the original entity after rollback")
        .expect("the original entity should exist");
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
    let cached_editions: i64 = api
        .store
        .as_client()
        .query_one(
            "SELECT count(*) FROM entity_edition_cache
             WHERE entity_edition_id = ANY($1) AND versioned_urls = ARRAY[$2::TEXT]",
            &[
                &vec![
                    first.metadata.record_id.edition_id,
                    second.metadata.record_id.edition_id,
                ],
                &person_entity_type_id().to_string(),
            ],
        )
        .await
        .expect("should read cache entries for both new editions")
        .get(0);
    assert_eq!(
        cached_editions, 2,
        "should cache intermediate and final editions with their new types"
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
        .expect("should read the final entity")
        .expect("the final entity should exist");
    assert_eq!(stored, second, "should persist the combined patch result");
}

#[tokio::test]
async fn patch_entities_live_then_publish() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;
    let original = create_person(&mut api).await;
    let live_id = original.metadata.record_id.entity_id;
    let mut create_draft = patch_params(
        live_id,
        vec![add_property(
            name_property_type_id(),
            PropertyValue::String("Draft".to_owned()),
        )],
    );
    create_draft.draft = Some(true);
    let draft = api
        .patch_entity(api.account_id, create_draft)
        .await
        .expect("should create a draft of the live entity");
    let mut publish = patch_params(draft.metadata.record_id.entity_id, Vec::new());
    publish.draft = Some(false);
    let patched = api
        .patch_entities(
            api.account_id,
            vec![
                patch_params(
                    live_id,
                    vec![add_property(
                        age_property_type_id(),
                        PropertyValue::Number(Real::from(30)),
                    )],
                ),
                publish,
            ],
        )
        .await
        .expect("should update the live entity and publish its draft in one batch");
    let [updated, published]: [Entity; 2] = patched
        .try_into()
        .expect("should return both patch results");
    assert_eq!(
        updated.properties.properties().get(&age_property_type_id()),
        Some(&Property::Value(PropertyValue::Number(Real::from(30)))),
        "should apply the live update before publication"
    );
    assert_eq!(
        published.metadata.record_id.entity_id, live_id,
        "should publish the draft as the live entity"
    );
    assert_eq!(
        published.properties, draft.properties,
        "should publish the draft properties"
    );
    let stored = api
        .get_entity_by_id(Some(api.account_id), live_id, None, None)
        .await
        .expect("should read the published entity")
        .expect("the published entity should exist");
    assert_eq!(stored, published, "should persist the published edition");
    let history = Read::<Entity>::read_vec(&api.store, &[], None, true)
        .await
        .expect("should decode history without empty temporal intervals");
    for previous in [original, draft] {
        assert!(
            history.iter().any(|entity| {
                entity.metadata.record_id.edition_id == previous.metadata.record_id.edition_id
            }),
            "should preserve editions that existed before the batch"
        );
    }
    assert!(
        !history.iter().any(|entity| {
            entity.metadata.record_id.edition_id == updated.metadata.record_id.edition_id
        }),
        "should omit the intermediate edition with no temporal duration"
    );
}

#[tokio::test]
async fn patch_entities_publish_existing_decision_start() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;
    let original = create_person(&mut api).await;
    let live_id = original.metadata.record_id.entity_id;
    let ClosedTemporalBound::Inclusive(decision_time) =
        *original.metadata.temporal_versioning.decision_time.start();
    let mut create_draft = patch_params(
        live_id,
        vec![add_property(
            name_property_type_id(),
            PropertyValue::String("Draft".to_owned()),
        )],
    );
    create_draft.draft = Some(true);
    create_draft.decision_time = Some(decision_time);
    let draft = api
        .patch_entity(api.account_id, create_draft)
        .await
        .expect("should create a draft at the original decision-time start");
    let mut publish = patch_params(draft.metadata.record_id.entity_id, Vec::new());
    publish.draft = Some(false);
    publish.decision_time = Some(decision_time);
    let [published]: [Entity; 1] = api
        .patch_entities(api.account_id, vec![publish])
        .await
        .expect("should publish at the existing decision-time start")
        .try_into()
        .expect("should return the published entity");
    let stored = api
        .get_entity_by_id(Some(api.account_id), live_id, None, None)
        .await
        .expect("should read the published entity")
        .expect("the published entity should exist");
    assert_eq!(stored, published, "should persist the published edition");
    assert_eq!(
        published.properties, draft.properties,
        "should publish the draft properties"
    );
    let history = Read::<Entity>::read_vec(&api.store, &[], None, true)
        .await
        .expect("should decode history without empty intervals");
    let previous = history
        .iter()
        .find(|entity| {
            entity.metadata.record_id.edition_id == original.metadata.record_id.edition_id
        })
        .expect("should preserve the original live edition in transaction history");
    assert_eq!(
        previous.metadata.temporal_versioning.decision_time,
        original.metadata.temporal_versioning.decision_time,
        "should preserve the original decision-time interval"
    );
    assert_eq!(
        previous
            .metadata
            .temporal_versioning
            .transaction_time
            .start(),
        original
            .metadata
            .temporal_versioning
            .transaction_time
            .start(),
        "should preserve the original transaction-time start"
    );
    let ClosedTemporalBound::Inclusive(publication_time) = *published
        .metadata
        .temporal_versioning
        .transaction_time
        .start();
    assert_eq!(
        previous.metadata.temporal_versioning.transaction_time.end(),
        &OpenTemporalBound::Exclusive(publication_time),
        "should end the original transaction history at publication"
    );
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
            .expect("should read the original entity after rollback")
            .expect("the original entity should exist");
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
        .expect("should read the changed entity")
        .expect("the changed entity should exist");
    assert_eq!(
        stored, patched_changed,
        "should persist the patch after the unchanged entity"
    );
}

async fn assert_current_entity(api: &mut DatabaseApi<'_>, entity_id: EntityId, expected: &Entity) {
    let actual = api
        .get_entity_by_id(Some(api.account_id), entity_id, None, None)
        .await
        .expect("should read the current entity")
        .expect("the current entity should exist");
    assert_eq!(
        &actual, expected,
        "should persist the expected current entity"
    );
}

async fn create_friend_link(api: &mut DatabaseApi<'_>, left: EntityId, right: EntityId) -> Entity {
    api.create_entity(
        api.account_id,
        CreateEntityParams {
            web_id: WebId::new(api.account_id),
            entity_uuid: None,
            decision_time: None,
            entity_type_ids: HashSet::from([
                "https://blockprotocol.org/@alice/types/entity-type/friend-of/v/1"
                    .parse()
                    .expect("friend link type URL should be valid"),
            ]),
            properties: PropertyObjectWithMetadata::from_parts(PropertyObject::empty(), None)
                .expect("link properties should be valid"),
            confidence: None,
            link_data: Some(LinkData {
                left_entity_id: left,
                right_entity_id: right,
                left_entity_confidence: None,
                right_entity_confidence: None,
                left_entity_provenance: PropertyProvenance::default(),
                right_entity_provenance: PropertyProvenance::default(),
            }),
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
    .expect("should create the friend link")
}

#[tokio::test]
async fn patch_entities_link_validation_order() {
    for link_first in [true, false] {
        let mut database = DatabaseTestWrapper::new().await;
        let mut api = seed(&mut database).await;
        let left = create_person(&mut api).await;
        let right = create_person(&mut api).await;
        let left_id = left.metadata.record_id.entity_id;
        let link = create_friend_link(&mut api, left_id, right.metadata.record_id.entity_id).await;
        let mut link_patch = patch_params(link.metadata.record_id.entity_id, Vec::new());
        link_patch.archived = Some(true);
        let mut left_patch = patch_params(left_id, Vec::new());
        left_patch.entity_type_ids = HashSet::from([org_entity_type_id()]);
        let params = if link_first {
            vec![link_patch, left_patch]
        } else {
            vec![left_patch, link_patch]
        };
        let result = api.patch_entities(api.account_id, params).await;
        if link_first {
            result.expect("should validate the link before changing its source type");
        } else {
            let error = result
                .expect_err("should validate the link against the earlier source type change");
            let reports = error
                .downcast_ref::<HashMap<usize, EntityValidationReport>>()
                .expect("should attach validation reports");
            assert!(
                reports.contains_key(&1),
                "should retain the link patch's input index"
            );
            assert_current_entity(&mut api, left_id, &left).await;
        }
    }
}

#[tokio::test]
async fn patch_entities_reverse_decision_times() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;
    let now = Timestamp::now().remove_nanosecond();
    let original = create_person_at(&mut api, Some(now - Duration::days(3))).await;
    let entity_id = original.metadata.record_id.entity_id;
    let mut later = patch_params(
        entity_id,
        vec![add_property(
            age_property_type_id(),
            PropertyValue::Number(Real::from(30)),
        )],
    );
    later.decision_time = Some(now - Duration::days(1));
    let mut earlier = patch_params(
        entity_id,
        vec![add_property(
            name_property_type_id(),
            PropertyValue::String("Bob".to_owned()),
        )],
    );
    earlier.decision_time = Some(now - Duration::days(2));
    let mut latest = patch_params(
        entity_id,
        vec![add_property(
            age_property_type_id(),
            PropertyValue::Number(Real::from(40)),
        )],
    );
    latest.decision_time = later.decision_time;
    let [later, earlier, latest]: [Entity; 3] = api
        .patch_entities(api.account_id, vec![later, earlier, latest])
        .await
        .expect("should apply patches to their decision intervals in input order")
        .try_into()
        .expect("should return three editions");
    assert_eq!(
        earlier.properties.properties().get(&age_property_type_id()),
        None,
        "should select the retained earlier interval before the age update"
    );
    assert_eq!(
        latest.properties.properties().get(&name_property_type_id()),
        original
            .properties
            .properties()
            .get(&name_property_type_id()),
        "should retain the later interval's name after a backdated update"
    );
    assert_eq!(
        earlier.metadata.temporal_versioning.decision_time.end(),
        &OpenTemporalBound::Exclusive(now - Duration::days(1)),
        "should bound the backdated update by the later interval"
    );
    for entity in [earlier, latest] {
        let ClosedTemporalBound::Inclusive(decision_time) =
            *entity.metadata.temporal_versioning.decision_time.start();
        let stored = api
            .get_entity_by_id(Some(api.account_id), entity_id, None, Some(decision_time))
            .await
            .expect("should read each surviving interval")
            .expect("the entity should exist in each surviving interval");
        assert_eq!(
            stored, entity,
            "should persist the resulting interval and edition"
        );
    }
    let history = Read::<Entity>::read_vec(&api.store, &[], None, true)
        .await
        .expect("should decode every history interval");
    assert!(
        !history
            .iter()
            .any(|entity| entity.metadata.record_id.edition_id
                == later.metadata.record_id.edition_id),
        "should omit the intermediate edition replaced at the same decision time"
    );
    let ClosedTemporalBound::Inclusive(transaction_time) = *original
        .metadata
        .temporal_versioning
        .transaction_time
        .start();
    let stored = api
        .get_entity_by_id(
            Some(api.account_id),
            entity_id,
            Some(transaction_time),
            Some(now),
        )
        .await
        .expect("should read the snapshot preceding the batch")
        .expect("the entity should exist in the snapshot preceding the batch");
    assert_eq!(
        stored.properties, original.properties,
        "should retain the original transaction snapshot"
    );
}

#[tokio::test]
async fn patch_entities_updated_type_permissions() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;
    let original = create_person(&mut api).await;
    let entity_id = original.metadata.record_id.entity_id;
    api.store
        .insert_policies_into_database([&PolicyCreationParams {
            name: None,
            effect: Effect::Forbid,
            principal: None,
            actions: vec![ActionName::UpdateEntity],
            resource: Some(ResourceConstraint::Entity(EntityResourceConstraint::Any {
                filter: EntityResourceFilter::IsOfType {
                    entity_type: org_entity_type_id(),
                },
            })),
        }])
        .await
        .expect("should forbid updating organizations");
    let mut change_type = patch_params(entity_id, Vec::new());
    change_type.entity_type_ids = HashSet::from([org_entity_type_id()]);
    let update = patch_params(
        entity_id,
        vec![add_property(
            name_property_type_id(),
            PropertyValue::String("Bob".to_owned()),
        )],
    );
    let error = api
        .patch_entities(api.account_id, vec![change_type, update])
        .await
        .expect_err("should evaluate the second patch against the updated organization type");
    assert_eq!(
        error.downcast_ref::<StatusCode>(),
        Some(&StatusCode::PermissionDenied),
        "should deny the second patch's update permission"
    );
    assert_current_entity(&mut api, entity_id, &original).await;
}

#[tokio::test]
async fn patch_entities_updated_endpoint_permissions() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;
    let left = create_person(&mut api).await;
    let right = create_person(&mut api).await;
    let left_id = left.metadata.record_id.entity_id;
    let link = create_friend_link(&mut api, left_id, right.metadata.record_id.entity_id).await;
    api.store
        .insert_policies_into_database([&PolicyCreationParams {
            name: None,
            effect: Effect::Forbid,
            principal: None,
            actions: vec![ActionName::ViewEntity],
            resource: Some(ResourceConstraint::Entity(EntityResourceConstraint::Any {
                filter: EntityResourceFilter::IsOfType {
                    entity_type: org_entity_type_id(),
                },
            })),
        }])
        .await
        .expect("should forbid viewing organizations");
    let mut change_type = patch_params(left_id, Vec::new());
    change_type.entity_type_ids = HashSet::from([person_entity_type_id(), org_entity_type_id()]);
    let mut update_link = patch_params(link.metadata.record_id.entity_id, Vec::new());
    update_link.archived = Some(true);
    let error = api
        .patch_entities(api.account_id, vec![change_type, update_link])
        .await
        .expect_err("should deny access to an endpoint hidden by its updated type");
    let reports = error
        .downcast_ref::<HashMap<usize, EntityValidationReport>>()
        .expect("should attach link validation reports");
    assert!(
        reports.contains_key(&1),
        "should report the link patch's original input index"
    );
    assert_current_entity(&mut api, left_id, &left).await;
}

#[tokio::test]
async fn patch_entities_endpoint_creator_permissions() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;
    let left = create_person(&mut api).await;
    let right = create_person(&mut api).await;
    let left_id = left.metadata.record_id.entity_id;
    let right_id = right.metadata.record_id.entity_id;
    let link = create_friend_link(&mut api, left_id, right_id).await;
    let updater = ActorId::from(api.create_machine("endpoint-updater").await);
    api.assign_web_administrator(ActorEntityUuid::from(updater), WebId::new(api.account_id))
        .await;
    api.store
        .insert_policies_into_database([&PolicyCreationParams {
            name: None,
            effect: Effect::Forbid,
            principal: None,
            actions: vec![ActionName::ViewEntity],
            resource: Some(ResourceConstraint::Entity(EntityResourceConstraint::Any {
                filter: EntityResourceFilter::Not {
                    filter: Box::new(EntityResourceFilter::CreatedByPrincipal),
                },
            })),
        }])
        .await
        .expect("should forbid viewing entities created by another actor");

    let mut link_only = patch_params(link.metadata.record_id.entity_id, Vec::new());
    link_only.archived = Some(true);
    let error = api
        .patch_entities(updater, vec![link_only])
        .await
        .expect_err("should deny link validation against endpoints created by another actor");
    assert!(
        error
            .downcast_ref::<HashMap<usize, EntityValidationReport>>()
            .is_some(),
        "should fail endpoint validation rather than mutation authorization: {error:?}"
    );

    let left_patch = patch_params(
        left_id,
        vec![add_property(
            age_property_type_id(),
            PropertyValue::Number(Real::from(30)),
        )],
    );
    let right_patch = patch_params(
        right_id,
        vec![add_property(
            age_property_type_id(),
            PropertyValue::Number(Real::from(40)),
        )],
    );
    let mut link_patch = patch_params(link.metadata.record_id.entity_id, Vec::new());
    link_patch.archived = Some(true);
    let result = api
        .patch_entities(updater, vec![left_patch, right_patch, link_patch])
        .await;
    let error = result
        .expect_err("should preserve original creator permissions after staging endpoint edits");
    let reports = error
        .downcast_ref::<HashMap<usize, EntityValidationReport>>()
        .expect("should report endpoint validation errors");
    assert!(
        reports.contains_key(&2),
        "should reject the link patch at its input index"
    );
}
