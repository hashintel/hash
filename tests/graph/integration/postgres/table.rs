use std::collections::{HashMap, HashSet};

use hash_graph_authorization::policies::{
    Effect,
    action::ActionName,
    resource::{EntityResourceConstraint, ResourceConstraint},
    store::PolicyCreationParams,
};
use hash_graph_store::{
    entity::{
        CreateEntityParams, EntityStore as _, EntityTableFilter, EntityTableRow,
        EntityTableSortKey, EntityTableSorting, QueryEntitiesTableParams,
        QueryEntitiesTableResponse,
    },
    query::Ordering,
};
use hash_graph_test_data::{data_type, entity, entity_type, property_type};
use pretty_assertions::assert_eq;
use type_system::{
    knowledge::{
        entity::{LinkData, id::EntityUuid, provenance::ProvidedEntityEditionProvenance},
        property::{PropertyObject, PropertyObjectWithMetadata, metadata::PropertyProvenance},
    },
    ontology::{
        VersionedUrl,
        id::{BaseUrl, OntologyTypeVersion},
    },
    principal::{actor::ActorType, actor_group::WebId},
    provenance::{OriginProvenance, OriginType},
};

use crate::{DatabaseApi, DatabaseTestWrapper};

fn person_entity_type() -> VersionedUrl {
    VersionedUrl {
        base_url: BaseUrl::new(
            "https://blockprotocol.org/@alice/types/entity-type/person/".to_owned(),
        )
        .expect("the URL should be a valid base URL"),
        version: OntologyTypeVersion {
            major: 1,
            pre_release: None,
        },
    }
}

fn page_entity_type() -> VersionedUrl {
    VersionedUrl {
        base_url: BaseUrl::new(
            "https://blockprotocol.org/@alice/types/entity-type/page/".to_owned(),
        )
        .expect("the URL should be a valid base URL"),
        version: OntologyTypeVersion {
            major: 1,
            pre_release: None,
        },
    }
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
        .expect("the database should seed");

    let person = person_entity_type();
    let page = page_entity_type();
    let entities_properties = [
        (entity::PERSON_ALICE_V1, &person),
        (entity::PERSON_BOB_V1, &person),
        (entity::PERSON_CHARLES_V1, &person),
        (entity::PAGE_V1, &page),
        (entity::PAGE_V2, &page),
    ];

    for (idx, (entity, type_id)) in entities_properties.into_iter().enumerate() {
        let properties: PropertyObject =
            serde_json::from_str(entity).expect("the entity fixture should parse");
        // Deterministic but properly versioned — the opaque cursor round-trips
        // entity uuids through serde, which rejects non-RFC4122 ones.
        let entity_uuid = uuid::Builder::from_u128(idx as u128)
            .with_variant(uuid::Variant::RFC4122)
            .with_version(uuid::Version::Random)
            .into_uuid();
        api.create_entity(
            api.account_id,
            CreateEntityParams {
                web_id: WebId::new(api.account_id),
                entity_uuid: Some(EntityUuid::new(entity_uuid)),
                decision_time: None,
                entity_type_ids: HashSet::from([type_id.clone()]),
                properties: PropertyObjectWithMetadata::from_parts(properties, None)
                    .expect("the property object should build"),
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
        .expect("the entity should be created");
    }

    api
}

#[tokio::test]
async fn link_rows_carry_their_endpoints() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = insert(&mut database).await;
    let actor_id = api.account_id;

    let friend_of_type = VersionedUrl {
        base_url: BaseUrl::new(
            "https://blockprotocol.org/@alice/types/entity-type/friend-of/".to_owned(),
        )
        .expect("the URL should be a valid base URL"),
        version: OntologyTypeVersion {
            major: 1,
            pre_release: None,
        },
    };

    // Alice and Bob were seeded with the deterministic uuids 0 and 1.
    let endpoint_uuid = |index: u128| {
        EntityUuid::new(
            uuid::Builder::from_u128(index)
                .with_variant(uuid::Variant::RFC4122)
                .with_version(uuid::Version::Random)
                .into_uuid(),
        )
    };
    let web_id = WebId::new(api.account_id);
    let alice_id = type_system::knowledge::entity::id::EntityId {
        web_id,
        entity_uuid: endpoint_uuid(0),
        draft_id: None,
    };
    let bob_id = type_system::knowledge::entity::id::EntityId {
        web_id,
        entity_uuid: endpoint_uuid(1),
        draft_id: None,
    };

    api.create_entity(
        actor_id,
        CreateEntityParams {
            web_id,
            entity_uuid: None,
            decision_time: None,
            entity_type_ids: HashSet::from([friend_of_type.clone()]),
            properties: PropertyObjectWithMetadata::from_parts(PropertyObject::empty(), None)
                .expect("the property object should build"),
            link_data: Some(LinkData {
                left_entity_id: alice_id,
                right_entity_id: bob_id,
                left_entity_confidence: None,
                left_entity_provenance: PropertyProvenance::default(),
                right_entity_confidence: None,
                right_entity_provenance: PropertyProvenance::default(),
            }),
            draft: false,
            policies: Vec::new(),
            confidence: None,
            provenance: ProvidedEntityEditionProvenance {
                actor_type: ActorType::User,
                origin: OriginProvenance::from_empty_type(OriginType::Api),
                sources: Vec::new(),
            },
            read_only: false,
        },
    )
    .await
    .expect("the link should be created");

    let rows = collect_all_pages(&mut api, 10, EntityTableSorting::default()).await;
    assert_eq!(rows.len(), 6);

    let link_rows = rows
        .iter()
        .filter(|row| row.source_entity.is_some())
        .collect::<Vec<_>>();
    assert_eq!(link_rows.len(), 1, "exactly the link row has endpoints");

    let link_row = link_rows[0];
    let source = link_row
        .source_entity
        .as_ref()
        .expect("the link row should have a source");
    let target = link_row
        .target_entity
        .as_ref()
        .expect("the link row should have a target");
    assert_eq!(source.entity_id, alice_id);
    assert_eq!(target.entity_id, bob_id);
    // The fixture types define no label property, so the hydrated labels are
    // legitimately absent — the endpoint ids and types prove the join.
    assert_eq!(source.entity_type_ids, vec![person_entity_type()]);
    assert_eq!(target.entity_type_ids, vec![person_entity_type()]);

    for row in &rows {
        if row.entity_id != link_row.entity_id {
            assert!(row.source_entity.is_none());
            assert!(row.target_entity.is_none());
        }
    }
}

#[tokio::test]
async fn property_filters_narrow_the_page_but_not_the_type_summary() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = insert(&mut database).await;
    let actor_id = api.account_id;

    let mut params = page_params(10);
    params.include_summary = true;
    params.filter.property_filters = vec![
        hash_graph_store::entity::EntityTablePropertyFilter::Equals {
            property: BaseUrl::new(
                "https://blockprotocol.org/@alice/types/property-type/name/".to_owned(),
            )
            .expect("the URL should be a valid base URL"),
            value: hash_graph_store::entity::EntityTablePropertyValue::String("Alice".to_owned()),
        },
    ];

    let response = api
        .query_entities_table(actor_id, params)
        .await
        .expect("the table query should succeed");

    assert_eq!(response.rows.len(), 1, "only Alice matches the filter");

    let summary = response
        .summary
        .expect("the summary should be present when requested");
    assert_eq!(
        summary.count, 1,
        "the count reflects the page query's filters"
    );
    assert_eq!(
        summary.entity_type_ids.len(),
        2,
        "the type summary spans the scope so the filter UI can widen the selection",
    );
}

#[tokio::test]
async fn label_sort_pages_alphabetically() {
    use hash_graph_store::entity_type::{CreateEntityTypeParams, EntityTypeStore as _};
    use type_system::ontology::provenance::{OntologyOwnership, ProvidedOntologyEditionProvenance};

    let mut database = DatabaseTestWrapper::new().await;
    let mut api = insert(&mut database).await;
    let actor_id = api.account_id;

    // The seeded types have no label property, leaving every row's label
    // NULL — a labeled type makes the ordering observable.
    api.create_entity_type(
        actor_id,
        CreateEntityTypeParams {
            schema: serde_json::from_value(serde_json::json!({
                "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/entity-type",
                "kind": "entityType",
                "$id": "http://localhost:3000/@alice/types/entity-type/labeled/v/1",
                "type": "object",
                "title": "Labeled",
                "description": "An entity labeled by its name",
                "properties": {
                    "https://blockprotocol.org/@alice/types/property-type/name/": {
                        "$ref": "https://blockprotocol.org/@alice/types/property-type/name/v/1"
                    }
                },
                "labelProperty": "https://blockprotocol.org/@alice/types/property-type/name/",
            }))
            .expect("the entity type fixture should parse"),
            ownership: OntologyOwnership::Local {
                web_id: WebId::new(actor_id),
            },
            conflict_behavior: hash_graph_store::query::ConflictBehavior::Fail,
            provenance: ProvidedOntologyEditionProvenance {
                actor_type: ActorType::User,
                origin: OriginProvenance::from_empty_type(OriginType::Api),
                sources: Vec::new(),
            },
        },
    )
    .await
    .expect("the entity type should be created");

    let labeled_type = VersionedUrl {
        base_url: BaseUrl::new(
            "http://localhost:3000/@alice/types/entity-type/labeled/v/1"
                .trim_end_matches("v/1")
                .to_owned(),
        )
        .expect("the URL should be a valid base URL"),
        version: OntologyTypeVersion {
            major: 1,
            pre_release: None,
        },
    };
    for name in ["Zebra", "Aardvark", "Mango"] {
        api.create_entity(
            actor_id,
            CreateEntityParams {
                web_id: WebId::new(actor_id),
                entity_uuid: None,
                decision_time: None,
                entity_type_ids: HashSet::from([labeled_type.clone()]),
                properties: PropertyObjectWithMetadata::from_parts(
                    serde_json::from_value(serde_json::json!({
                        "https://blockprotocol.org/@alice/types/property-type/name/": name,
                    }))
                    .expect("the properties should parse"),
                    None,
                )
                .expect("the property object should build"),
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
        .expect("the entity should be created");
    }

    let rows = collect_all_pages(
        &mut api,
        2,
        EntityTableSorting {
            key: EntityTableSortKey::Label,
            ordering: hash_graph_store::query::Ordering::Ascending,
        },
    )
    .await;

    assert_eq!(rows.len(), 8);
    let labels = rows.iter().map(|row| row.label.clone()).collect::<Vec<_>>();
    assert_eq!(
        labels[..3],
        [
            Some("Aardvark".to_owned()),
            Some("Mango".to_owned()),
            Some("Zebra".to_owned()),
        ],
        "labeled rows come first, alphabetically",
    );
    assert!(
        labels[3..].iter().all(Option::is_none),
        "unlabeled rows sort last",
    );
}

fn page_params(limit: usize) -> QueryEntitiesTableParams {
    QueryEntitiesTableParams {
        filter: EntityTableFilter {
            webs: hash_graph_store::entity::EntityTableWebScope::default(),
            types: hash_graph_store::entity::EntityTableTypeScope::default(),
            include_archived: false,
            include_drafts: false,
            property_filters: Vec::new(),
        },
        cursor: None,
        limit,
        sort: hash_graph_store::entity::EntityTableSorting::default(),
        conversions: Vec::new(),
        include_summary: false,
        include_entity_types: None,
    }
}

/// Pages through the whole table in chunks of `limit`, asserting no row is
/// seen twice, and returns all rows in page order.
async fn collect_all_pages(
    api: &mut DatabaseApi<'_>,
    limit: usize,
    sort: EntityTableSorting,
) -> Vec<EntityTableRow> {
    collect_all_pages_with(api, limit, sort, false).await
}

/// [`collect_all_pages`] with draft visibility.
async fn collect_all_pages_with(
    api: &mut DatabaseApi<'_>,
    limit: usize,
    sort: EntityTableSorting,
    include_drafts: bool,
) -> Vec<EntityTableRow> {
    let actor_id = api.account_id;
    let mut cursor = None;
    let mut seen = HashSet::new();
    let mut rows = Vec::new();

    loop {
        let mut params = page_params(limit);
        params.sort = sort;
        params.filter.include_drafts = include_drafts;
        params.cursor = Option::take(&mut cursor);

        let response = api
            .query_entities_table(actor_id, params)
            .await
            .expect("the table query should succeed");

        let page_len = response.rows.len();
        assert!(page_len <= limit, "page exceeds its limit");

        for row in response.rows {
            assert!(
                seen.insert(row.entity_id),
                "duplicate row across pages: {:?}",
                row.entity_id,
            );
            rows.push(row);
        }

        if page_len < limit {
            assert!(
                response.cursor.is_none(),
                "a short page must not hand out a continuation",
            );
            break;
        }
        let Some(new_cursor) = response.cursor else {
            break;
        };
        cursor = Some(new_cursor);
    }

    rows
}

#[tokio::test]
async fn first_page_summarizes_and_pages_stay_consistent() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = insert(&mut database).await;
    let actor_id = api.account_id;

    let mut params = page_params(2);
    params.include_summary = true;
    params.include_entity_types =
        Some(hash_graph_store::entity_type::IncludeEntityTypeOption::Resolved);

    let QueryEntitiesTableResponse {
        rows,
        cursor,
        summary,
        closed_multi_entity_types,
        definitions,
    } = api
        .query_entities_table(actor_id, params)
        .await
        .expect("the table query should succeed");

    let summary = summary.expect("the summary should be present when requested");
    assert_eq!(summary.count, 5);
    assert_eq!(
        summary.entity_type_ids,
        HashMap::from([(person_entity_type(), 3), (page_entity_type(), 2)]),
    );
    assert_eq!(
        summary.entity_type_titles.keys().collect::<HashSet<_>>(),
        summary.entity_type_ids.keys().collect::<HashSet<_>>(),
    );

    assert_eq!(rows.len(), 2);
    assert!(cursor.is_some(), "a full page hands out a continuation");

    let closed_multi_entity_types = closed_multi_entity_types.expect("entity types were requested");
    for row in &rows {
        assert!(
            closed_multi_entity_types.contains_key(&row.entity_type_ids[0]),
            "each row's type is resolved alongside the page",
        );
    }
    assert!(definitions.is_some(), "resolved definitions were requested");

    let all_rows = collect_all_pages(&mut api, 2, EntityTableSorting::default()).await;
    assert_eq!(all_rows.len(), 5);

    // Default sort is created-at, newest first — verified over the keyset pages.
    for pair in all_rows.windows(2) {
        assert!(
            pair[0].created_at_decision_time >= pair[1].created_at_decision_time,
            "rows are not sorted by creation time, newest first",
        );
    }

    for row in &all_rows {
        assert_eq!(row.entity_type_ids.len(), 1);
        assert_eq!(row.entity_type_titles.len(), 1);
        assert!(!row.archived);
        assert!(!row.properties.properties().is_empty());
    }
}

#[tokio::test]
async fn explicit_type_filter_scopes_the_table() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = insert(&mut database).await;
    let actor_id = api.account_id;

    let mut params = page_params(10);
    params.filter.types = hash_graph_store::entity::EntityTableTypeScope::Include {
        entity_type_ids: vec![person_entity_type()],
    };

    let response = api
        .query_entities_table(actor_id, params)
        .await
        .expect("the table query should succeed");

    assert_eq!(response.rows.len(), 3);
    assert!(response.cursor.is_none());
    assert!(response.summary.is_none());
    for row in &response.rows {
        assert_eq!(row.entity_type_ids, vec![person_entity_type()]);
    }
}

#[tokio::test]
async fn conversions_convert_row_property_values() {
    use std::collections::HashMap;

    use hash_graph_store::{
        data_type::{CreateDataTypeParams, DataTypeStore as _},
        query::ConflictBehavior,
    };
    use type_system::ontology::{
        data_type::Conversions,
        provenance::{OntologyOwnership, ProvidedOntologyEditionProvenance},
    };

    let mut database = DatabaseTestWrapper::new().await;
    let mut api = database
        .seed(
            [
                data_type::VALUE_V1,
                data_type::NUMBER_V1,
                data_type::LENGTH_V1,
                data_type::METER_V1,
            ],
            [property_type::LENGTH_V1],
            [entity_type::LINE_V1],
        )
        .await
        .expect("the database should seed");
    let actor_id = api.account_id;

    // The seed creates data types without conversions — the centimeter gets
    // its meter conversion here explicitly.
    api.create_data_type(
        actor_id,
        CreateDataTypeParams {
            schema: serde_json::from_str(data_type::CENTIMETER_V1)
                .expect("the data type fixture should parse"),
            ownership: OntologyOwnership::Local {
                web_id: WebId::new(actor_id),
            },
            conflict_behavior: ConflictBehavior::Fail,
            provenance: ProvidedOntologyEditionProvenance {
                actor_type: ActorType::User,
                origin: OriginProvenance::from_empty_type(OriginType::Api),
                sources: Vec::new(),
            },
            conversions: HashMap::from([(
                BaseUrl::new("https://hash.ai/@h/types/data-type/meter/".to_owned())
                    .expect("the URL should be a valid base URL"),
                Conversions {
                    from: serde_json::from_value(serde_json::json!({
                        "expression": ["*", "self", { "const": 100, "type": "number" }]
                    }))
                    .expect("the conversion should parse"),
                    to: serde_json::from_value(serde_json::json!({
                        "expression": ["/", "self", { "const": 100, "type": "number" }]
                    }))
                    .expect("the conversion should parse"),
                },
            )]),
        },
    )
    .await
    .expect("the data type should be created");

    let line_type = VersionedUrl {
        base_url: BaseUrl::new("http://localhost:3000/@alice/types/entity-type/line/".to_owned())
            .expect("the URL should be a valid base URL"),
        version: OntologyTypeVersion {
            major: 1,
            pre_release: None,
        },
    };
    let length_property =
        BaseUrl::new("http://localhost:3000/@alice/types/property-type/length/".to_owned())
            .expect("the URL should be a valid base URL");

    // A bare number is ambiguous between the length hierarchy's concrete
    // types, so the property pins its data type explicitly.
    let properties: PropertyObjectWithMetadata = serde_json::from_value(serde_json::json!({
        "value": {
            "http://localhost:3000/@alice/types/property-type/length/": {
                "value": 2,
                "metadata": {
                    "dataTypeId": "https://hash.ai/@h/types/data-type/meter/v/1",
                },
            },
        },
    }))
    .expect("the properties should parse");
    api.create_entity(
        actor_id,
        CreateEntityParams {
            web_id: WebId::new(actor_id),
            entity_uuid: None,
            decision_time: None,
            entity_type_ids: HashSet::from([line_type]),
            properties,
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
    .expect("the entity should be created");

    let mut params = page_params(10);
    params.conversions = serde_json::from_value(serde_json::json!([{
        "path": [length_property.to_string()],
        "dataTypeId": "https://hash.ai/@h/types/data-type/centimeter/v/1",
    }]))
    .expect("the conversions should parse");

    let response = api
        .query_entities_table(actor_id, params)
        .await
        .expect("the table query should succeed");

    assert_eq!(response.rows.len(), 1);
    let row = &response.rows[0];

    let type_system::knowledge::Property::Value(type_system::knowledge::PropertyValue::Number(
        value,
    )) = &row.properties.properties()[&length_property]
    else {
        panic!("length is a numeric value property");
    };
    assert_eq!(
        *value,
        hash_codec::numeric::Real::from(200),
        "the meter value converts into centimeters",
    );

    let type_system::knowledge::property::metadata::PropertyMetadata::Value(value_metadata) =
        &row.properties_metadata.value[&length_property]
    else {
        panic!("length is a value property");
    };
    assert_eq!(
        value_metadata
            .metadata
            .data_type_id
            .as_ref()
            .map(ToString::to_string),
        Some("https://hash.ai/@h/types/data-type/centimeter/v/1".to_owned()),
        "the property metadata records the target data type",
    );
}

#[tokio::test]
async fn exclude_webs_hides_the_excluded_web() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = insert(&mut database).await;
    let actor_id = api.account_id;

    let mut params = page_params(10);
    params.include_summary = true;
    params.filter.webs = hash_graph_store::entity::EntityTableWebScope::Exclude {
        webs: vec![WebId::new(actor_id)],
    };

    let response = api
        .query_entities_table(actor_id, params)
        .await
        .expect("the table query should succeed");

    assert_eq!(response.rows.len(), 0, "the only seeded web is excluded");
    let summary = response
        .summary
        .expect("the summary should be present when requested");
    assert_eq!(summary.count, 0);
    assert!(summary.entity_type_ids.is_empty());
}

#[tokio::test]
async fn archived_entities_only_appear_when_requested() {
    use hash_graph_store::entity::PatchEntityParams;

    let mut database = DatabaseTestWrapper::new().await;
    let mut api = insert(&mut database).await;
    let actor_id = api.account_id;

    // Bob was seeded with the deterministic uuid 1.
    let bob_id = type_system::knowledge::entity::id::EntityId {
        web_id: WebId::new(actor_id),
        entity_uuid: EntityUuid::new(
            uuid::Builder::from_u128(1)
                .with_variant(uuid::Variant::RFC4122)
                .with_version(uuid::Version::Random)
                .into_uuid(),
        ),
        draft_id: None,
    };
    api.patch_entity(
        actor_id,
        PatchEntityParams {
            entity_id: bob_id,
            decision_time: None,
            entity_type_ids: HashSet::new(),
            properties: Vec::new(),
            draft: None,
            archived: Some(true),
            confidence: None,
            provenance: ProvidedEntityEditionProvenance {
                actor_type: ActorType::User,
                origin: OriginProvenance::from_empty_type(OriginType::Api),
                sources: Vec::new(),
            },
        },
    )
    .await
    .expect("the entity should archive");

    let mut params = page_params(10);
    params.include_summary = true;
    let response = api
        .query_entities_table(actor_id, params)
        .await
        .expect("the table query should succeed");
    assert_eq!(response.rows.len(), 4, "the archived entity is hidden");
    assert_eq!(
        response
            .summary
            .expect("the summary should be present when requested")
            .count,
        4
    );
    assert!(response.rows.iter().all(|row| !row.archived));

    let mut params = page_params(10);
    params.include_summary = true;
    params.filter.include_archived = true;
    let response = api
        .query_entities_table(actor_id, params)
        .await
        .expect("the table query should succeed");
    assert_eq!(response.rows.len(), 5, "the archived entity is included");
    assert_eq!(
        response
            .summary
            .expect("the summary should be present when requested")
            .count,
        5
    );
    assert_eq!(
        response
            .rows
            .iter()
            .filter(|row| row.archived && row.entity_id == bob_id)
            .count(),
        1,
    );
}

#[tokio::test]
async fn type_filter_narrows_the_count_but_not_the_type_summary() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = insert(&mut database).await;
    let actor_id = api.account_id;

    let mut params = page_params(10);
    params.include_summary = true;
    params.filter.types = hash_graph_store::entity::EntityTableTypeScope::Include {
        entity_type_ids: vec![person_entity_type()],
    };

    let response = api
        .query_entities_table(actor_id, params)
        .await
        .expect("the table query should succeed");

    assert_eq!(response.rows.len(), 3);
    let summary = response
        .summary
        .expect("the summary should be present when requested");
    assert_eq!(summary.count, 3, "the count follows the type filter");
    assert_eq!(
        summary.entity_type_ids.len(),
        2,
        "the type summary spans the scope",
    );
    assert_eq!(summary.entity_type_ids[&person_entity_type()], 3);
    assert_eq!(summary.entity_type_ids[&page_entity_type()], 2);
}

#[tokio::test]
async fn a_page_exactly_filling_the_limit_hands_out_a_final_empty_page() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = insert(&mut database).await;

    // The seed creates exactly five entities, so the first page fills the
    // limit and only the empty follow-up page reveals the end.
    let rows = collect_all_pages(&mut api, 5, EntityTableSorting::default()).await;
    assert_eq!(rows.len(), 5);
}

#[tokio::test]
async fn a_continuation_reads_its_sort_from_the_token() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = insert(&mut database).await;
    let actor_id = api.account_id;

    let ascending = EntityTableSorting {
        key: EntityTableSortKey::CreatedAtDecisionTime,
        ordering: Ordering::Ascending,
    };

    let reference = collect_all_pages(&mut api, 2, ascending).await;

    let mut params = page_params(2);
    params.sort = ascending;
    let first = api
        .query_entities_table(actor_id, params)
        .await
        .expect("the table query should succeed");
    let cursor = first
        .cursor
        .expect("a full page should hand out a continuation");

    // The re-sent request contradicts the token with the opposite ordering.
    // Were the continuation to honor it, the keyset comparison would flip and
    // return the rows before the position instead of the ones after it.
    let mut params = page_params(2);
    params.cursor = Some(cursor);
    params.sort = EntityTableSorting::default();
    let second = api
        .query_entities_table(actor_id, params)
        .await
        .expect("the table query should succeed");

    assert_eq!(
        second
            .rows
            .iter()
            .map(|row| row.entity_id)
            .collect::<Vec<_>>(),
        reference[2..4]
            .iter()
            .map(|row| row.entity_id)
            .collect::<Vec<_>>(),
        "the continuation should continue the token's sort, not the request's",
    );
}

#[tokio::test]
async fn excluded_type_base_urls_leave_the_universe_and_the_summary() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = insert(&mut database).await;
    let actor_id = api.account_id;

    let mut params = page_params(10);
    params.include_summary = true;
    params.filter.types = hash_graph_store::entity::EntityTableTypeScope::Exclude {
        entity_type_base_urls: vec![page_entity_type().base_url],
    };

    let response = api
        .query_entities_table(actor_id, params)
        .await
        .expect("the table query should succeed");

    assert_eq!(response.rows.len(), 3, "the two pages are excluded");
    assert!(
        response
            .rows
            .iter()
            .all(|row| row.entity_type_ids == vec![person_entity_type()]),
    );

    let summary = response
        .summary
        .expect("the summary should be present when requested");
    assert_eq!(summary.count, 3);
    assert_eq!(
        summary.entity_type_ids.len(),
        1,
        "excluded types leave the type summary as well",
    );
    assert_eq!(summary.entity_type_ids[&person_entity_type()], 3);
}

#[tokio::test]
async fn link_endpoints_hide_entities_the_actor_cannot_view() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = insert(&mut database).await;
    let actor_id = api.account_id;
    let web_id = WebId::new(api.account_id);

    let hidden_person = api
        .create_entity(
            actor_id,
            CreateEntityParams {
                web_id,
                entity_uuid: None,
                decision_time: None,
                entity_type_ids: HashSet::from([person_entity_type()]),
                properties: PropertyObjectWithMetadata::from_parts(
                    serde_json::from_str(entity::PERSON_ALICE_V1)
                        .expect("the entity fixture should parse"),
                    None,
                )
                .expect("the property object should build"),
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
        .expect("the hidden person should be created");
    let hidden_id = hidden_person.metadata.record_id.entity_id;

    let friend_of_type = VersionedUrl {
        base_url: BaseUrl::new(
            "https://blockprotocol.org/@alice/types/entity-type/friend-of/".to_owned(),
        )
        .expect("the URL should be a valid base URL"),
        version: OntologyTypeVersion {
            major: 1,
            pre_release: None,
        },
    };
    let alice_id = type_system::knowledge::entity::id::EntityId {
        web_id,
        entity_uuid: EntityUuid::new(
            uuid::Builder::from_u128(0)
                .with_variant(uuid::Variant::RFC4122)
                .with_version(uuid::Version::Random)
                .into_uuid(),
        ),
        draft_id: None,
    };

    api.create_entity(
        actor_id,
        CreateEntityParams {
            web_id,
            entity_uuid: None,
            decision_time: None,
            entity_type_ids: HashSet::from([friend_of_type]),
            properties: PropertyObjectWithMetadata::from_parts(PropertyObject::empty(), None)
                .expect("the property object should build"),
            link_data: Some(LinkData {
                left_entity_id: alice_id,
                right_entity_id: hidden_id,
                left_entity_confidence: None,
                left_entity_provenance: PropertyProvenance::default(),
                right_entity_confidence: None,
                right_entity_provenance: PropertyProvenance::default(),
            }),
            draft: false,
            policies: Vec::new(),
            confidence: None,
            provenance: ProvidedEntityEditionProvenance {
                actor_type: ActorType::User,
                origin: OriginProvenance::from_empty_type(OriginType::Api),
                sources: Vec::new(),
            },
            read_only: false,
        },
    )
    .await
    .expect("the link should be created");

    // The forbid policy comes after the link, because creating a link
    // validates that the actor can see the endpoints it connects.
    api.store
        .insert_policies_into_database([&PolicyCreationParams {
            name: Some("test-hidden-endpoint".to_owned()),
            effect: Effect::Forbid,
            principal: None,
            actions: vec![ActionName::ViewEntity],
            resource: Some(ResourceConstraint::Entity(
                EntityResourceConstraint::Exact {
                    id: hidden_id.entity_uuid,
                },
            )),
        }])
        .await
        .expect("the forbid policy should be inserted");

    let rows = collect_all_pages(&mut api, 10, EntityTableSorting::default()).await;

    assert!(
        rows.iter().all(|row| row.entity_id != hidden_id),
        "the forbidden entity should not appear as its own row",
    );

    let link_row = rows
        .iter()
        .find(|row| row.source_entity.is_some() || row.target_entity.is_some())
        .expect("the link row should be visible");
    assert_eq!(
        link_row
            .source_entity
            .as_ref()
            .expect("the visible source should stay on the link row")
            .entity_id,
        alice_id,
    );
    assert!(
        link_row.target_entity.is_none(),
        "the forbidden target should be hidden from the link row",
    );
}

#[tokio::test]
async fn included_webs_scope_the_page_and_empty_include_matches_nothing() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = insert(&mut database).await;
    let actor_id = api.account_id;

    let mut params = page_params(10);
    params.include_summary = true;
    params.filter.webs = hash_graph_store::entity::EntityTableWebScope::Include {
        webs: vec![WebId::new(api.account_id)],
    };

    let response = api
        .query_entities_table(actor_id, params)
        .await
        .expect("the table query should succeed");
    assert_eq!(response.rows.len(), 5, "the own web carries all rows");
    assert_eq!(
        response
            .summary
            .expect("the summary should be present when requested")
            .count,
        5,
    );

    let mut params = page_params(10);
    params.include_summary = true;
    params.filter.webs = hash_graph_store::entity::EntityTableWebScope::Include { webs: vec![] };

    let response = api
        .query_entities_table(actor_id, params)
        .await
        .expect("the table query should succeed");
    assert!(
        response.rows.is_empty(),
        "an empty include list should match no rows",
    );
    let summary = response
        .summary
        .expect("the summary should be present when requested");
    assert_eq!(summary.count, 0);
    assert!(summary.entity_type_ids.is_empty());
}

#[tokio::test]
async fn drafts_are_hidden_unless_requested() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = insert(&mut database).await;
    let actor_id = api.account_id;

    api.create_entity(
        actor_id,
        CreateEntityParams {
            web_id: WebId::new(api.account_id),
            entity_uuid: None,
            decision_time: None,
            entity_type_ids: HashSet::from([person_entity_type()]),
            properties: PropertyObjectWithMetadata::from_parts(
                serde_json::from_str(entity::PERSON_ALICE_V1)
                    .expect("the entity fixture should parse"),
                None,
            )
            .expect("the property object should build"),
            confidence: None,
            link_data: None,
            draft: true,
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
    .expect("the draft should be created");

    let rows = collect_all_pages(&mut api, 10, EntityTableSorting::default()).await;
    assert_eq!(rows.len(), 5, "drafts stay hidden by default");

    // Paging with a small limit exercises the draft-aware keyset, whose
    // cursor carries the draft id as a third sort column.
    let rows = collect_all_pages_with(&mut api, 2, EntityTableSorting::default(), true).await;
    assert_eq!(rows.len(), 6, "the draft shows up when requested");
    assert_eq!(
        rows.iter()
            .filter(|row| row.entity_id.draft_id.is_some())
            .count(),
        1,
    );
}

#[tokio::test]
async fn multi_type_entities_count_once_and_pill_under_each_type() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = insert(&mut database).await;
    let actor_id = api.account_id;

    let mut properties: serde_json::Map<String, serde_json::Value> =
        serde_json::from_str(entity::PERSON_ALICE_V1).expect("the entity fixture should parse");
    properties.extend(
        serde_json::from_str::<serde_json::Map<String, serde_json::Value>>(entity::PAGE_V1)
            .expect("the entity fixture should parse"),
    );

    api.create_entity(
        actor_id,
        CreateEntityParams {
            web_id: WebId::new(api.account_id),
            entity_uuid: None,
            decision_time: None,
            entity_type_ids: HashSet::from([person_entity_type(), page_entity_type()]),
            properties: PropertyObjectWithMetadata::from_parts(
                serde_json::from_value(serde_json::Value::Object(properties))
                    .expect("the merged fixtures should be a valid property object"),
                None,
            )
            .expect("the property object should build"),
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
    .expect("the multi-type entity should be created");

    let mut params = page_params(10);
    params.include_summary = true;

    let response = api
        .query_entities_table(actor_id, params)
        .await
        .expect("the table query should succeed");

    let summary = response
        .summary
        .expect("the summary should be present when requested");
    assert_eq!(
        summary.count, 6,
        "a multi-type entity should count exactly once",
    );
    assert_eq!(
        summary.entity_type_ids,
        HashMap::from([(person_entity_type(), 4), (page_entity_type(), 3)]),
        "a multi-type entity should pill under each of its types",
    );

    let multi_row = response
        .rows
        .iter()
        .find(|row| row.entity_type_ids.len() == 2)
        .expect("the multi-type row should be on the page");
    assert_eq!(
        multi_row.entity_type_ids.iter().collect::<HashSet<_>>(),
        HashSet::from([&person_entity_type(), &page_entity_type()]),
    );
    assert_eq!(
        multi_row
            .entity_type_titles
            .iter()
            .collect::<HashSet<_>>()
            .len(),
        2,
        "the titles should stay parallel to the two types",
    );
}
