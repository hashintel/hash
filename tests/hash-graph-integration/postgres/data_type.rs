use core::str::FromStr;
use std::collections::{HashMap, HashSet};

use graph::store::{
    BaseUrlAlreadyExists, DataTypeStore, EntityStore,
    error::{OntologyTypeIsNotOwned, OntologyVersionDoesNotExist, VersionedUrlAlreadyExists},
    knowledge::CreateEntityParams,
    ontology::{CreateDataTypeParams, GetDataTypesParams, UpdateDataTypesParams},
};
use graph_types::{
    knowledge::{
        entity::ProvidedEntityEditionProvenance,
        property::{
            ObjectMetadata, PropertyProvenance, PropertyWithMetadata, PropertyWithMetadataObject,
            PropertyWithMetadataValue, ValueMetadata,
        },
    },
    ontology::{
        DataTypeId, DataTypeWithMetadata, OntologyTypeClassificationMetadata,
        ProvidedOntologyEditionProvenance,
    },
    owned_by_id::OwnedById,
};
use hash_graph_store::{
    ConflictBehavior,
    filter::Filter,
    subgraph::temporal_axes::{
        PinnedTemporalAxisUnresolved, QueryTemporalAxesUnresolved, VariableTemporalAxisUnresolved,
    },
};
use serde_json::json;
use temporal_versioning::TemporalBound;
use time::OffsetDateTime;
use type_system::{
    schema::DataType,
    url::{BaseUrl, VersionedUrl},
};

use crate::{DatabaseTestWrapper, data_type_relationships};

#[tokio::test]
async fn insert() {
    let boolean_dt: DataType = serde_json::from_str(graph_test_data::data_type::BOOLEAN_V1)
        .expect("could not parse data type representation");

    let mut database = DatabaseTestWrapper::new().await;
    let mut api = database
        .seed([], [], [])
        .await
        .expect("could not seed database");

    api.create_data_type(api.account_id, CreateDataTypeParams {
        schema: boolean_dt,
        classification: OntologyTypeClassificationMetadata::Owned {
            owned_by_id: OwnedById::new(api.account_id.into_uuid()),
        },
        relationships: data_type_relationships(),
        conflict_behavior: ConflictBehavior::Fail,
        provenance: ProvidedOntologyEditionProvenance::default(),
        conversions: HashMap::new(),
    })
    .await
    .expect("could not create data type");
}

#[tokio::test]
async fn query() {
    let empty_list_dt: DataType = serde_json::from_str(graph_test_data::data_type::EMPTY_LIST_V1)
        .expect("could not parse data type representation");

    let mut database = DatabaseTestWrapper::new().await;
    let mut api = database
        .seed([], [], [])
        .await
        .expect("could not seed database");

    api.create_data_type(api.account_id, CreateDataTypeParams {
        schema: empty_list_dt.clone(),
        classification: OntologyTypeClassificationMetadata::Owned {
            owned_by_id: OwnedById::new(api.account_id.into_uuid()),
        },
        relationships: data_type_relationships(),
        conflict_behavior: ConflictBehavior::Fail,
        provenance: ProvidedOntologyEditionProvenance::default(),
        conversions: HashMap::new(),
    })
    .await
    .expect("could not create data type");

    let data_types = api
        .get_data_types(api.account_id, GetDataTypesParams {
            filter: Filter::for_versioned_url(&empty_list_dt.id),
            temporal_axes: QueryTemporalAxesUnresolved::DecisionTime {
                pinned: PinnedTemporalAxisUnresolved::new(None),
                variable: VariableTemporalAxisUnresolved::new(Some(TemporalBound::Unbounded), None),
            },
            after: None,
            limit: None,
            include_drafts: false,
            include_count: false,
        })
        .await
        .expect("could not get data type")
        .data_types;

    assert_eq!(
        data_types.len(),
        1,
        "expected one data type, got {data_types:?}"
    );
    assert_eq!(data_types[0].schema.id, empty_list_dt.id);
}

#[tokio::test]
#[expect(clippy::too_many_lines)]
async fn inheritance() {
    fn create_params(filter: Filter<DataTypeWithMetadata>) -> GetDataTypesParams {
        GetDataTypesParams {
            filter,
            temporal_axes: QueryTemporalAxesUnresolved::DecisionTime {
                pinned: PinnedTemporalAxisUnresolved::new(None),
                variable: VariableTemporalAxisUnresolved::new(Some(TemporalBound::Unbounded), None),
            },
            after: None,
            limit: None,
            include_drafts: false,
            include_count: false,
        }
    }

    let mut database = DatabaseTestWrapper::new().await;
    let mut api = database
        .seed(
            // The order of the data types can be arbitrary
            [
                graph_test_data::data_type::LENGTH_V1,
                graph_test_data::data_type::NUMBER_V1,
                graph_test_data::data_type::METER_V1,
            ],
            [graph_test_data::property_type::LENGTH_V1],
            [graph_test_data::entity_type::LINE_V1],
        )
        .await
        .expect("could not seed database");

    let centimeter_dt_v1: DataType =
        serde_json::from_str(graph_test_data::data_type::CENTIMETER_V1)
            .expect("could not parse data type representation");
    let centimeter_dt_v2: DataType =
        serde_json::from_str(graph_test_data::data_type::CENTIMETER_V2)
            .expect("could not parse data type representation");
    let meter_dt_v1: DataType = serde_json::from_str(graph_test_data::data_type::METER_V1)
        .expect("could not parse data type representation");

    api.create_data_type(api.account_id, CreateDataTypeParams {
        schema: centimeter_dt_v1.clone(),
        classification: OntologyTypeClassificationMetadata::Owned {
            owned_by_id: OwnedById::new(api.account_id.into_uuid()),
        },
        relationships: data_type_relationships(),
        conflict_behavior: ConflictBehavior::Fail,
        provenance: ProvidedOntologyEditionProvenance::default(),
        conversions: HashMap::new(),
    })
    .await
    .expect("could not create data type");
    let centimeter_id = DataTypeId::from_url(&centimeter_dt_v1.id);

    assert_eq!(
        api.get_data_types(
            api.account_id,
            create_params(Filter::for_data_type_parents(&[centimeter_id], None))
        )
        .await
        .expect("could not get data type")
        .data_types
        .len(),
        2,
        "expected two data types"
    );

    assert_eq!(
        api.get_data_types(
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
        api.get_data_types(
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
        api.get_data_types(
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
        api.get_data_types(
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
        api.get_data_types(
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

    api.update_data_type(api.account_id, UpdateDataTypesParams {
        schema: centimeter_dt_v2.clone(),
        relationships: data_type_relationships(),
        provenance: ProvidedOntologyEditionProvenance::default(),
        conversions: HashMap::new(),
    })
    .await
    .expect("could not update data type");

    // No data type is provided. Validation for `length` fails as it's ambiguous, validation for
    // `meter` passes. However, the creation fails as `length` has children and it could potentially
    // be a child of `length`. Without a data type ID being specified we can't know which one to
    // choose.
    _ = api
        .create_entity(api.account_id, CreateEntityParams {
            owned_by_id: OwnedById::new(api.account_id.into_uuid()),
            entity_uuid: None,
            decision_time: None,
            entity_type_ids: HashSet::from([VersionedUrl::from_str(
                "http://localhost:3000/@alice/types/entity-type/line/v/1",
            )
            .expect("couldn't construct Base URL")]),
            properties: PropertyWithMetadataObject {
                value: HashMap::from([(
                    BaseUrl::new(
                        "http://localhost:3000/@alice/types/property-type/length/".to_owned(),
                    )
                    .expect("couldn't construct Base URL"),
                    PropertyWithMetadata::Value(PropertyWithMetadataValue {
                        value: json!(5),
                        metadata: ValueMetadata {
                            provenance: PropertyProvenance::default(),
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
            relationships: [],
            provenance: ProvidedEntityEditionProvenance::default(),
        })
        .await
        .expect_err("could create ambiguous entity");

    // We specify `meter` as data type, it could be the child of `length` or `meter` but only one is
    // allowed. This is expected to be lifted in the future.
    _ = api
        .create_entity(api.account_id, CreateEntityParams {
            owned_by_id: OwnedById::new(api.account_id.into_uuid()),
            entity_uuid: None,
            decision_time: None,
            entity_type_ids: HashSet::from([VersionedUrl::from_str(
                "http://localhost:3000/@alice/types/entity-type/line/v/1",
            )
            .expect("couldn't construct Base URL")]),
            properties: PropertyWithMetadataObject {
                value: HashMap::from([(
                    BaseUrl::new(
                        "http://localhost:3000/@alice/types/property-type/length/".to_owned(),
                    )
                    .expect("couldn't construct Base URL"),
                    PropertyWithMetadata::Value(PropertyWithMetadataValue {
                        value: json!(10),
                        metadata: ValueMetadata {
                            provenance: PropertyProvenance::default(),
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
            relationships: [],
            provenance: ProvidedEntityEditionProvenance::default(),
        })
        .await
        .expect_err("could create ambiguous entity");

    // We specify `centimeter` as data type, so the validation for `length` passes, the validation
    // for `meter` fails, and the entity is created.
    api.create_entity(api.account_id, CreateEntityParams {
        owned_by_id: OwnedById::new(api.account_id.into_uuid()),
        entity_uuid: None,
        decision_time: None,
        entity_type_ids: HashSet::from([VersionedUrl::from_str(
            "http://localhost:3000/@alice/types/entity-type/line/v/1",
        )
        .expect("couldn't construct Base URL")]),
        properties: PropertyWithMetadataObject {
            value: HashMap::from([(
                BaseUrl::new("http://localhost:3000/@alice/types/property-type/length/".to_owned())
                    .expect("couldn't construct Base URL"),
                PropertyWithMetadata::Value(PropertyWithMetadataValue {
                    value: json!(10),
                    metadata: ValueMetadata {
                        provenance: PropertyProvenance::default(),
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
        relationships: [],
        provenance: ProvidedEntityEditionProvenance::default(),
    })
    .await
    .expect("could not create entity with child data type");
}

#[tokio::test]
async fn update() {
    let object_dt_v1: DataType = serde_json::from_str(graph_test_data::data_type::OBJECT_V1)
        .expect("could not parse data type representation");

    let object_dt_v2: DataType = serde_json::from_str(graph_test_data::data_type::OBJECT_V2)
        .expect("could not parse data type representation");

    let mut database = DatabaseTestWrapper::new().await;
    let mut api = database
        .seed([], [], [])
        .await
        .expect("could not seed database");

    api.create_data_type(api.account_id, CreateDataTypeParams {
        schema: object_dt_v1.clone(),
        classification: OntologyTypeClassificationMetadata::Owned {
            owned_by_id: OwnedById::new(api.account_id.into_uuid()),
        },
        relationships: data_type_relationships(),
        conflict_behavior: ConflictBehavior::Fail,
        provenance: ProvidedOntologyEditionProvenance::default(),
        conversions: HashMap::new(),
    })
    .await
    .expect("could not create data type");

    api.update_data_type(api.account_id, UpdateDataTypesParams {
        schema: object_dt_v2.clone(),
        relationships: data_type_relationships(),
        provenance: ProvidedOntologyEditionProvenance::default(),
        conversions: HashMap::new(),
    })
    .await
    .expect("could not update data type");

    let returned_object_dt_v1 = api
        .get_data_types(api.account_id, GetDataTypesParams {
            filter: Filter::for_versioned_url(&object_dt_v1.id),
            temporal_axes: QueryTemporalAxesUnresolved::DecisionTime {
                pinned: PinnedTemporalAxisUnresolved::new(None),
                variable: VariableTemporalAxisUnresolved::new(Some(TemporalBound::Unbounded), None),
            },
            after: None,
            limit: None,
            include_drafts: false,
            include_count: false,
        })
        .await
        .expect("could not get data type")
        .data_types
        .pop()
        .expect("no data type found");

    let returned_object_dt_v2 = api
        .get_data_types(api.account_id, GetDataTypesParams {
            filter: Filter::for_versioned_url(&object_dt_v2.id),
            temporal_axes: QueryTemporalAxesUnresolved::DecisionTime {
                pinned: PinnedTemporalAxisUnresolved::new(None),
                variable: VariableTemporalAxisUnresolved::new(Some(TemporalBound::Unbounded), None),
            },
            after: None,
            limit: None,
            include_drafts: false,
            include_count: false,
        })
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
    let object_dt_v1: DataType = serde_json::from_str(graph_test_data::data_type::OBJECT_V1)
        .expect("could not parse data type representation");

    let object_dt_v2: DataType = serde_json::from_str(graph_test_data::data_type::OBJECT_V2)
        .expect("could not parse data type representation");

    let mut database = DatabaseTestWrapper::new().await;
    let mut api = database
        .seed([], [], [])
        .await
        .expect("could not seed database");

    api.create_data_type(api.account_id, CreateDataTypeParams {
        schema: object_dt_v1.clone(),
        classification: OntologyTypeClassificationMetadata::Owned {
            owned_by_id: OwnedById::new(api.account_id.into_uuid()),
        },
        relationships: data_type_relationships(),
        conflict_behavior: ConflictBehavior::Fail,
        provenance: ProvidedOntologyEditionProvenance::default(),
        conversions: HashMap::new(),
    })
    .await
    .expect("could not create data type");

    let report = api
        .create_data_type(api.account_id, CreateDataTypeParams {
            schema: object_dt_v1.clone(),
            classification: OntologyTypeClassificationMetadata::Owned {
                owned_by_id: OwnedById::new(api.account_id.into_uuid()),
            },
            relationships: data_type_relationships(),
            conflict_behavior: ConflictBehavior::Fail,
            provenance: ProvidedOntologyEditionProvenance::default(),
            conversions: HashMap::new(),
        })
        .await
        .expect_err("could create data type");
    assert!(
        report.contains::<BaseUrlAlreadyExists>(),
        "wrong error, expected `BaseUrlDoesNotExist`, got {report:?}"
    );

    let report = api
        .create_data_type(api.account_id, CreateDataTypeParams {
            schema: object_dt_v2.clone(),
            classification: OntologyTypeClassificationMetadata::Owned {
                owned_by_id: OwnedById::new(api.account_id.into_uuid()),
            },
            relationships: data_type_relationships(),
            conflict_behavior: ConflictBehavior::Fail,
            provenance: ProvidedOntologyEditionProvenance::default(),
            conversions: HashMap::new(),
        })
        .await
        .expect_err("could create data type");
    assert!(
        report.contains::<BaseUrlAlreadyExists>(),
        "wrong error, expected `BaseUrlDoesNotExist`, got {report:?}"
    );

    let report = api
        .create_data_type(api.account_id, CreateDataTypeParams {
            schema: object_dt_v1,
            classification: OntologyTypeClassificationMetadata::External {
                fetched_at: OffsetDateTime::now_utc(),
            },
            relationships: data_type_relationships(),
            conflict_behavior: ConflictBehavior::Fail,
            provenance: ProvidedOntologyEditionProvenance::default(),
            conversions: HashMap::new(),
        })
        .await
        .expect_err("could create data type");
    assert!(
        report.contains::<BaseUrlAlreadyExists>(),
        "wrong error, expected `BaseUrlDoesNotExist`, got {report:?}"
    );

    let report = api
        .create_data_type(api.account_id, CreateDataTypeParams {
            schema: object_dt_v2,
            classification: OntologyTypeClassificationMetadata::External {
                fetched_at: OffsetDateTime::now_utc(),
            },
            relationships: data_type_relationships(),
            conflict_behavior: ConflictBehavior::Fail,
            provenance: ProvidedOntologyEditionProvenance::default(),
            conversions: HashMap::new(),
        })
        .await
        .expect_err("could create data type");
    assert!(
        report.contains::<BaseUrlAlreadyExists>(),
        "wrong error, expected `BaseUrlDoesNotExist`, got {report:?}"
    );
}

#[tokio::test]
async fn wrong_update_order() {
    let object_dt_v1: DataType = serde_json::from_str(graph_test_data::data_type::OBJECT_V1)
        .expect("could not parse data type representation");

    let object_dt_v2: DataType = serde_json::from_str(graph_test_data::data_type::OBJECT_V2)
        .expect("could not parse data type representation");

    let mut database = DatabaseTestWrapper::new().await;
    let mut api = database
        .seed([], [], [])
        .await
        .expect("could not seed database");

    let report = api
        .update_data_type(api.account_id, UpdateDataTypesParams {
            schema: object_dt_v1.clone(),
            relationships: data_type_relationships(),
            provenance: ProvidedOntologyEditionProvenance::default(),
            conversions: HashMap::new(),
        })
        .await
        .expect_err("could create data type");
    assert!(
        report.contains::<OntologyVersionDoesNotExist>(),
        "wrong error, expected `OntologyVersionDoesNotExist`, got {report:?}"
    );

    api.create_data_type(api.account_id, CreateDataTypeParams {
        schema: object_dt_v1.clone(),
        classification: OntologyTypeClassificationMetadata::Owned {
            owned_by_id: OwnedById::new(api.account_id.into_uuid()),
        },
        relationships: data_type_relationships(),
        conflict_behavior: ConflictBehavior::Fail,
        provenance: ProvidedOntologyEditionProvenance::default(),
        conversions: HashMap::new(),
    })
    .await
    .expect("could not create data type");

    let report = api
        .update_data_type(api.account_id, UpdateDataTypesParams {
            schema: object_dt_v1.clone(),
            relationships: data_type_relationships(),
            provenance: ProvidedOntologyEditionProvenance::default(),
            conversions: HashMap::new(),
        })
        .await
        .expect_err("could update data type");
    assert!(
        report.contains::<OntologyVersionDoesNotExist>(),
        "wrong error, expected `OntologyVersionDoesNotExist`, got {report:?}"
    );

    api.update_data_type(api.account_id, UpdateDataTypesParams {
        schema: object_dt_v2.clone(),
        relationships: data_type_relationships(),
        provenance: ProvidedOntologyEditionProvenance::default(),
        conversions: HashMap::new(),
    })
    .await
    .expect("could not update data type");

    let report = api
        .update_data_type(api.account_id, UpdateDataTypesParams {
            schema: object_dt_v2.clone(),
            relationships: data_type_relationships(),
            provenance: ProvidedOntologyEditionProvenance::default(),
            conversions: HashMap::new(),
        })
        .await
        .expect_err("could update data type");
    assert!(
        report.contains::<VersionedUrlAlreadyExists>(),
        "wrong error, expected `OntologyVersionDoesNotExist`, got {report:?}"
    );
}

#[tokio::test]
async fn update_external_with_owned() {
    let object_dt_v1: DataType = serde_json::from_str(graph_test_data::data_type::OBJECT_V1)
        .expect("could not parse data type representation");

    let object_dt_v2: DataType = serde_json::from_str(graph_test_data::data_type::OBJECT_V2)
        .expect("could not parse data type representation");

    let mut database = DatabaseTestWrapper::new().await;
    let mut api = database
        .seed([], [], [])
        .await
        .expect("could not seed database");

    api.create_data_type(api.account_id, CreateDataTypeParams {
        schema: object_dt_v1,
        classification: OntologyTypeClassificationMetadata::External {
            fetched_at: OffsetDateTime::now_utc(),
        },
        relationships: data_type_relationships(),
        conflict_behavior: ConflictBehavior::Fail,
        provenance: ProvidedOntologyEditionProvenance::default(),
        conversions: HashMap::new(),
    })
    .await
    .expect("could not create data type");

    let report = api
        .update_data_type(api.account_id, UpdateDataTypesParams {
            schema: object_dt_v2.clone(),
            relationships: data_type_relationships(),
            provenance: ProvidedOntologyEditionProvenance::default(),
            conversions: HashMap::new(),
        })
        .await
        .expect_err("could update data type");
    assert!(
        report.contains::<OntologyTypeIsNotOwned>(),
        "wrong error, expected `OntologyTypeIsNotOwned`, got {report:?}"
    );

    api.create_data_type(api.account_id, CreateDataTypeParams {
        schema: object_dt_v2.clone(),
        classification: OntologyTypeClassificationMetadata::External {
            fetched_at: OffsetDateTime::now_utc(),
        },
        relationships: data_type_relationships(),
        conflict_behavior: ConflictBehavior::Fail,
        provenance: ProvidedOntologyEditionProvenance::default(),
        conversions: HashMap::new(),
    })
    .await
    .expect("could not create data type");

    let report = api
        .update_data_type(api.account_id, UpdateDataTypesParams {
            schema: object_dt_v2,
            relationships: data_type_relationships(),
            provenance: ProvidedOntologyEditionProvenance::default(),
            conversions: HashMap::new(),
        })
        .await
        .expect_err("could update data type");
    assert!(
        report.contains::<OntologyTypeIsNotOwned>(),
        "wrong error, expected `OntologyTypeIsNotOwned`, got {report:?}"
    );
}
