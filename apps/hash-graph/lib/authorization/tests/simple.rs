#![feature(async_fn_in_trait, associated_type_bounds)]
#![allow(clippy::too_many_lines)]

mod api;
mod schema;

use std::error::Error;

use authorization::{
    backend::{AuthorizationApi, Precondition, RelationFilter},
    zanzibar::Consistency,
};

use crate::schema::{
    EntityPermission, EntityRelation, ALICE, BOB, CHARLIE, ENTITY_A, ENTITY_B, ENTITY_C,
};

#[tokio::test]
async fn test_schema() -> Result<(), Box<dyn Error>> {
    let mut api = api::TestApi::connect();

    api.import_schema(include_str!("schemas/simple.zed"))
        .await?;

    let mut schema = api.export_schema().await?.schema;
    let mut imported_schema = include_str!("schemas/simple.zed").to_owned();

    // Remove whitespace from schemas, they are not preserved
    schema.retain(|c| !c.is_whitespace());
    imported_schema.retain(|c| !c.is_whitespace());

    assert_eq!(schema, imported_schema);

    Ok(())
}

#[tokio::test]
async fn plain_permissions() -> Result<(), Box<dyn Error>> {
    let mut api = api::TestApi::connect();

    api.import_schema(include_str!("schemas/simple.zed"))
        .await?;

    let token = api
        .create_relations(
            [
                &(ENTITY_A, EntityRelation::Writer, ALICE),
                &(ENTITY_A, EntityRelation::Reader, BOB),
                &(ENTITY_B, EntityRelation::Reader, ALICE),
            ],
            [],
        )
        .await?
        .written_at;

    // Test relations
    assert!(
        api.check(
            &(ENTITY_A, EntityRelation::Writer, ALICE),
            Consistency::AtLeastAsFresh(&token)
        )
        .await?
        .has_permission
    );
    assert!(
        api.check(
            &(ENTITY_A, EntityRelation::Reader, BOB),
            Consistency::AtLeastAsFresh(&token)
        )
        .await?
        .has_permission
    );
    assert!(
        api.check(
            &(ENTITY_B, EntityRelation::Reader, ALICE),
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
        api.check(
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
        !api.check(
            &(ENTITY_B, EntityPermission::View, BOB),
            Consistency::AtLeastAsFresh(&token)
        )
        .await?
        .has_permission
    );
    assert!(
        api.check(
            &(ENTITY_A, EntityPermission::Edit, ALICE),
            Consistency::AtLeastAsFresh(&token)
        )
        .await?
        .has_permission
    );
    assert!(
        !api.check(
            &(ENTITY_B, EntityPermission::Edit, ALICE),
            Consistency::AtLeastAsFresh(&token)
        )
        .await?
        .has_permission
    );
    assert!(
        !api.check(
            &(ENTITY_A, EntityPermission::Edit, BOB),
            Consistency::AtLeastAsFresh(&token)
        )
        .await?
        .has_permission
    );
    assert!(
        !api.check(
            &(ENTITY_B, EntityPermission::Edit, BOB),
            Consistency::AtLeastAsFresh(&token)
        )
        .await?
        .has_permission
    );

    let token = api
        .delete_relations([&(ENTITY_A, EntityRelation::Reader, BOB)], [])
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

#[tokio::test]
async fn test_preconditions() -> Result<(), Box<dyn Error>> {
    let mut api = api::TestApi::connect();

    api.import_schema(include_str!("schemas/simple.zed"))
        .await?;

    let _ = api
        .create_relations(
            [
                &(ENTITY_C, EntityRelation::Reader, ALICE),
                &(ENTITY_C, EntityRelation::Reader, BOB),
            ],
            [Precondition::must_match(
                RelationFilter::for_resource(&ENTITY_C)
                    .by_relation(&EntityRelation::Writer)
                    .with_subject(&CHARLIE),
            )],
        )
        .await
        .expect_err("precondition should not be met");

    let token = api
        .create_relations([&(ENTITY_C, EntityRelation::Writer, CHARLIE)], [])
        .await?
        .written_at;

    assert!(
        !api.check(
            &(ENTITY_C, EntityRelation::Reader, ALICE),
            Consistency::AtLeastAsFresh(&token)
        )
        .await?
        .has_permission
    );
    assert!(
        !api.check(
            &(ENTITY_C, EntityRelation::Reader, BOB),
            Consistency::AtLeastAsFresh(&token)
        )
        .await?
        .has_permission
    );

    let token = api
        .create_relations(
            [
                &(ENTITY_C, EntityRelation::Reader, ALICE),
                &(ENTITY_C, EntityRelation::Reader, BOB),
            ],
            [Precondition::must_match(
                RelationFilter::for_resource(&ENTITY_C)
                    .by_relation(&EntityRelation::Writer)
                    .with_subject(&CHARLIE),
            )],
        )
        .await?
        .written_at;

    assert!(
        api.check(
            &(ENTITY_C, EntityRelation::Reader, ALICE),
            Consistency::AtLeastAsFresh(&token)
        )
        .await?
        .has_permission
    );
    assert!(
        api.check(
            &(ENTITY_C, EntityRelation::Reader, BOB),
            Consistency::AtLeastAsFresh(&token)
        )
        .await?
        .has_permission
    );

    let _ = api
        .delete_relations_by_filter(
            RelationFilter::for_resource(&ENTITY_C).by_relation(&EntityRelation::Reader),
            [Precondition::must_not_match(
                RelationFilter::for_resource(&ENTITY_C)
                    .by_relation(&EntityRelation::Writer)
                    .with_subject(&CHARLIE),
            )],
        )
        .await
        .expect_err("precondition should not be met");

    let token = api
        .delete_relations_by_filter(
            RelationFilter::for_resource(&ENTITY_C).by_relation(&EntityRelation::Reader),
            [Precondition::must_match(
                RelationFilter::for_resource(&ENTITY_C)
                    .by_relation(&EntityRelation::Writer)
                    .with_subject(&CHARLIE),
            )],
        )
        .await?
        .deleted_at;

    assert!(
        !api.check(
            &(ENTITY_C, EntityRelation::Reader, ALICE),
            Consistency::AtLeastAsFresh(&token)
        )
        .await?
        .has_permission
    );
    assert!(
        !api.check(
            &(ENTITY_C, EntityRelation::Reader, BOB),
            Consistency::AtLeastAsFresh(&token)
        )
        .await?
        .has_permission
    );

    Ok(())
}
