use core::str::FromStr as _;
use std::{
    borrow::Cow,
    collections::{HashMap, HashSet},
};

use hash_codec::numeric::Real;
use hash_graph_postgres_store::store::{
    AsClient as _,
    error::{
        BaseUrlAlreadyExists, OntologyTypeIsNotOwned, OntologyVersionDoesNotExist,
        VersionedUrlAlreadyExists,
    },
};
use hash_graph_store::{
    data_type::{
        ArchiveDataTypeParams, CreateDataTypeParams, DataTypeStore as _,
        QueryDataTypeSubgraphParams, QueryDataTypesParams, UnarchiveDataTypeParams,
        UpdateDataTypesParams,
    },
    entity::{CreateEntityParams, EntityStore as _},
    filter::Filter,
    query::ConflictBehavior,
    subgraph::temporal_axes::{QueryTemporalAxes, QueryTemporalAxesUnresolved},
};
use hash_graph_temporal_versioning::{TemporalTagged as _, Timestamp};
use time::OffsetDateTime;
use type_system::{
    knowledge::{
        PropertyValue,
        entity::provenance::ProvidedEntityEditionProvenance,
        property::{
            PropertyObjectWithMetadata, PropertyValueWithMetadata, PropertyWithMetadata,
            metadata::ObjectMetadata,
        },
        value::{ValueMetadata, metadata::ValueProvenance},
    },
    ontology::{
        BaseUrl, VersionedUrl,
        data_type::{DataType, DataTypeUuid, DataTypeWithMetadata},
        provenance::{OntologyOwnership, ProvidedOntologyEditionProvenance},
    },
    principal::{actor::ActorType, actor_group::WebId},
    provenance::{OriginProvenance, OriginType},
};

use crate::{DatabaseApi, DatabaseTestWrapper};

#[tokio::test]
async fn insert() {
    let boolean_dt: DataType = serde_json::from_str(hash_graph_test_data::data_type::BOOLEAN_V1)
        .expect("could not parse data type representation");

    let mut database = DatabaseTestWrapper::new().await;
    let mut api = database
        .seed([hash_graph_test_data::data_type::VALUE_V1], [], [])
        .await
        .expect("could not seed database");

    api.create_data_type(
        api.account_id,
        CreateDataTypeParams {
            schema: boolean_dt,
            ownership: OntologyOwnership::Local {
                web_id: WebId::new(api.account_id),
            },
            conflict_behavior: ConflictBehavior::Fail,
            provenance: ProvidedOntologyEditionProvenance {
                actor_type: ActorType::User,
                origin: OriginProvenance::from_empty_type(OriginType::Api),
                sources: Vec::new(),
            },
            conversions: HashMap::new(),
        },
    )
    .await
    .expect("could not create data type");
}

#[tokio::test]
async fn query() {
    let list_v1: DataType = serde_json::from_str(hash_graph_test_data::data_type::LIST_V1)
        .expect("could not parse data type representation");

    let mut database = DatabaseTestWrapper::new().await;
    let mut api = database
        .seed([hash_graph_test_data::data_type::VALUE_V1], [], [])
        .await
        .expect("could not seed database");

    api.create_data_type(
        api.account_id,
        CreateDataTypeParams {
            schema: list_v1.clone(),
            ownership: OntologyOwnership::Local {
                web_id: WebId::new(api.account_id),
            },
            conflict_behavior: ConflictBehavior::Fail,
            provenance: ProvidedOntologyEditionProvenance {
                actor_type: ActorType::User,
                origin: OriginProvenance::from_empty_type(OriginType::Api),
                sources: Vec::new(),
            },
            conversions: HashMap::new(),
        },
    )
    .await
    .expect("could not create data type");

    let data_types = api
        .query_data_types(
            api.account_id,
            QueryDataTypesParams {
                filter: Filter::for_versioned_url(&list_v1.id),
                temporal_axes: QueryTemporalAxesUnresolved::all(),
                after: None,
                limit: None,
                include_count: false,
            },
        )
        .await
        .expect("could not get data type")
        .data_types;

    assert_eq!(
        data_types.len(),
        1,
        "expected one data type, got {data_types:?}"
    );
    assert_eq!(data_types[0].schema.id, list_v1.id);
}

#[tokio::test]
#[expect(clippy::too_many_lines)]
async fn inheritance() {
    fn create_params(filter: Filter<DataTypeWithMetadata>) -> QueryDataTypesParams {
        QueryDataTypesParams {
            filter,
            temporal_axes: QueryTemporalAxesUnresolved::all(),
            after: None,
            limit: None,
            include_count: false,
        }
    }

    let mut database = DatabaseTestWrapper::new().await;
    let mut api = database
        .seed(
            // The order of the data types can be arbitrary
            [
                hash_graph_test_data::data_type::VALUE_V1,
                hash_graph_test_data::data_type::LENGTH_V1,
                hash_graph_test_data::data_type::NUMBER_V1,
                hash_graph_test_data::data_type::METER_V1,
            ],
            [hash_graph_test_data::property_type::LENGTH_V1],
            [hash_graph_test_data::entity_type::LINE_V1],
        )
        .await
        .expect("could not seed database");

    let centimeter_dt_v1: DataType =
        serde_json::from_str(hash_graph_test_data::data_type::CENTIMETER_V1)
            .expect("could not parse data type representation");
    let centimeter_dt_v2: DataType =
        serde_json::from_str(hash_graph_test_data::data_type::CENTIMETER_V2)
            .expect("could not parse data type representation");
    let meter_dt_v1: DataType = serde_json::from_str(hash_graph_test_data::data_type::METER_V1)
        .expect("could not parse data type representation");

    api.create_data_type(
        api.account_id,
        CreateDataTypeParams {
            schema: centimeter_dt_v1.clone(),
            ownership: OntologyOwnership::Local {
                web_id: WebId::new(api.account_id),
            },
            conflict_behavior: ConflictBehavior::Fail,
            provenance: ProvidedOntologyEditionProvenance {
                actor_type: ActorType::User,
                origin: OriginProvenance::from_empty_type(OriginType::Api),
                sources: Vec::new(),
            },
            conversions: HashMap::new(),
        },
    )
    .await
    .expect("could not create data type");
    let centimeter_id = DataTypeUuid::from_url(&centimeter_dt_v1.id);

    assert_eq!(
        api.query_data_types(
            api.account_id,
            create_params(Filter::for_data_type_parents(&[centimeter_id], None))
        )
        .await
        .expect("could not get data type")
        .data_types
        .len(),
        3,
        "expected two data types"
    );

    assert_eq!(
        api.query_data_types(
            api.account_id,
            create_params(Filter::for_data_type_parents(&[centimeter_id], Some(0)))
        )
        .await
        .expect("could not get data type")
        .data_types
        .len(),
        1,
        "expected one data type"
    );

    assert_eq!(
        api.query_data_types(
            api.account_id,
            create_params(Filter::for_data_type_parents(&[centimeter_id], Some(1)))
        )
        .await
        .expect("could not get data type")
        .data_types
        .len(),
        2,
        "expected one data type"
    );

    let number_url = VersionedUrl::from_str(
        "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
    )
    .expect("could not parse versioned url");
    assert_eq!(
        api.query_data_types(
            api.account_id,
            create_params(Filter::for_data_type_children(&number_url, None))
        )
        .await
        .expect("could not get data type")
        .data_types
        .len(),
        3,
        "expected two data types"
    );

    assert_eq!(
        api.query_data_types(
            api.account_id,
            create_params(Filter::for_data_type_children(&number_url, Some(0)))
        )
        .await
        .expect("could not get data type")
        .data_types
        .len(),
        1,
        "expected one data type"
    );

    assert_eq!(
        api.query_data_types(
            api.account_id,
            create_params(Filter::for_data_type_children(&number_url, Some(1)))
        )
        .await
        .expect("could not get data type")
        .data_types
        .len(),
        3,
        "expected one data type"
    );

    api.update_data_type(
        api.account_id,
        UpdateDataTypesParams {
            schema: centimeter_dt_v2.clone(),
            provenance: ProvidedOntologyEditionProvenance {
                actor_type: ActorType::User,
                origin: OriginProvenance::from_empty_type(OriginType::Api),
                sources: Vec::new(),
            },
            conversions: HashMap::new(),
        },
    )
    .await
    .expect("could not update data type");

    // No data type is provided. Validation for `length` fails as it's ambiguous, validation for
    // `meter` passes. However, the creation fails as `length` has children and it could potentially
    // be a child of `length`. Without a data type ID being specified we can't know which one to
    // choose.
    _ = api
        .create_entity(
            api.account_id,
            CreateEntityParams {
                web_id: WebId::new(api.account_id),
                entity_uuid: None,
                decision_time: None,
                entity_type_ids: HashSet::from([VersionedUrl::from_str(
                    "http://localhost:3000/@alice/types/entity-type/line/v/1",
                )
                .expect("couldn't construct Base URL")]),
                properties: PropertyObjectWithMetadata {
                    value: HashMap::from([(
                        BaseUrl::new(
                            "http://localhost:3000/@alice/types/property-type/length/".to_owned(),
                        )
                        .expect("couldn't construct Base URL"),
                        PropertyWithMetadata::Value(PropertyValueWithMetadata {
                            value: PropertyValue::Number(Real::from(5)),
                            metadata: ValueMetadata {
                                provenance: ValueProvenance::default(),
                                confidence: None,
                                data_type_id: None,
                                original_data_type_id: None,
                                canonical: HashMap::default(),
                            },
                        }),
                    )]),
                    metadata: ObjectMetadata::default(),
                },
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
        .expect_err("could create ambiguous entity");

    // We specify `meter` as data type, it could be the child of `length` or `meter`. We treat
    // `oneOf` in property types as an `anyOf`, so this is allowed.
    // TODO: Change the type system to use `anyOf` instead
    //   see https://linear.app/hash/issue/H-3263/fix-type-system-to-use-anyof-instead-of-oneof
    api.create_entity(
        api.account_id,
        CreateEntityParams {
            web_id: WebId::new(api.account_id),
            entity_uuid: None,
            decision_time: None,
            entity_type_ids: HashSet::from([VersionedUrl::from_str(
                "http://localhost:3000/@alice/types/entity-type/line/v/1",
            )
            .expect("couldn't construct Base URL")]),
            properties: PropertyObjectWithMetadata {
                value: HashMap::from([(
                    BaseUrl::new(
                        "http://localhost:3000/@alice/types/property-type/length/".to_owned(),
                    )
                    .expect("couldn't construct Base URL"),
                    PropertyWithMetadata::Value(PropertyValueWithMetadata {
                        value: PropertyValue::Number(Real::from(10)),
                        metadata: ValueMetadata {
                            provenance: ValueProvenance::default(),
                            confidence: None,
                            data_type_id: Some(meter_dt_v1.id.clone()),
                            original_data_type_id: None,
                            canonical: HashMap::default(),
                        },
                    }),
                )]),
                metadata: ObjectMetadata::default(),
            },
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
    .expect("should be able to create entity");

    // We specify `centimeter` as data type, so the validation for `length` passes, the validation
    // for `meter` fails, and the entity is created.
    api.create_entity(
        api.account_id,
        CreateEntityParams {
            web_id: WebId::new(api.account_id),
            entity_uuid: None,
            decision_time: None,
            entity_type_ids: HashSet::from([VersionedUrl::from_str(
                "http://localhost:3000/@alice/types/entity-type/line/v/1",
            )
            .expect("couldn't construct Base URL")]),
            properties: PropertyObjectWithMetadata {
                value: HashMap::from([(
                    BaseUrl::new(
                        "http://localhost:3000/@alice/types/property-type/length/".to_owned(),
                    )
                    .expect("couldn't construct Base URL"),
                    PropertyWithMetadata::Value(PropertyValueWithMetadata {
                        value: PropertyValue::Number(Real::from(10)),
                        metadata: ValueMetadata {
                            provenance: ValueProvenance::default(),
                            confidence: None,
                            data_type_id: Some(centimeter_dt_v2.id.clone()),
                            original_data_type_id: None,
                            canonical: HashMap::default(),
                        },
                    }),
                )]),
                metadata: ObjectMetadata::default(),
            },
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
    .expect("could not create entity with child data type");
}

#[tokio::test]
async fn update() {
    let object_dt_v1: DataType = serde_json::from_str(hash_graph_test_data::data_type::OBJECT_V1)
        .expect("could not parse data type representation");

    let object_dt_v2: DataType = serde_json::from_str(hash_graph_test_data::data_type::OBJECT_V2)
        .expect("could not parse data type representation");

    let mut database = DatabaseTestWrapper::new().await;
    let mut api = database
        .seed([hash_graph_test_data::data_type::VALUE_V1], [], [])
        .await
        .expect("could not seed database");

    api.create_data_type(
        api.account_id,
        CreateDataTypeParams {
            schema: object_dt_v1.clone(),
            ownership: OntologyOwnership::Local {
                web_id: WebId::new(api.account_id),
            },
            conflict_behavior: ConflictBehavior::Fail,
            provenance: ProvidedOntologyEditionProvenance {
                actor_type: ActorType::User,
                origin: OriginProvenance::from_empty_type(OriginType::Api),
                sources: Vec::new(),
            },
            conversions: HashMap::new(),
        },
    )
    .await
    .expect("could not create data type");

    api.update_data_type(
        api.account_id,
        UpdateDataTypesParams {
            schema: object_dt_v2.clone(),
            provenance: ProvidedOntologyEditionProvenance {
                actor_type: ActorType::User,
                origin: OriginProvenance::from_empty_type(OriginType::Api),
                sources: Vec::new(),
            },
            conversions: HashMap::new(),
        },
    )
    .await
    .expect("could not update data type");

    let returned_object_dt_v1 = api
        .query_data_types(
            api.account_id,
            QueryDataTypesParams {
                filter: Filter::for_versioned_url(&object_dt_v1.id),
                temporal_axes: QueryTemporalAxesUnresolved::all(),
                after: None,
                limit: None,
                include_count: false,
            },
        )
        .await
        .expect("could not get data type")
        .data_types
        .pop()
        .expect("no data type found");

    let returned_object_dt_v2 = api
        .query_data_types(
            api.account_id,
            QueryDataTypesParams {
                filter: Filter::for_versioned_url(&object_dt_v2.id),
                temporal_axes: QueryTemporalAxesUnresolved::all(),
                after: None,
                limit: None,
                include_count: false,
            },
        )
        .await
        .expect("could not get data type")
        .data_types
        .pop()
        .expect("no data type found");

    assert_eq!(object_dt_v1.id, returned_object_dt_v1.schema.id);
    assert_eq!(object_dt_v2.id, returned_object_dt_v2.schema.id);
}

#[tokio::test]
#[expect(clippy::too_many_lines)]
async fn insert_same_base_url() {
    let object_dt_v1: DataType = serde_json::from_str(hash_graph_test_data::data_type::OBJECT_V1)
        .expect("could not parse data type representation");

    let object_dt_v2: DataType = serde_json::from_str(hash_graph_test_data::data_type::OBJECT_V2)
        .expect("could not parse data type representation");

    let mut database = DatabaseTestWrapper::new().await;
    let mut api = database
        .seed([hash_graph_test_data::data_type::VALUE_V1], [], [])
        .await
        .expect("could not seed database");

    api.create_data_type(
        api.account_id,
        CreateDataTypeParams {
            schema: object_dt_v1.clone(),
            ownership: OntologyOwnership::Local {
                web_id: WebId::new(api.account_id),
            },
            conflict_behavior: ConflictBehavior::Fail,
            provenance: ProvidedOntologyEditionProvenance {
                actor_type: ActorType::User,
                origin: OriginProvenance::from_empty_type(OriginType::Api),
                sources: Vec::new(),
            },
            conversions: HashMap::new(),
        },
    )
    .await
    .expect("could not create data type");

    let report = api
        .create_data_type(
            api.account_id,
            CreateDataTypeParams {
                schema: object_dt_v1.clone(),
                ownership: OntologyOwnership::Local {
                    web_id: WebId::new(api.account_id),
                },
                conflict_behavior: ConflictBehavior::Fail,
                provenance: ProvidedOntologyEditionProvenance {
                    actor_type: ActorType::User,
                    origin: OriginProvenance::from_empty_type(OriginType::Api),
                    sources: Vec::new(),
                },
                conversions: HashMap::new(),
            },
        )
        .await
        .expect_err("could create data type");
    assert!(
        report.contains::<BaseUrlAlreadyExists>(),
        "wrong error, expected `BaseUrlDoesNotExist`, got {report:?}"
    );

    let report = api
        .create_data_type(
            api.account_id,
            CreateDataTypeParams {
                schema: object_dt_v2.clone(),
                ownership: OntologyOwnership::Local {
                    web_id: WebId::new(api.account_id),
                },
                conflict_behavior: ConflictBehavior::Fail,
                provenance: ProvidedOntologyEditionProvenance {
                    actor_type: ActorType::User,
                    origin: OriginProvenance::from_empty_type(OriginType::Api),
                    sources: Vec::new(),
                },
                conversions: HashMap::new(),
            },
        )
        .await
        .expect_err("could create data type");
    assert!(
        report.contains::<BaseUrlAlreadyExists>(),
        "wrong error, expected `BaseUrlDoesNotExist`, got {report:?}"
    );

    let report = api
        .create_data_type(
            api.account_id,
            CreateDataTypeParams {
                schema: object_dt_v1,
                ownership: OntologyOwnership::Remote {
                    fetched_at: OffsetDateTime::now_utc(),
                },
                conflict_behavior: ConflictBehavior::Fail,
                provenance: ProvidedOntologyEditionProvenance {
                    actor_type: ActorType::User,
                    origin: OriginProvenance::from_empty_type(OriginType::Api),
                    sources: Vec::new(),
                },
                conversions: HashMap::new(),
            },
        )
        .await
        .expect_err("could create data type");
    assert!(
        report.contains::<BaseUrlAlreadyExists>(),
        "wrong error, expected `BaseUrlDoesNotExist`, got {report:?}"
    );

    let report = api
        .create_data_type(
            api.account_id,
            CreateDataTypeParams {
                schema: object_dt_v2,
                ownership: OntologyOwnership::Remote {
                    fetched_at: OffsetDateTime::now_utc(),
                },
                conflict_behavior: ConflictBehavior::Fail,
                provenance: ProvidedOntologyEditionProvenance {
                    actor_type: ActorType::User,
                    origin: OriginProvenance::from_empty_type(OriginType::Api),
                    sources: Vec::new(),
                },
                conversions: HashMap::new(),
            },
        )
        .await
        .expect_err("could create data type");
    assert!(
        report.contains::<BaseUrlAlreadyExists>(),
        "wrong error, expected `BaseUrlDoesNotExist`, got {report:?}"
    );
}

#[tokio::test]
async fn wrong_update_order() {
    let object_dt_v1: DataType = serde_json::from_str(hash_graph_test_data::data_type::OBJECT_V1)
        .expect("could not parse data type representation");

    let object_dt_v2: DataType = serde_json::from_str(hash_graph_test_data::data_type::OBJECT_V2)
        .expect("could not parse data type representation");

    let mut database = DatabaseTestWrapper::new().await;
    let mut api = database
        .seed([hash_graph_test_data::data_type::VALUE_V1], [], [])
        .await
        .expect("could not seed database");

    let report = api
        .update_data_type(
            api.account_id,
            UpdateDataTypesParams {
                schema: object_dt_v1.clone(),
                provenance: ProvidedOntologyEditionProvenance {
                    actor_type: ActorType::User,
                    origin: OriginProvenance::from_empty_type(OriginType::Api),
                    sources: Vec::new(),
                },
                conversions: HashMap::new(),
            },
        )
        .await
        .expect_err("could create data type");
    assert!(
        report.contains::<OntologyVersionDoesNotExist>(),
        "wrong error, expected `OntologyVersionDoesNotExist`, got {report:?}"
    );

    api.create_data_type(
        api.account_id,
        CreateDataTypeParams {
            schema: object_dt_v1.clone(),
            ownership: OntologyOwnership::Local {
                web_id: WebId::new(api.account_id),
            },
            conflict_behavior: ConflictBehavior::Fail,
            provenance: ProvidedOntologyEditionProvenance {
                actor_type: ActorType::User,
                origin: OriginProvenance::from_empty_type(OriginType::Api),
                sources: Vec::new(),
            },
            conversions: HashMap::new(),
        },
    )
    .await
    .expect("could not create data type");

    let report = api
        .update_data_type(
            api.account_id,
            UpdateDataTypesParams {
                schema: object_dt_v1.clone(),
                provenance: ProvidedOntologyEditionProvenance {
                    actor_type: ActorType::User,
                    origin: OriginProvenance::from_empty_type(OriginType::Api),
                    sources: Vec::new(),
                },
                conversions: HashMap::new(),
            },
        )
        .await
        .expect_err("could update data type");
    assert!(
        report.contains::<OntologyVersionDoesNotExist>(),
        "wrong error, expected `OntologyVersionDoesNotExist`, got {report:?}"
    );

    api.update_data_type(
        api.account_id,
        UpdateDataTypesParams {
            schema: object_dt_v2.clone(),
            provenance: ProvidedOntologyEditionProvenance {
                actor_type: ActorType::User,
                origin: OriginProvenance::from_empty_type(OriginType::Api),
                sources: Vec::new(),
            },
            conversions: HashMap::new(),
        },
    )
    .await
    .expect("could not update data type");

    let report = api
        .update_data_type(
            api.account_id,
            UpdateDataTypesParams {
                schema: object_dt_v2.clone(),
                provenance: ProvidedOntologyEditionProvenance {
                    actor_type: ActorType::User,
                    origin: OriginProvenance::from_empty_type(OriginType::Api),
                    sources: Vec::new(),
                },
                conversions: HashMap::new(),
            },
        )
        .await
        .expect_err("could update data type");
    assert!(
        report.contains::<VersionedUrlAlreadyExists>(),
        "wrong error, expected `OntologyVersionDoesNotExist`, got {report:?}"
    );
}

#[tokio::test]
async fn update_external_with_owned() {
    let object_dt_v1: DataType = serde_json::from_str(hash_graph_test_data::data_type::OBJECT_V1)
        .expect("could not parse data type representation");

    let object_dt_v2: DataType = serde_json::from_str(hash_graph_test_data::data_type::OBJECT_V2)
        .expect("could not parse data type representation");

    let mut database = DatabaseTestWrapper::new().await;
    let mut api = database
        .seed([hash_graph_test_data::data_type::VALUE_V1], [], [])
        .await
        .expect("could not seed database");

    api.create_data_type(
        api.account_id,
        CreateDataTypeParams {
            schema: object_dt_v1,
            ownership: OntologyOwnership::Remote {
                fetched_at: OffsetDateTime::now_utc(),
            },
            conflict_behavior: ConflictBehavior::Fail,
            provenance: ProvidedOntologyEditionProvenance {
                actor_type: ActorType::User,
                origin: OriginProvenance::from_empty_type(OriginType::Api),
                sources: Vec::new(),
            },
            conversions: HashMap::new(),
        },
    )
    .await
    .expect("could not create data type");

    let report = api
        .update_data_type(
            api.account_id,
            UpdateDataTypesParams {
                schema: object_dt_v2.clone(),
                provenance: ProvidedOntologyEditionProvenance {
                    actor_type: ActorType::User,
                    origin: OriginProvenance::from_empty_type(OriginType::Api),
                    sources: Vec::new(),
                },
                conversions: HashMap::new(),
            },
        )
        .await
        .expect_err("could update data type");
    assert!(
        report.contains::<OntologyTypeIsNotOwned>(),
        "wrong error, expected `OntologyTypeIsNotOwned`, got {report:?}"
    );

    api.create_data_type(
        api.account_id,
        CreateDataTypeParams {
            schema: object_dt_v2.clone(),
            ownership: OntologyOwnership::Remote {
                fetched_at: OffsetDateTime::now_utc(),
            },
            conflict_behavior: ConflictBehavior::Fail,
            provenance: ProvidedOntologyEditionProvenance {
                actor_type: ActorType::User,
                origin: OriginProvenance::from_empty_type(OriginType::Api),
                sources: Vec::new(),
            },
            conversions: HashMap::new(),
        },
    )
    .await
    .expect("could not create data type");

    let report = api
        .update_data_type(
            api.account_id,
            UpdateDataTypesParams {
                schema: object_dt_v2,
                provenance: ProvidedOntologyEditionProvenance {
                    actor_type: ActorType::User,
                    origin: OriginProvenance::from_empty_type(OriginType::Api),
                    sources: Vec::new(),
                },
                conversions: HashMap::new(),
            },
        )
        .await
        .expect_err("could update data type");
    assert!(
        report.contains::<OntologyTypeIsNotOwned>(),
        "wrong error, expected `OntologyTypeIsNotOwned`, got {report:?}"
    );
}

async fn is_queryable(api: &DatabaseApi<'_>, data_type_id: &VersionedUrl) -> bool {
    !api.query_data_types(
        api.account_id,
        QueryDataTypesParams {
            filter: Filter::for_versioned_url(data_type_id),
            temporal_axes: QueryTemporalAxesUnresolved::live_only(),
            after: None,
            limit: None,
            include_count: false,
        },
    )
    .await
    .expect("could not query data types")
    .data_types
    .is_empty()
}

#[tokio::test]
async fn archive_unarchive_round_trip() {
    let list_v1: DataType = serde_json::from_str(hash_graph_test_data::data_type::LIST_V1)
        .expect("could not parse data type representation");

    let mut database = DatabaseTestWrapper::new().await;
    let mut api = database
        .seed([hash_graph_test_data::data_type::VALUE_V1], [], [])
        .await
        .expect("could not seed database");

    api.create_data_type(
        api.account_id,
        CreateDataTypeParams {
            schema: list_v1.clone(),
            ownership: OntologyOwnership::Local {
                web_id: WebId::new(api.account_id),
            },
            conflict_behavior: ConflictBehavior::Fail,
            provenance: ProvidedOntologyEditionProvenance {
                actor_type: ActorType::User,
                origin: OriginProvenance::from_empty_type(OriginType::Api),
                sources: Vec::new(),
            },
            conversions: HashMap::new(),
        },
    )
    .await
    .expect("could not create data type");

    assert!(
        is_queryable(&api, &list_v1.id).await,
        "data type should be queryable after creation"
    );

    api.archive_data_type(
        api.account_id,
        ArchiveDataTypeParams {
            data_type_id: Cow::Borrowed(&list_v1.id),
        },
    )
    .await
    .expect("could not archive data type");

    assert!(
        !is_queryable(&api, &list_v1.id).await,
        "data type should not be queryable after archival"
    );

    api.unarchive_data_type(
        api.account_id,
        UnarchiveDataTypeParams {
            data_type_id: list_v1.id.clone(),
            provenance: ProvidedOntologyEditionProvenance {
                actor_type: ActorType::User,
                origin: OriginProvenance::from_empty_type(OriginType::Api),
                sources: Vec::new(),
            },
        },
    )
    .await
    .expect("could not unarchive data type");

    assert!(
        is_queryable(&api, &list_v1.id).await,
        "data type should be queryable after unarchival"
    );
}

/// The resolved temporal axes of a subgraph response are taken from the database clock: database
/// clock readings bracketing the query must also bracket the resolved pinned timestamp,
/// regardless of the host clock.
#[tokio::test]
async fn resolved_temporal_axes_use_database_clock() {
    let value_v1: DataType = serde_json::from_str(hash_graph_test_data::data_type::VALUE_V1)
        .expect("could not parse data type representation");

    let mut database = DatabaseTestWrapper::new().await;
    let api = database
        .seed([hash_graph_test_data::data_type::VALUE_V1], [], [])
        .await
        .expect("could not seed database");

    let db_time_before: Timestamp<()> = api
        .store
        .as_client()
        .query_one("SELECT statement_timestamp();", &[])
        .await
        .expect("could not read the database clock")
        .get(0);

    let response = api
        .query_data_type_subgraph(
            api.account_id,
            QueryDataTypeSubgraphParams::Paths {
                traversal_paths: Vec::new(),
                request: QueryDataTypesParams {
                    filter: Filter::for_versioned_url(&value_v1.id),
                    temporal_axes: QueryTemporalAxesUnresolved::live_only(),
                    after: None,
                    limit: None,
                    include_count: false,
                },
            },
        )
        .await
        .expect("could not query data type subgraph");

    let db_time_after: Timestamp<()> = api
        .store
        .as_client()
        .query_one("SELECT statement_timestamp();", &[])
        .await
        .expect("could not read the database clock")
        .get(0);

    let QueryTemporalAxes::DecisionTime { pinned, .. } = response.subgraph.temporal_axes.resolved
    else {
        panic!("expected decision-time temporal axes");
    };
    let pinned_timestamp: Timestamp<()> = pinned.timestamp.cast();

    assert!(
        db_time_before <= pinned_timestamp && pinned_timestamp <= db_time_after,
        "resolved pinned timestamp should come from the database clock: expected {db_time_before} \
         <= {pinned_timestamp} <= {db_time_after}"
    );
}
