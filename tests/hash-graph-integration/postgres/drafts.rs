use std::collections::HashSet;

use authorization::AuthorizationApi;
use graph::store::{
    knowledge::{CreateEntityParams, PatchEntityParams},
    EntityStore,
};
use graph_test_data::{data_type, entity, entity_type, property_type};
use graph_types::{
    knowledge::{
        entity::{EntityId, ProvidedEntityEditionProvenance},
        Property, PropertyObject, PropertyPatchOperation, PropertyPath, PropertyWithMetadata,
        PropertyWithMetadataObject,
    },
    owned_by_id::OwnedById,
};
use pretty_assertions::assert_eq;
use temporal_versioning::ClosedTemporalBound;
use type_system::url::{BaseUrl, OntologyTypeVersion, VersionedUrl};

use crate::{DatabaseApi, DatabaseTestWrapper};

async fn seed<A: AuthorizationApi>(
    database: &mut DatabaseTestWrapper<A>,
) -> DatabaseApi<'_, &mut A> {
    database
        .seed(
            [data_type::TEXT_V1, data_type::NUMBER_V1],
            [
                property_type::NAME_V1,
                property_type::AGE_V1,
                property_type::TEXT_V1,
                property_type::FAVORITE_SONG_V1,
                property_type::FAVORITE_FILM_V1,
                property_type::HOBBY_V1,
                property_type::INTERESTS_V1,
            ],
            [
                entity_type::PERSON_V1,
                entity_type::PAGE_V1,
                entity_type::LINK_V1,
                entity_type::link::FRIEND_OF_V1,
                entity_type::link::ACQUAINTANCE_OF_V1,
            ],
        )
        .await
        .expect("could not seed database")
}

fn person_entity_type_id() -> VersionedUrl {
    VersionedUrl {
        base_url: BaseUrl::new(
            "https://blockprotocol.org/@alice/types/entity-type/person/".to_owned(),
        )
        .expect("couldn't construct Base URL"),
        version: OntologyTypeVersion::new(1),
    }
}

fn alice() -> PropertyObject {
    serde_json::from_str(entity::PERSON_ALICE_V1).expect("could not parse entity")
}

fn bob() -> PropertyObject {
    serde_json::from_str(entity::PERSON_BOB_V1).expect("could not parse entity")
}

fn charles() -> PropertyObject {
    serde_json::from_str(entity::PERSON_CHARLES_V1).expect("could not parse entity")
}

#[must_use]
async fn check_entity_exists<A: AuthorizationApi>(api: &DatabaseApi<'_, A>, id: EntityId) -> bool {
    api.get_entity_by_id(api.account_id, id, None, None)
        .await
        .is_ok()
}

#[tokio::test]
#[expect(clippy::too_many_lines)]
async fn initial_draft() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity = api
        .create_entity(
            api.account_id,
            CreateEntityParams {
                owned_by_id: OwnedById::new(api.account_id.into_uuid()),
                entity_uuid: None,
                decision_time: None,
                entity_type_ids: HashSet::from([person_entity_type_id()]),
                properties: PropertyWithMetadataObject::from_parts(alice(), None)
                    .expect("could not create property with metadata object"),
                confidence: None,
                link_data: None,
                draft: true,
                relationships: [],
                provenance: ProvidedEntityEditionProvenance::default(),
            },
        )
        .await
        .expect("could not create entity");
    assert!(entity.metadata.record_id.entity_id.draft_id.is_some());
    assert!(check_entity_exists(&api, entity.metadata.record_id.entity_id).await);
    assert!(entity.metadata.record_id.entity_id.draft_id.is_some());
    assert!(
        entity
            .metadata
            .provenance
            .inferred
            .first_non_draft_created_at_decision_time
            .is_none()
    );
    assert!(
        entity
            .metadata
            .provenance
            .inferred
            .first_non_draft_created_at_transaction_time
            .is_none()
    );

    let updated_entity = api
        .patch_entity(
            api.account_id,
            PatchEntityParams {
                entity_id: entity.metadata.record_id.entity_id,
                properties: vec![PropertyPatchOperation::Replace {
                    path: PropertyPath::default(),
                    property: PropertyWithMetadata::from_parts(Property::Object(bob()), None)
                        .expect("could not create property with metadata"),
                }],
                entity_type_ids: HashSet::new(),
                archived: None,
                draft: Some(true),
                decision_time: None,
                confidence: None,
                provenance: ProvidedEntityEditionProvenance::default(),
            },
        )
        .await
        .expect("could not update entity");

    assert_eq!(
        updated_entity.metadata.record_id.entity_id,
        entity.metadata.record_id.entity_id
    );
    assert!(check_entity_exists(&api, updated_entity.metadata.record_id.entity_id).await);
    assert!(
        updated_entity
            .metadata
            .record_id
            .entity_id
            .draft_id
            .is_some()
    );
    assert!(
        updated_entity
            .metadata
            .provenance
            .inferred
            .first_non_draft_created_at_decision_time
            .is_none()
    );
    assert!(
        updated_entity
            .metadata
            .provenance
            .inferred
            .first_non_draft_created_at_transaction_time
            .is_none()
    );

    let updated_live_entity = api
        .patch_entity(
            api.account_id,
            PatchEntityParams {
                entity_id: updated_entity.metadata.record_id.entity_id,
                properties: vec![PropertyPatchOperation::Replace {
                    path: PropertyPath::default(),
                    property: PropertyWithMetadata::from_parts(Property::Object(charles()), None)
                        .expect("could not create property with metadata"),
                }],
                entity_type_ids: HashSet::new(),
                archived: None,
                draft: Some(false),
                decision_time: None,
                confidence: None,
                provenance: ProvidedEntityEditionProvenance::default(),
            },
        )
        .await
        .expect("could not update entity");

    assert_eq!(
        updated_entity.metadata.record_id.entity_id.owned_by_id,
        updated_live_entity.metadata.record_id.entity_id.owned_by_id
    );
    assert_eq!(
        updated_entity.metadata.record_id.entity_id.entity_uuid,
        updated_live_entity.metadata.record_id.entity_id.entity_uuid
    );
    assert!(
        updated_live_entity
            .metadata
            .record_id
            .entity_id
            .draft_id
            .is_none()
    );

    assert!(!check_entity_exists(&api, updated_entity.metadata.record_id.entity_id).await);
    assert!(check_entity_exists(&api, updated_live_entity.metadata.record_id.entity_id).await);
    assert!(
        updated_live_entity
            .metadata
            .record_id
            .entity_id
            .draft_id
            .is_none()
    );

    let ClosedTemporalBound::Inclusive(undraft_transaction_time) = updated_live_entity
        .metadata
        .temporal_versioning
        .transaction_time
        .start();
    let ClosedTemporalBound::Inclusive(undraft_decision_time) = updated_live_entity
        .metadata
        .temporal_versioning
        .decision_time
        .start();
    assert_eq!(
        updated_live_entity
            .metadata
            .provenance
            .inferred
            .first_non_draft_created_at_transaction_time,
        Some(*undraft_transaction_time)
    );
    assert_eq!(
        updated_live_entity
            .metadata
            .provenance
            .inferred
            .first_non_draft_created_at_decision_time,
        Some(*undraft_decision_time)
    );
}

#[tokio::test]
#[expect(clippy::too_many_lines)]
async fn no_initial_draft() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity = api
        .create_entity(
            api.account_id,
            CreateEntityParams {
                owned_by_id: OwnedById::new(api.account_id.into_uuid()),
                entity_uuid: None,
                decision_time: None,
                entity_type_ids: HashSet::from([person_entity_type_id()]),
                properties: PropertyWithMetadataObject::from_parts(alice(), None)
                    .expect("could not create property with metadata object"),
                confidence: None,
                link_data: None,
                draft: false,
                relationships: [],
                provenance: ProvidedEntityEditionProvenance::default(),
            },
        )
        .await
        .expect("could not create entity");
    assert!(entity.metadata.record_id.entity_id.draft_id.is_none());
    assert!(check_entity_exists(&api, entity.metadata.record_id.entity_id).await);

    let ClosedTemporalBound::Inclusive(undraft_transaction_time) =
        entity.metadata.temporal_versioning.transaction_time.start();
    let ClosedTemporalBound::Inclusive(undraft_decision_time) =
        entity.metadata.temporal_versioning.decision_time.start();
    assert_eq!(
        entity
            .metadata
            .provenance
            .inferred
            .first_non_draft_created_at_transaction_time,
        Some(*undraft_transaction_time)
    );
    assert_eq!(
        entity
            .metadata
            .provenance
            .inferred
            .first_non_draft_created_at_decision_time,
        Some(*undraft_decision_time)
    );

    for _ in 0..5 {
        let updated_entity = api
            .patch_entity(
                api.account_id,
                PatchEntityParams {
                    entity_id: entity.metadata.record_id.entity_id,
                    properties: vec![PropertyPatchOperation::Replace {
                        path: PropertyPath::default(),
                        property: PropertyWithMetadata::from_parts(Property::Object(bob()), None)
                            .expect("could not create property with metadata"),
                    }],
                    entity_type_ids: HashSet::new(),
                    archived: None,
                    draft: Some(true),
                    decision_time: None,
                    confidence: None,
                    provenance: ProvidedEntityEditionProvenance::default(),
                },
            )
            .await
            .expect("could not update entity");

        assert_eq!(
            entity.metadata.record_id.entity_id.owned_by_id,
            updated_entity.metadata.record_id.entity_id.owned_by_id
        );
        assert_eq!(
            entity.metadata.record_id.entity_id.entity_uuid,
            updated_entity.metadata.record_id.entity_id.entity_uuid
        );
        assert!(
            updated_entity
                .metadata
                .record_id
                .entity_id
                .draft_id
                .is_some()
        );
        assert!(check_entity_exists(&api, entity.metadata.record_id.entity_id).await);
        assert!(check_entity_exists(&api, updated_entity.metadata.record_id.entity_id).await);
        assert_eq!(
            updated_entity
                .metadata
                .provenance
                .inferred
                .first_non_draft_created_at_transaction_time,
            Some(*undraft_transaction_time)
        );
        assert_eq!(
            updated_entity
                .metadata
                .provenance
                .inferred
                .first_non_draft_created_at_decision_time,
            Some(*undraft_decision_time)
        );

        let updated_live_entity = api
            .patch_entity(
                api.account_id,
                PatchEntityParams {
                    entity_id: updated_entity.metadata.record_id.entity_id,
                    properties: vec![PropertyPatchOperation::Replace {
                        path: PropertyPath::default(),
                        property: PropertyWithMetadata::from_parts(
                            Property::Object(charles()),
                            None,
                        )
                        .expect("could not create property with metadata"),
                    }],
                    entity_type_ids: HashSet::new(),
                    archived: None,
                    draft: Some(false),
                    decision_time: None,
                    confidence: None,
                    provenance: ProvidedEntityEditionProvenance::default(),
                },
            )
            .await
            .expect("could not update entity");

        assert_eq!(
            entity.metadata.record_id.entity_id,
            updated_live_entity.metadata.record_id.entity_id
        );
        assert!(
            updated_live_entity
                .metadata
                .record_id
                .entity_id
                .draft_id
                .is_none()
        );
        assert!(!check_entity_exists(&api, updated_entity.metadata.record_id.entity_id).await);
        assert!(check_entity_exists(&api, updated_live_entity.metadata.record_id.entity_id).await);
        assert_eq!(
            updated_live_entity
                .metadata
                .provenance
                .inferred
                .first_non_draft_created_at_transaction_time,
            Some(*undraft_transaction_time)
        );
        assert_eq!(
            updated_live_entity
                .metadata
                .provenance
                .inferred
                .first_non_draft_created_at_decision_time,
            Some(*undraft_decision_time)
        );
    }
}

#[tokio::test]
#[expect(clippy::too_many_lines)]
async fn multiple_drafts() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity = api
        .create_entity(
            api.account_id,
            CreateEntityParams {
                owned_by_id: OwnedById::new(api.account_id.into_uuid()),
                entity_uuid: None,
                decision_time: None,
                entity_type_ids: HashSet::from([person_entity_type_id()]),
                properties: PropertyWithMetadataObject::from_parts(alice(), None)
                    .expect("could not create property with metadata object"),
                confidence: None,
                link_data: None,
                draft: false,
                relationships: [],
                provenance: ProvidedEntityEditionProvenance::default(),
            },
        )
        .await
        .expect("could not create entity");
    assert!(entity.metadata.record_id.entity_id.draft_id.is_none());
    assert!(check_entity_exists(&api, entity.metadata.record_id.entity_id).await);
    let ClosedTemporalBound::Inclusive(undraft_transaction_time) =
        entity.metadata.temporal_versioning.transaction_time.start();
    let ClosedTemporalBound::Inclusive(undraft_decision_time) =
        entity.metadata.temporal_versioning.decision_time.start();
    assert_eq!(
        entity
            .metadata
            .provenance
            .inferred
            .first_non_draft_created_at_transaction_time,
        Some(*undraft_transaction_time)
    );
    assert_eq!(
        entity
            .metadata
            .provenance
            .inferred
            .first_non_draft_created_at_decision_time,
        Some(*undraft_decision_time)
    );

    let mut drafts = Vec::new();
    for _ in 0..5 {
        let updated_entity = api
            .patch_entity(
                api.account_id,
                PatchEntityParams {
                    entity_id: entity.metadata.record_id.entity_id,
                    properties: vec![PropertyPatchOperation::Replace {
                        path: PropertyPath::default(),
                        property: PropertyWithMetadata::from_parts(Property::Object(bob()), None)
                            .expect("could not create property with metadata"),
                    }],
                    entity_type_ids: HashSet::new(),
                    archived: None,
                    draft: Some(true),
                    decision_time: None,
                    confidence: None,
                    provenance: ProvidedEntityEditionProvenance::default(),
                },
            )
            .await
            .expect("could not update entity");

        assert_eq!(
            entity.metadata.record_id.entity_id.owned_by_id,
            updated_entity.metadata.record_id.entity_id.owned_by_id
        );
        assert_eq!(
            entity.metadata.record_id.entity_id.entity_uuid,
            updated_entity.metadata.record_id.entity_id.entity_uuid
        );
        assert!(
            updated_entity
                .metadata
                .record_id
                .entity_id
                .draft_id
                .is_some()
        );
        assert!(check_entity_exists(&api, entity.metadata.record_id.entity_id).await);
        assert!(check_entity_exists(&api, updated_entity.metadata.record_id.entity_id).await);
        assert_eq!(
            updated_entity
                .metadata
                .provenance
                .inferred
                .first_non_draft_created_at_transaction_time,
            Some(*undraft_transaction_time)
        );
        assert_eq!(
            updated_entity
                .metadata
                .provenance
                .inferred
                .first_non_draft_created_at_decision_time,
            Some(*undraft_decision_time)
        );
        drafts.push(updated_entity.metadata.record_id.entity_id);
    }

    for draft in drafts {
        let updated_live_entity = api
            .patch_entity(
                api.account_id,
                PatchEntityParams {
                    entity_id: draft,
                    properties: vec![PropertyPatchOperation::Replace {
                        path: PropertyPath::default(),
                        property: PropertyWithMetadata::from_parts(
                            Property::Object(charles()),
                            None,
                        )
                        .expect("could not create property with metadata"),
                    }],
                    entity_type_ids: HashSet::new(),
                    archived: None,
                    draft: Some(false),
                    decision_time: None,
                    confidence: None,
                    provenance: ProvidedEntityEditionProvenance::default(),
                },
            )
            .await
            .expect("could not update entity");

        assert_eq!(
            entity.metadata.record_id.entity_id,
            updated_live_entity.metadata.record_id.entity_id
        );
        assert!(!check_entity_exists(&api, draft).await);
        assert!(check_entity_exists(&api, updated_live_entity.metadata.record_id.entity_id).await);

        assert_eq!(
            updated_live_entity
                .metadata
                .provenance
                .inferred
                .first_non_draft_created_at_transaction_time,
            Some(*undraft_transaction_time)
        );
        assert_eq!(
            updated_live_entity
                .metadata
                .provenance
                .inferred
                .first_non_draft_created_at_decision_time,
            Some(*undraft_decision_time)
        );
    }
}
