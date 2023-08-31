#![feature(async_fn_in_trait, associated_type_bounds)]

mod api;
mod schema;

use std::error::Error;

use authorization::{backend::AuthorizationApi, zanzibar::Consistency};

use crate::schema::{EntityPermission, EntityRelation, ALICE, BOB, ENTITY_A};

#[tokio::test]
async fn plain_permissions() -> Result<(), Box<dyn Error>> {
    let mut api = api::TestApi::connect();

    api.import_schema(include_str!("schemas/simple.zed"))
        .await?;

    api.create_relation(&ENTITY_A, &EntityRelation::Writer, &ALICE)
        .await?;
    api.create_relation(&ENTITY_A, &EntityRelation::Reader, &BOB)
        .await?;

    assert!(
        api.check(
            &ENTITY_A,
            &EntityRelation::Writer,
            &ALICE,
            Consistency::FullyConsistent
        )
        .await?
        .has_permission
    );

    assert!(
        api.check(
            &ENTITY_A,
            &EntityPermission::Edit,
            &ALICE,
            Consistency::FullyConsistent
        )
        .await?
        .has_permission
    );

    assert!(
        api.check(
            &ENTITY_A,
            &EntityPermission::View,
            &ALICE,
            Consistency::FullyConsistent
        )
        .await?
        .has_permission
    );

    assert!(
        !api.check(
            &ENTITY_A,
            &EntityPermission::Edit,
            &BOB,
            Consistency::FullyConsistent
        )
        .await?
        .has_permission
    );

    assert!(
        api.check(
            &ENTITY_A,
            &EntityPermission::View,
            &BOB,
            Consistency::FullyConsistent
        )
        .await?
        .has_permission
    );

    let token = api
        .delete_relation(&ENTITY_A, &EntityRelation::Reader, &BOB)
        .await?
        .deleted_at;

    assert!(
        !api.check(
            &ENTITY_A,
            &EntityPermission::View,
            &BOB,
            Consistency::AtLeastAsFresh(token)
        )
        .await?
        .has_permission
    );

    Ok(())
}
