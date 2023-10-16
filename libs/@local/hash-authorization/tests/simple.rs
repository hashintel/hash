#![feature(associated_type_bounds)]
#![allow(clippy::too_many_lines)]

mod api;
mod schema;

use std::error::Error;

use authorization::{
    backend::ZanzibarBackend,
    schema::{EntityPermission, EntityRelation},
    zanzibar::Consistency,
};

use crate::schema::{ALICE, BOB, ENTITY_A, ENTITY_B};

#[tokio::test]
async fn test_schema() -> Result<(), Box<dyn Error>> {
    let mut api = api::TestApi::connect();

    api.import_schema(include_str!("../schemas/v1__initial_schema.zed"))
        .await?;

    let mut schema = api.export_schema().await?.schema;
    let mut imported_schema = include_str!("../schemas/v1__initial_schema.zed").to_owned();

    // Remove whitespace from schemas, they are not preserved
    schema.retain(|c| !c.is_whitespace());
    imported_schema.retain(|c| !c.is_whitespace());

    assert_eq!(schema, imported_schema);

    Ok(())
}

#[tokio::test]
async fn plain_permissions() -> Result<(), Box<dyn Error>> {
    let mut api = api::TestApi::connect();

    api.import_schema(include_str!("../schemas/v1__initial_schema.zed"))
        .await?;

    let token = api
        .touch_relations([
            (ENTITY_A, EntityRelation::DirectOwner, ALICE),
            (ENTITY_A, EntityRelation::DirectViewer, BOB),
            (ENTITY_B, EntityRelation::DirectOwner, BOB),
        ])
        .await?
        .written_at;

    // Test relations
    assert!(
        api.check(
            &(ENTITY_A, EntityRelation::DirectOwner, ALICE),
            Consistency::AtLeastAsFresh(&token)
        )
        .await?
        .has_permission
    );
    assert!(
        api.check(
            &(ENTITY_A, EntityRelation::DirectViewer, BOB),
            Consistency::AtLeastAsFresh(&token)
        )
        .await?
        .has_permission
    );
    assert!(
        api.check(
            &(ENTITY_B, EntityRelation::DirectOwner, BOB),
            Consistency::AtLeastAsFresh(&token)
        )
        .await?
        .has_permission
    );

    // Test permissions
    assert!(
        api.check(
            &(ENTITY_A, EntityPermission::View, ALICE),
            Consistency::AtLeastAsFresh(&token)
        )
        .await?
        .has_permission
    );
    assert!(
        !api.check(
            &(ENTITY_B, EntityPermission::View, ALICE),
            Consistency::AtLeastAsFresh(&token)
        )
        .await?
        .has_permission
    );
    assert!(
        api.check(
            &(ENTITY_A, EntityPermission::View, BOB),
            Consistency::AtLeastAsFresh(&token)
        )
        .await?
        .has_permission
    );
    assert!(
        api.check(
            &(ENTITY_B, EntityPermission::View, BOB),
            Consistency::AtLeastAsFresh(&token)
        )
        .await?
        .has_permission
    );
    assert!(
        api.check(
            &(ENTITY_A, EntityPermission::Update, ALICE),
            Consistency::AtLeastAsFresh(&token)
        )
        .await?
        .has_permission
    );
    assert!(
        !api.check(
            &(ENTITY_B, EntityPermission::Update, ALICE),
            Consistency::AtLeastAsFresh(&token)
        )
        .await?
        .has_permission
    );
    assert!(
        !api.check(
            &(ENTITY_A, EntityPermission::Update, BOB),
            Consistency::AtLeastAsFresh(&token)
        )
        .await?
        .has_permission
    );
    assert!(
        api.check(
            &(ENTITY_B, EntityPermission::Update, BOB),
            Consistency::AtLeastAsFresh(&token)
        )
        .await?
        .has_permission
    );

    let token = api
        .delete_relations([(ENTITY_A, EntityRelation::DirectViewer, BOB)])
        .await?
        .deleted_at;

    assert!(
        !api.check(
            &(ENTITY_A, EntityPermission::View, BOB),
            Consistency::AtLeastAsFresh(&token)
        )
        .await?
        .has_permission
    );

    Ok(())
}
