use graph::ontology::OntologyTypeWithMetadata;
use graph_test_data::{data_type, entity_type, property_type};
use type_system::{repr, EntityType};

use crate::DatabaseTestWrapper;

#[tokio::test]
async fn insert() {
    let person_et_repr: repr::EntityType = serde_json::from_str(entity_type::PERSON_V1)
        .expect("could not parse entity type representation");
    let person_et = EntityType::try_from(person_et_repr).expect("could not parse entity type");

    let mut database = DatabaseTestWrapper::new().await;
    let mut api = database
        .seed([data_type::TEXT_V1], [property_type::NAME_V1], [
            entity_type::LINK_V1,
            entity_type::link::FRIEND_OF_V1,
        ])
        .await
        .expect("could not seed database");

    api.create_entity_type(person_et)
        .await
        .expect("could not create entity type");
}

#[tokio::test]
async fn query() {
    let organization_et_repr: repr::EntityType = serde_json::from_str(entity_type::ORGANIZATION_V1)
        .expect("could not parse entity type representation");
    let organization_et =
        EntityType::try_from(organization_et_repr).expect("could not parse entity type");

    let mut database = DatabaseTestWrapper::new().await;
    let mut api = database
        .seed([data_type::TEXT_V1], [property_type::NAME_V1], [])
        .await
        .expect("could not seed database");

    api.create_entity_type(organization_et.clone())
        .await
        .expect("could not create entity type");

    let entity_type = api
        .get_entity_type(organization_et.id())
        .await
        .expect("could not get entity type");

    assert_eq!(entity_type.inner(), &organization_et);
}

#[tokio::test]
async fn update() {
    let page_et_v1_repr: repr::EntityType = serde_json::from_str(entity_type::PAGE_V1)
        .expect("could not parse entity type representation");
    let page_et_v1 = EntityType::try_from(page_et_v1_repr).expect("could not parse entity type");

    let page_et_v2_repr: repr::EntityType = serde_json::from_str(entity_type::PAGE_V2)
        .expect("could not parse entity type representation");
    let page_et_v2 = EntityType::try_from(page_et_v2_repr).expect("could not parse entity type");

    let mut database = DatabaseTestWrapper::new().await;
    let mut api = database
        .seed(
            [data_type::TEXT_V1],
            [property_type::TEXT_V1, property_type::NAME_V1],
            [
                entity_type::LINK_V1,
                entity_type::link::WRITTEN_BY_V1,
                entity_type::link::CONTAINS_V1,
                entity_type::link::FRIEND_OF_V1,
                entity_type::PERSON_V1,
                entity_type::BLOCK_V1,
            ],
        )
        .await
        .expect("could not seed database:");

    api.create_entity_type(page_et_v1.clone())
        .await
        .expect("could not create entity type");

    api.update_entity_type(page_et_v2.clone())
        .await
        .expect("could not update entity type");

    let returned_page_et_v1 = api
        .get_entity_type(page_et_v1.id())
        .await
        .expect("could not get entity type");

    // TODO: we probably want to be testing more interesting queries, checking an update should
    //  probably use getLatestVersion
    //  https://app.asana.com/0/0/1202884883200974/f
    let returned_page_et_v2 = api
        .get_entity_type(page_et_v2.id())
        .await
        .expect("could not get entity type");

    assert_eq!(&page_et_v1, returned_page_et_v1.inner());
    assert_eq!(&page_et_v2, returned_page_et_v2.inner());
}
