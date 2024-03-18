use graph_test_data::{data_type, entity, entity_type, property_type};
use graph_types::knowledge::entity::{EntityId, EntityProperties};
use pretty_assertions::assert_eq;
use temporal_versioning::ClosedTemporalBound;
use type_system::url::{BaseUrl, OntologyTypeVersion, VersionedUrl};

use crate::{DatabaseApi, DatabaseTestWrapper};

async fn seed(database: &mut DatabaseTestWrapper) -> DatabaseApi<'_> {
    database
        .seed(
            [data_type::TEXT_V1, data_type::NUMBER_V1],
            [
                property_type::NAME_V1,
                property_type::AGE_V1,
                property_type::TEXT_V1,
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

fn alice() -> EntityProperties {
    serde_json::from_str(entity::PERSON_ALICE_V1).expect("could not parse entity")
}
fn bob() -> EntityProperties {
    serde_json::from_str(entity::PERSON_BOB_V1).expect("could not parse entity")
}
fn charles() -> EntityProperties {
    serde_json::from_str(entity::PERSON_CHARLES_V1).expect("could not parse entity")
}

#[must_use]
async fn check_entity_exists(api: &DatabaseApi<'_>, id: EntityId) -> bool {
    api.get_latest_entity(id).await.is_ok()
}

#[tokio::test]
async fn initial_draft() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity = api
        .create_entity(alice(), vec![person_entity_type_id()], None, true)
        .await
        .expect("could not create entity");
    assert!(entity.record_id.entity_id.draft_id.is_some());
    assert!(check_entity_exists(&api, entity.record_id.entity_id).await);
    assert!(
        entity
            .provenance
            .first_non_draft_created_at_decision_time
            .is_none()
    );
    assert!(
        entity
            .provenance
            .first_non_draft_created_at_transaction_time
            .is_none()
    );

    let updated_entity = api
        .update_entity(
            entity.record_id.entity_id,
            bob(),
            vec![person_entity_type_id()],
            true,
        )
        .await
        .expect("could not update entity");

    assert_eq!(
        updated_entity.record_id.entity_id,
        entity.record_id.entity_id
    );
    assert!(check_entity_exists(&api, updated_entity.record_id.entity_id).await);
    assert!(
        updated_entity
            .provenance
            .first_non_draft_created_at_decision_time
            .is_none()
    );
    assert!(
        updated_entity
            .provenance
            .first_non_draft_created_at_transaction_time
            .is_none()
    );

    let updated_live_entity = api
        .update_entity(
            updated_entity.record_id.entity_id,
            charles(),
            vec![person_entity_type_id()],
            false,
        )
        .await
        .expect("could not update entity");

    assert_eq!(
        updated_entity.record_id.entity_id.owned_by_id,
        updated_live_entity.record_id.entity_id.owned_by_id
    );
    assert_eq!(
        updated_entity.record_id.entity_id.entity_uuid,
        updated_live_entity.record_id.entity_id.entity_uuid
    );
    assert!(updated_live_entity.record_id.entity_id.draft_id.is_none());

    assert!(!check_entity_exists(&api, updated_entity.record_id.entity_id).await);
    assert!(check_entity_exists(&api, updated_live_entity.record_id.entity_id).await);

    let ClosedTemporalBound::Inclusive(undraft_transaction_time) = updated_live_entity
        .temporal_versioning
        .transaction_time
        .start();
    let ClosedTemporalBound::Inclusive(undraft_decision_time) = updated_live_entity
        .temporal_versioning
        .decision_time
        .start();
    assert_eq!(
        updated_live_entity
            .provenance
            .first_non_draft_created_at_transaction_time,
        Some(*undraft_transaction_time)
    );
    assert_eq!(
        updated_live_entity
            .provenance
            .first_non_draft_created_at_decision_time,
        Some(*undraft_decision_time)
    );
}

#[tokio::test]
async fn no_initial_draft() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity = api
        .create_entity(alice(), vec![person_entity_type_id()], None, false)
        .await
        .expect("could not create entity");
    assert!(entity.record_id.entity_id.draft_id.is_none());
    assert!(check_entity_exists(&api, entity.record_id.entity_id).await);

    let ClosedTemporalBound::Inclusive(undraft_transaction_time) =
        entity.temporal_versioning.transaction_time.start();
    let ClosedTemporalBound::Inclusive(undraft_decision_time) =
        entity.temporal_versioning.decision_time.start();
    assert_eq!(
        entity
            .provenance
            .first_non_draft_created_at_transaction_time,
        Some(*undraft_transaction_time)
    );
    assert_eq!(
        entity.provenance.first_non_draft_created_at_decision_time,
        Some(*undraft_decision_time)
    );

    for _ in 0..5 {
        let updated_entity = api
            .update_entity(
                entity.record_id.entity_id,
                bob(),
                vec![person_entity_type_id()],
                true,
            )
            .await
            .expect("could not update entity");

        assert_eq!(
            entity.record_id.entity_id.owned_by_id,
            updated_entity.record_id.entity_id.owned_by_id
        );
        assert_eq!(
            entity.record_id.entity_id.entity_uuid,
            updated_entity.record_id.entity_id.entity_uuid
        );
        assert!(updated_entity.record_id.entity_id.draft_id.is_some());
        assert!(check_entity_exists(&api, entity.record_id.entity_id).await);
        assert!(check_entity_exists(&api, updated_entity.record_id.entity_id).await);
        assert_eq!(
            updated_entity
                .provenance
                .first_non_draft_created_at_transaction_time,
            Some(*undraft_transaction_time)
        );
        assert_eq!(
            updated_entity
                .provenance
                .first_non_draft_created_at_decision_time,
            Some(*undraft_decision_time)
        );

        let updated_live_entity = api
            .update_entity(
                updated_entity.record_id.entity_id,
                charles(),
                vec![person_entity_type_id()],
                false,
            )
            .await
            .expect("could not update entity");

        assert_eq!(
            entity.record_id.entity_id,
            updated_live_entity.record_id.entity_id
        );
        assert!(!check_entity_exists(&api, updated_entity.record_id.entity_id).await);
        assert!(check_entity_exists(&api, updated_live_entity.record_id.entity_id).await);
        assert_eq!(
            updated_live_entity
                .provenance
                .first_non_draft_created_at_transaction_time,
            Some(*undraft_transaction_time)
        );
        assert_eq!(
            updated_live_entity
                .provenance
                .first_non_draft_created_at_decision_time,
            Some(*undraft_decision_time)
        );
    }
}

#[tokio::test]
async fn multiple_drafts() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity = api
        .create_entity(alice(), vec![person_entity_type_id()], None, false)
        .await
        .expect("could not create entity");
    assert!(entity.record_id.entity_id.draft_id.is_none());
    assert!(check_entity_exists(&api, entity.record_id.entity_id).await);
    let ClosedTemporalBound::Inclusive(undraft_transaction_time) =
        entity.temporal_versioning.transaction_time.start();
    let ClosedTemporalBound::Inclusive(undraft_decision_time) =
        entity.temporal_versioning.decision_time.start();
    assert_eq!(
        entity
            .provenance
            .first_non_draft_created_at_transaction_time,
        Some(*undraft_transaction_time)
    );
    assert_eq!(
        entity.provenance.first_non_draft_created_at_decision_time,
        Some(*undraft_decision_time)
    );

    let mut drafts = Vec::new();
    for _ in 0..5 {
        let updated_entity = api
            .update_entity(
                entity.record_id.entity_id,
                bob(),
                vec![person_entity_type_id()],
                true,
            )
            .await
            .expect("could not update entity");

        assert_eq!(
            entity.record_id.entity_id.owned_by_id,
            updated_entity.record_id.entity_id.owned_by_id
        );
        assert_eq!(
            entity.record_id.entity_id.entity_uuid,
            updated_entity.record_id.entity_id.entity_uuid
        );
        assert!(updated_entity.record_id.entity_id.draft_id.is_some());
        assert!(check_entity_exists(&api, entity.record_id.entity_id).await);
        assert!(check_entity_exists(&api, updated_entity.record_id.entity_id).await);
        assert_eq!(
            updated_entity
                .provenance
                .first_non_draft_created_at_transaction_time,
            Some(*undraft_transaction_time)
        );
        assert_eq!(
            updated_entity
                .provenance
                .first_non_draft_created_at_decision_time,
            Some(*undraft_decision_time)
        );
        drafts.push(updated_entity.record_id.entity_id);
    }

    for draft in drafts {
        let updated_live_entity = api
            .update_entity(draft, charles(), vec![person_entity_type_id()], false)
            .await
            .expect("could not update entity");

        assert_eq!(
            entity.record_id.entity_id,
            updated_live_entity.record_id.entity_id
        );
        assert!(!check_entity_exists(&api, draft).await);
        assert!(check_entity_exists(&api, updated_live_entity.record_id.entity_id).await);
        assert_eq!(
            updated_live_entity
                .provenance
                .first_non_draft_created_at_transaction_time,
            Some(*undraft_transaction_time)
        );
        assert_eq!(
            updated_live_entity
                .provenance
                .first_non_draft_created_at_decision_time,
            Some(*undraft_decision_time)
        );
    }
}
