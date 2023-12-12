#![feature(associated_type_bounds)]
#![allow(clippy::too_many_lines)]

mod api;
mod schema;

use std::error::Error;

use authorization::{
    backend::ZanzibarBackend,
    schema::{
        EntityEditorSubject, EntityPermission, EntityRelationAndSubject, EntityViewerSubject,
    },
    zanzibar::Consistency,
};

use crate::schema::{ALICE, BOB, ENTITY_A, ENTITY_B};

#[tokio::test]
async fn test_schema() -> Result<(), Box<dyn Error>> {
    let mut api = api::connect();

    api.import_schema(include_str!("../schemas/v1__initial_schema.zed"))
        .await?;

    api.export_schema().await?;

    Ok(())
}

#[tokio::test]
async fn plain_permissions() -> Result<(), Box<dyn Error>> {
    let mut api = api::connect();

    api.import_schema(include_str!("../schemas/v1__initial_schema.zed"))
        .await?;

    let token = api
        .touch_relationships([
            (
                ENTITY_A,
                EntityRelationAndSubject::Editor {
                    subject: EntityEditorSubject::Account { id: ALICE },
                    level: 0,
                },
            ),
            (
                ENTITY_A,
                EntityRelationAndSubject::Viewer {
                    subject: EntityViewerSubject::Account { id: BOB },
                    level: 0,
                },
            ),
            (
                ENTITY_B,
                EntityRelationAndSubject::Editor {
                    subject: EntityEditorSubject::Account { id: BOB },
                    level: 0,
                },
            ),
        ])
        .await?
        .written_at;

    // Test permissions
    assert!(
        api.check_permission(
            &ENTITY_A,
            &EntityPermission::View,
            &ALICE,
            Consistency::AtLeastAsFresh(&token)
        )
        .await?
        .has_permission
    );
    assert!(
        !api.check_permission(
            &ENTITY_B,
            &EntityPermission::View,
            &ALICE,
            Consistency::AtLeastAsFresh(&token)
        )
        .await?
        .has_permission
    );
    assert!(
        api.check_permission(
            &ENTITY_A,
            &EntityPermission::View,
            &BOB,
            Consistency::AtLeastAsFresh(&token)
        )
        .await?
        .has_permission
    );
    assert!(
        api.check_permission(
            &ENTITY_B,
            &EntityPermission::View,
            &BOB,
            Consistency::AtLeastAsFresh(&token)
        )
        .await?
        .has_permission
    );
    assert!(
        api.check_permission(
            &ENTITY_A,
            &EntityPermission::Update,
            &ALICE,
            Consistency::AtLeastAsFresh(&token)
        )
        .await?
        .has_permission
    );
    assert!(
        !api.check_permission(
            &ENTITY_B,
            &EntityPermission::Update,
            &ALICE,
            Consistency::AtLeastAsFresh(&token)
        )
        .await?
        .has_permission
    );
    assert!(
        !api.check_permission(
            &ENTITY_A,
            &EntityPermission::Update,
            &BOB,
            Consistency::AtLeastAsFresh(&token)
        )
        .await?
        .has_permission
    );
    assert!(
        api.check_permission(
            &ENTITY_B,
            &EntityPermission::Update,
            &BOB,
            Consistency::AtLeastAsFresh(&token)
        )
        .await?
        .has_permission
    );

    let token = api
        .delete_relationships([(
            ENTITY_A,
            EntityRelationAndSubject::Viewer {
                subject: EntityViewerSubject::Account { id: BOB },
                level: 0,
            },
        )])
        .await?
        .written_at;

    assert!(
        !api.check_permission(
            &ENTITY_A,
            &EntityPermission::View,
            &BOB,
            Consistency::AtLeastAsFresh(&token)
        )
        .await?
        .has_permission
    );

    Ok(())
}
