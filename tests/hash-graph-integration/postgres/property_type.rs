use graph::{
    store::{
        ontology::{CreatePropertyTypeParams, GetPropertyTypesParams, UpdatePropertyTypesParams},
        query::Filter,
        ConflictBehavior, PropertyTypeStore,
    },
    subgraph::temporal_axes::{
        PinnedTemporalAxisUnresolved, QueryTemporalAxesUnresolved, VariableTemporalAxisUnresolved,
    },
};
use graph_test_data::{data_type, property_type};
use graph_types::{
    ontology::{OntologyTypeClassificationMetadata, ProvidedOntologyEditionProvenance},
    owned_by_id::OwnedById,
};
use temporal_versioning::TemporalBound;
use type_system::PropertyType;

use crate::{property_type_relationships, DatabaseTestWrapper};

#[tokio::test]
async fn insert() {
    let age_pt: PropertyType =
        serde_json::from_str(property_type::AGE_V1).expect("could not parse property type");

    let mut database = DatabaseTestWrapper::new().await;
    let mut api = database
        .seed([data_type::NUMBER_V1], [], [])
        .await
        .expect("could not seed database");

    api.create_property_type(
        api.account_id,
        CreatePropertyTypeParams {
            schema: age_pt,
            classification: OntologyTypeClassificationMetadata::Owned {
                owned_by_id: OwnedById::new(api.account_id.into_uuid()),
            },
            relationships: property_type_relationships(),
            conflict_behavior: ConflictBehavior::Fail,
            provenance: ProvidedOntologyEditionProvenance::default(),
        },
    )
    .await
    .expect("could not create property type");
}

#[tokio::test]
async fn query() {
    let favorite_quote_pt: PropertyType = serde_json::from_str(property_type::FAVORITE_QUOTE_V1)
        .expect("could not parse property type representation");

    let mut database = DatabaseTestWrapper::new().await;
    let mut api = database
        .seed([data_type::TEXT_V1], [], [])
        .await
        .expect("could not seed database");

    api.create_property_type(
        api.account_id,
        CreatePropertyTypeParams {
            schema: favorite_quote_pt.clone(),
            classification: OntologyTypeClassificationMetadata::Owned {
                owned_by_id: OwnedById::new(api.account_id.into_uuid()),
            },
            relationships: property_type_relationships(),
            conflict_behavior: ConflictBehavior::Fail,
            provenance: ProvidedOntologyEditionProvenance::default(),
        },
    )
    .await
    .expect("could not create property type");

    let property_type = api
        .get_property_types(
            api.account_id,
            GetPropertyTypesParams {
                filter: Filter::for_versioned_url(&favorite_quote_pt.id),
                temporal_axes: QueryTemporalAxesUnresolved::DecisionTime {
                    pinned: PinnedTemporalAxisUnresolved::new(None),
                    variable: VariableTemporalAxisUnresolved::new(
                        Some(TemporalBound::Unbounded),
                        None,
                    ),
                },
                after: None,
                limit: None,
                include_drafts: false,
                include_count: false,
            },
        )
        .await
        .expect("could not get property type")
        .property_types
        .pop()
        .expect("no property type found");

    assert_eq!(property_type.schema.id, favorite_quote_pt.id);
}

#[tokio::test]
async fn update() {
    let user_id_pt_v1: PropertyType = serde_json::from_str(property_type::USER_ID_V1)
        .expect("could not parse property type representation");

    let user_id_pt_v2: PropertyType = serde_json::from_str(property_type::USER_ID_V2)
        .expect("could not parse property type representation");

    let mut database = DatabaseTestWrapper::new().await;
    let mut api = database
        .seed([data_type::TEXT_V1, data_type::NUMBER_V1], [], [])
        .await
        .expect("could not seed database");

    api.create_property_type(
        api.account_id,
        CreatePropertyTypeParams {
            schema: user_id_pt_v1.clone(),
            classification: OntologyTypeClassificationMetadata::Owned {
                owned_by_id: OwnedById::new(api.account_id.into_uuid()),
            },
            relationships: property_type_relationships(),
            conflict_behavior: ConflictBehavior::Fail,
            provenance: ProvidedOntologyEditionProvenance::default(),
        },
    )
    .await
    .expect("could not create property type");

    api.update_property_type(
        api.account_id,
        UpdatePropertyTypesParams {
            schema: user_id_pt_v2.clone(),
            relationships: property_type_relationships(),
            provenance: ProvidedOntologyEditionProvenance::default(),
        },
    )
    .await
    .expect("could not update property type");

    let returned_user_id_pt_v1 = api
        .get_property_types(
            api.account_id,
            GetPropertyTypesParams {
                filter: Filter::for_versioned_url(&user_id_pt_v1.id),
                temporal_axes: QueryTemporalAxesUnresolved::DecisionTime {
                    pinned: PinnedTemporalAxisUnresolved::new(None),
                    variable: VariableTemporalAxisUnresolved::new(
                        Some(TemporalBound::Unbounded),
                        None,
                    ),
                },
                after: None,
                limit: None,
                include_drafts: false,
                include_count: false,
            },
        )
        .await
        .expect("could not get property type")
        .property_types
        .pop()
        .expect("no property type found");

    let returned_user_id_pt_v2 = api
        .get_property_types(
            api.account_id,
            GetPropertyTypesParams {
                filter: Filter::for_versioned_url(&user_id_pt_v2.id),
                temporal_axes: QueryTemporalAxesUnresolved::DecisionTime {
                    pinned: PinnedTemporalAxisUnresolved::new(None),
                    variable: VariableTemporalAxisUnresolved::new(
                        Some(TemporalBound::Unbounded),
                        None,
                    ),
                },
                after: None,
                limit: None,
                include_drafts: false,
                include_count: false,
            },
        )
        .await
        .expect("could not get property type")
        .property_types
        .pop()
        .expect("no property type found");

    assert_eq!(user_id_pt_v1.id, returned_user_id_pt_v1.schema.id);
    assert_eq!(user_id_pt_v2.id, returned_user_id_pt_v2.schema.id);
}
