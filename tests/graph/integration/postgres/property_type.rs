use hash_graph_store::{
    filter::Filter,
    property_type::{
        CreatePropertyTypeParams, GetPropertyTypesParams, PropertyTypeStore as _,
        UpdatePropertyTypesParams,
    },
    query::ConflictBehavior,
    subgraph::temporal_axes::{
        PinnedTemporalAxisUnresolved, QueryTemporalAxesUnresolved, VariableTemporalAxisUnresolved,
    },
};
use hash_graph_temporal_versioning::TemporalBound;
use hash_graph_test_data::{data_type, property_type};
use type_system::{
    ontology::{
        property_type::PropertyType,
        provenance::{OntologyOwnership, ProvidedOntologyEditionProvenance},
    },
    principal::{actor::ActorType, actor_group::WebId},
    provenance::{OriginProvenance, OriginType},
};

use crate::DatabaseTestWrapper;

#[tokio::test]
async fn insert() {
    let age_pt: PropertyType =
        serde_json::from_str(property_type::AGE_V1).expect("could not parse property type");

    let mut database = DatabaseTestWrapper::new().await;
    let mut api = database
        .seed([data_type::VALUE_V1, data_type::NUMBER_V1], [], [])
        .await
        .expect("could not seed database");

    api.create_property_type(
        api.account_id,
        CreatePropertyTypeParams {
            schema: age_pt,
            ownership: OntologyOwnership::Local {
                web_id: WebId::new(api.account_id),
            },
            conflict_behavior: ConflictBehavior::Fail,
            provenance: ProvidedOntologyEditionProvenance {
                actor_type: ActorType::User,
                origin: OriginProvenance::from_empty_type(OriginType::Api),
                sources: Vec::new(),
            },
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
        .seed([data_type::VALUE_V1, data_type::TEXT_V1], [], [])
        .await
        .expect("could not seed database");

    api.create_property_type(
        api.account_id,
        CreatePropertyTypeParams {
            schema: favorite_quote_pt.clone(),
            ownership: OntologyOwnership::Local {
                web_id: WebId::new(api.account_id),
            },
            conflict_behavior: ConflictBehavior::Fail,
            provenance: ProvidedOntologyEditionProvenance {
                actor_type: ActorType::User,
                origin: OriginProvenance::from_empty_type(OriginType::Api),
                sources: Vec::new(),
            },
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
        .seed(
            [
                data_type::VALUE_V1,
                data_type::TEXT_V1,
                data_type::NUMBER_V1,
            ],
            [],
            [],
        )
        .await
        .expect("could not seed database");

    api.create_property_type(
        api.account_id,
        CreatePropertyTypeParams {
            schema: user_id_pt_v1.clone(),
            ownership: OntologyOwnership::Local {
                web_id: WebId::new(api.account_id),
            },
            conflict_behavior: ConflictBehavior::Fail,
            provenance: ProvidedOntologyEditionProvenance {
                actor_type: ActorType::User,
                origin: OriginProvenance::from_empty_type(OriginType::Api),
                sources: Vec::new(),
            },
        },
    )
    .await
    .expect("could not create property type");

    api.update_property_type(
        api.account_id,
        UpdatePropertyTypesParams {
            schema: user_id_pt_v2.clone(),
            provenance: ProvidedOntologyEditionProvenance {
                actor_type: ActorType::User,
                origin: OriginProvenance::from_empty_type(OriginType::Api),
                sources: Vec::new(),
            },
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
