use graph::{
    ontology::OntologyTypeWithMetadata,
    store::{
        error::{OntologyTypeIsNotOwned, OntologyVersionDoesNotExist, VersionedUrlAlreadyExists},
        BaseUrlAlreadyExists,
    },
};
use type_system::{repr, DataType};

use crate::DatabaseTestWrapper;

#[tokio::test]
async fn insert() {
    let data_type_repr: repr::DataType =
        serde_json::from_str(graph_test_data::data_type::BOOLEAN_V1)
            .expect("could not parse data type representation");
    let boolean_dt = DataType::try_from(data_type_repr).expect("could not parse data type");

    let mut database = DatabaseTestWrapper::new().await;
    let mut api = database
        .seed([], [], [])
        .await
        .expect("could not seed database");

    api.create_owned_data_type(boolean_dt)
        .await
        .expect("could not create data type");
}

#[tokio::test]
async fn query() {
    let data_type_repr: repr::DataType =
        serde_json::from_str(graph_test_data::data_type::EMPTY_LIST_V1)
            .expect("could not parse data type representation");
    let empty_list_dt = DataType::try_from(data_type_repr).expect("could not parse data type");

    let mut database = DatabaseTestWrapper::new().await;
    let mut api = database
        .seed([], [], [])
        .await
        .expect("could not seed database");

    api.create_owned_data_type(empty_list_dt.clone())
        .await
        .expect("could not create data type");

    let data_type = api
        .get_data_type(empty_list_dt.id())
        .await
        .expect("could not get data type");

    assert_eq!(data_type.inner(), &empty_list_dt);
}

#[tokio::test]
async fn update() {
    let object_dt_v1_repr: repr::DataType =
        serde_json::from_str(graph_test_data::data_type::OBJECT_V1)
            .expect("could not parse data type representation");
    let object_dt_v1 = DataType::try_from(object_dt_v1_repr).expect("could not parse data type");

    let object_dt_v2_repr: repr::DataType =
        serde_json::from_str(graph_test_data::data_type::OBJECT_V2)
            .expect("could not parse data type representation");
    let object_dt_v2 = DataType::try_from(object_dt_v2_repr).expect("could not parse data type");

    let mut database = DatabaseTestWrapper::new().await;
    let mut api = database
        .seed([], [], [])
        .await
        .expect("could not seed database");

    api.create_owned_data_type(object_dt_v1.clone())
        .await
        .expect("could not create data type");

    api.update_data_type(object_dt_v2.clone())
        .await
        .expect("could not update data type");

    let returned_object_dt_v1 = api
        .get_data_type(object_dt_v1.id())
        .await
        .expect("could not get property type");

    // TODO: we probably want to be testing more interesting queries, checking an update should
    //  probably use getLatestVersion
    //  https://app.asana.com/0/0/1202884883200974/f
    let returned_object_dt_v2 = api
        .get_data_type(object_dt_v2.id())
        .await
        .expect("could not get property type");

    assert_eq!(&object_dt_v1, returned_object_dt_v1.inner());
    assert_eq!(&object_dt_v2, returned_object_dt_v2.inner());
}

#[tokio::test]
async fn insert_same_base_url() {
    let object_dt_v1_repr: repr::DataType =
        serde_json::from_str(graph_test_data::data_type::OBJECT_V1)
            .expect("could not parse data type representation");
    let object_dt_v1 = DataType::try_from(object_dt_v1_repr).expect("could not parse data type");

    let object_dt_v2_repr: repr::DataType =
        serde_json::from_str(graph_test_data::data_type::OBJECT_V2)
            .expect("could not parse data type representation");
    let object_dt_v2 = DataType::try_from(object_dt_v2_repr).expect("could not parse data type");

    let mut database = DatabaseTestWrapper::new().await;
    let mut api = database
        .seed([], [], [])
        .await
        .expect("could not seed database");

    api.create_owned_data_type(object_dt_v1.clone())
        .await
        .expect("could not create data type");

    let report = api
        .create_owned_data_type(object_dt_v1.clone())
        .await
        .expect_err("could create data type");
    assert!(
        report.contains::<BaseUrlAlreadyExists>(),
        "wrong error, expected `BaseUrlDoesNotExist`, got {report:?}"
    );

    let report = api
        .create_owned_data_type(object_dt_v2.clone())
        .await
        .expect_err("could create data type");
    assert!(
        report.contains::<BaseUrlAlreadyExists>(),
        "wrong error, expected `BaseUrlDoesNotExist`, got {report:?}"
    );

    let report = api
        .create_external_data_type(object_dt_v1.clone())
        .await
        .expect_err("could create data type");
    assert!(
        report.contains::<BaseUrlAlreadyExists>(),
        "wrong error, expected `BaseUrlDoesNotExist`, got {report:?}"
    );

    let report = api
        .create_external_data_type(object_dt_v2.clone())
        .await
        .expect_err("could create data type");
    assert!(
        report.contains::<BaseUrlAlreadyExists>(),
        "wrong error, expected `BaseUrlDoesNotExist`, got {report:?}"
    );
}

#[tokio::test]
async fn wrong_update_order() {
    let object_dt_v1_repr: repr::DataType =
        serde_json::from_str(graph_test_data::data_type::OBJECT_V1)
            .expect("could not parse data type representation");
    let object_dt_v1 = DataType::try_from(object_dt_v1_repr).expect("could not parse data type");

    let object_dt_v2_repr: repr::DataType =
        serde_json::from_str(graph_test_data::data_type::OBJECT_V2)
            .expect("could not parse data type representation");
    let object_dt_v2 = DataType::try_from(object_dt_v2_repr).expect("could not parse data type");

    let mut database = DatabaseTestWrapper::new().await;
    let mut api = database
        .seed([], [], [])
        .await
        .expect("could not seed database");

    let report = api
        .update_data_type(object_dt_v1.clone())
        .await
        .expect_err("could create data type");
    assert!(
        report.contains::<OntologyVersionDoesNotExist>(),
        "wrong error, expected `BaseUrlDoesNotExist`, got {report:?}"
    );

    api.create_owned_data_type(object_dt_v1.clone())
        .await
        .expect("could not create data type");

    let report = api
        .update_data_type(object_dt_v1.clone())
        .await
        .expect_err("could update data type");
    assert!(
        report.contains::<OntologyVersionDoesNotExist>(),
        "wrong error, expected `OntologyVersionDoesNotExist`, got {report:?}"
    );

    api.update_data_type(object_dt_v2.clone())
        .await
        .expect("could not update data type");

    let report = api
        .update_data_type(object_dt_v2.clone())
        .await
        .expect_err("could update data type");
    assert!(
        report.contains::<VersionedUrlAlreadyExists>(),
        "wrong error, expected `OntologyVersionDoesNotExist`, got {report:?}"
    );
}

#[tokio::test]
async fn update_external_with_owned() {
    let object_dt_v1_repr: repr::DataType =
        serde_json::from_str(graph_test_data::data_type::OBJECT_V1)
            .expect("could not parse data type representation");
    let object_dt_v1 = DataType::try_from(object_dt_v1_repr).expect("could not parse data type");

    let object_dt_v2_repr: repr::DataType =
        serde_json::from_str(graph_test_data::data_type::OBJECT_V2)
            .expect("could not parse data type representation");
    let object_dt_v2 = DataType::try_from(object_dt_v2_repr).expect("could not parse data type");

    let mut database = DatabaseTestWrapper::new().await;
    let mut api = database
        .seed([], [], [])
        .await
        .expect("could not seed database");

    api.create_external_data_type(object_dt_v1.clone())
        .await
        .expect("could not create data type");

    let report = api
        .update_data_type(object_dt_v2.clone())
        .await
        .expect_err("could update data type");
    assert!(
        report.contains::<OntologyTypeIsNotOwned>(),
        "wrong error, expected `OntologyTypeIsNotOwned`, got {report:?}"
    );

    api.create_external_data_type(object_dt_v2.clone())
        .await
        .expect("could not create data type");

    let report = api
        .update_data_type(object_dt_v2.clone())
        .await
        .expect_err("could update data type");
    assert!(
        report.contains::<VersionedUrlAlreadyExists>(),
        "wrong error, expected `VersionedUrlAlreadyExists`, got {report:?}"
    );
}
