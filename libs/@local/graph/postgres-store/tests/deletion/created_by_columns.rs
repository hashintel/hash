//! Verifies the denormalized creator/creation columns are populated on write and drive reads.

use core::str::FromStr as _;
use std::collections::HashSet;

use hash_graph_authorization::policies::{
    Effect, action::ActionName, principal::PrincipalConstraint,
};
use hash_graph_store::{
    entity::{
        CreateEntityParams, CreateEntityPolicyParams, EntityQueryPath, EntityQuerySorting,
        EntityStore as _, PatchEntityParams, QueryEntitiesParams, SummarizeEntitiesParams,
        SummarizeEntitiesResponse,
    },
    filter::{Filter, FilterExpression, Parameter},
    subgraph::temporal_axes::QueryTemporalAxesUnresolved,
};
use hash_graph_temporal_versioning::{
    ClosedTemporalBound, DecisionTime, TemporalTagged as _, Timestamp,
};
use type_system::{
    knowledge::{
        Entity,
        property::{
            Property, PropertyObjectWithMetadata, PropertyPatchOperation, PropertyPath,
            PropertyWithMetadata,
        },
    },
    principal::{
        actor::{ActorEntityUuid, ActorId},
        actor_group::WebId,
    },
};

use crate::{
    DatabaseApi, DatabaseTestWrapper, alice, bob, create_person, create_second_user,
    person_type_id, provenance, seed,
};

fn created_by_filter(actor_id: ActorEntityUuid) -> Filter<'static, Entity> {
    Filter::Equal(
        FilterExpression::Path {
            path: EntityQueryPath::CreatedById,
        },
        FilterExpression::Parameter {
            parameter: Parameter::Uuid(actor_id.into()),
            convert: None,
        },
    )
}

async fn summarize_created_by(
    api: &DatabaseApi<'_>,
    filter: Filter<'static, Entity>,
) -> SummarizeEntitiesResponse {
    api.store
        .summarize_entities(
            api.account_id,
            SummarizeEntitiesParams {
                filter,
                temporal_axes: QueryTemporalAxesUnresolved::all(),
                include_drafts: false,
                include_count: true,
                include_web_ids: false,
                include_created_by_ids: true,
                include_edition_created_by_ids: true,
                include_type_ids: false,
                include_type_titles: false,
            },
        )
        .await
        .expect("could not summarize entities")
}

/// A created entity round-trips its creator/creation provenance through the columns: the read
/// path reassembles the entity and edition provenance from the columns and the JSONB.
#[tokio::test]
async fn created_by_round_trips_through_columns() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;
    let created = create_person(&mut api, alice(), false).await;

    let response = api
        .store
        .query_entities(
            api.account_id,
            QueryEntitiesParams {
                filter: Filter::for_entity_by_entity_id(created.metadata.record_id.entity_id),
                temporal_axes: QueryTemporalAxesUnresolved::all(),
                sorting: EntityQuerySorting {
                    paths: Vec::new(),
                    cursor: None,
                },
                conversions: Vec::new(),
                limit: 10,
                include_drafts: false,
                include_entity_types: None,
                include_permissions: false,
            },
        )
        .await
        .expect("could not query entity");

    let [entity] = response.entities.as_slice() else {
        panic!(
            "expected exactly one entity, got {}",
            response.entities.len()
        );
    };
    let read = &entity.metadata.provenance;
    let original = &created.metadata.provenance;
    assert_eq!(read.created_by_id, api.account_id);
    assert_eq!(
        read.created_at_transaction_time,
        original.created_at_transaction_time
    );
    assert_eq!(
        read.created_at_decision_time,
        original.created_at_decision_time
    );
    assert_eq!(read.edition.created_by_id, api.account_id);
}

/// The entity creator and the edition creator are independent columns.
///
/// Actor A creates the entity with an explicit past decision time and an update policy for
/// actor B, who then patches it. The read path must report A as the entity creator and B as the
/// edition creator, the two creation timestamps must hold distinct values, and entity-level
/// creator filters must not match B.
#[tokio::test]
#[expect(clippy::too_many_lines, reason = "linear test flow")]
async fn creator_columns_discriminate_actors() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let user_b = create_second_user(&mut api).await;
    let actor_b: ActorEntityUuid = user_b.into();

    let decision_time = Timestamp::<DecisionTime>::from_str("2020-01-01T00:00:00Z")
        .expect("timestamp should parse");
    let created = api
        .store
        .create_entity(
            api.account_id,
            CreateEntityParams {
                web_id: WebId::new(api.account_id),
                entity_uuid: None,
                decision_time: Some(decision_time),
                entity_type_ids: HashSet::from([person_type_id()]),
                properties: PropertyObjectWithMetadata::from_parts(alice(), None)
                    .expect("could not create property with metadata object"),
                confidence: None,
                link_data: None,
                draft: false,
                policies: vec![CreateEntityPolicyParams {
                    name: "second-actor-update".to_owned(),
                    effect: Effect::Permit,
                    principal: Some(PrincipalConstraint::Actor {
                        actor: ActorId::User(user_b),
                    }),
                    actions: vec![ActionName::UpdateEntity],
                }],
                provenance: provenance(),
                read_only: false,
            },
        )
        .await
        .expect("could not create entity");
    let entity_id = created.metadata.record_id.entity_id;

    api.store
        .patch_entity(
            actor_b,
            PatchEntityParams {
                entity_id,
                properties: vec![PropertyPatchOperation::Replace {
                    path: PropertyPath::default(),
                    property: PropertyWithMetadata::from_parts(Property::Object(bob()), None)
                        .expect("could not create property with metadata"),
                }],
                entity_type_ids: HashSet::new(),
                archived: None,
                draft: None,
                decision_time: None,
                confidence: None,
                provenance: provenance(),
            },
        )
        .await
        .expect("could not patch entity as second actor");

    let response = api
        .store
        .query_entities(
            api.account_id,
            QueryEntitiesParams {
                filter: Filter::for_entity_by_entity_id(entity_id),
                temporal_axes: QueryTemporalAxesUnresolved::all(),
                sorting: EntityQuerySorting {
                    paths: Vec::new(),
                    cursor: None,
                },
                conversions: Vec::new(),
                limit: 10,
                include_drafts: false,
                include_entity_types: None,
                include_permissions: false,
            },
        )
        .await
        .expect("could not query entity");
    let entity = response
        .entities
        .iter()
        .max_by_key(|entity| {
            let ClosedTemporalBound::Inclusive(start) =
                entity.metadata.temporal_versioning.transaction_time.start();
            *start
        })
        .expect("expected at least one entity revision");

    let read = &entity.metadata.provenance;
    assert_eq!(read.created_by_id, api.account_id);
    assert_eq!(read.edition.created_by_id, actor_b);
    assert_eq!(read.created_at_decision_time, decision_time);
    assert_ne!(
        read.created_at_transaction_time.cast::<DecisionTime>(),
        read.created_at_decision_time
    );

    let summary_b = summarize_created_by(&api, created_by_filter(actor_b)).await;
    assert_eq!(summary_b.count, Some(0));

    // Both revisions are created by the first actor, while each revision keeps its own edition
    // creator.
    let summary_a = summarize_created_by(&api, created_by_filter(api.account_id)).await;
    assert_eq!(summary_a.count, Some(2));
    let created_by_ids = summary_a
        .created_by_ids
        .as_ref()
        .expect("summary should include created-by ids");
    assert_eq!(created_by_ids.get(&api.account_id), Some(&2));
    let edition_created_by_ids = summary_a
        .edition_created_by_ids
        .as_ref()
        .expect("summary should include edition created-by ids");
    assert_eq!(edition_created_by_ids.get(&api.account_id), Some(&1));
    assert_eq!(edition_created_by_ids.get(&actor_b), Some(&1));
}

/// The summary aggregation counts entities by creator through the column read path.
#[tokio::test]
async fn created_by_summaries_use_columns() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;
    create_person(&mut api, alice(), false).await;
    create_person(&mut api, bob(), false).await;

    let summary = summarize_created_by(&api, created_by_filter(api.account_id)).await;
    assert_eq!(summary.count, Some(2));
    assert_eq!(
        summary
            .created_by_ids
            .as_ref()
            .expect("summary should include created-by ids")
            .get(&api.account_id),
        Some(&2)
    );
    assert_eq!(
        summary
            .edition_created_by_ids
            .as_ref()
            .expect("summary should include edition created-by ids")
            .get(&api.account_id),
        Some(&2)
    );
}
