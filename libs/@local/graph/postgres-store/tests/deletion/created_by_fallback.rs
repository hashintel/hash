//! Verifies `created_by_id` reads for both populated and NULL columns.
//!
//! Binaries predating the `created_by_id` columns keep inserting rows without them during the
//! rollout window, so filters and summaries fall back to the provenance JSONB for those rows.
//! The tests simulate rollout-window rows by `NULL`-ing the columns via raw SQL after creation.

use hash_graph_postgres_store::store::AsClient as _;
use hash_graph_store::{
    entity::{
        EntityQueryPath, EntityStore as _, SummarizeEntitiesParams, SummarizeEntitiesResponse,
    },
    filter::{Filter, FilterExpression, Parameter},
    subgraph::temporal_axes::QueryTemporalAxesUnresolved,
};
use type_system::{knowledge::Entity, principal::actor::ActorEntityUuid};

use crate::{
    DatabaseApi, DatabaseTestWrapper, alice, bob, create_person, create_second_user, seed,
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

async fn null_out_created_by_columns(api: &DatabaseApi<'_>) {
    for statement in [
        "UPDATE entity_ids SET created_by_id = NULL",
        "UPDATE entity_editions SET created_by_id = NULL",
    ] {
        api.store
            .as_client()
            .execute(statement, &[])
            .await
            .expect("could not null out created_by_id");
    }
}

/// Freshly created entities populate the columns, and reads use them directly.
#[tokio::test]
async fn created_by_reads_use_columns() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;
    create_person(&mut api, alice(), false).await;
    create_person(&mut api, bob(), false).await;

    let column_mismatches: i64 = api
        .store
        .as_client()
        .query_one(
            "SELECT
                (SELECT COUNT(*) FROM entity_ids
                    WHERE created_by_id IS DISTINCT FROM (provenance ->> 'createdById')::uuid
                       OR created_at_transaction_time
                              IS DISTINCT FROM (provenance ->> \
             'createdAtTransactionTime')::timestamptz
                       OR created_at_decision_time
                              IS DISTINCT FROM (provenance ->> \
             'createdAtDecisionTime')::timestamptz)
              + (SELECT COUNT(*) FROM entity_editions
                    WHERE created_by_id IS DISTINCT FROM (provenance ->> 'createdById')::uuid)",
            &[],
        )
        .await
        .expect("could not compare denormalized columns against provenance")
        .get(0);
    assert_eq!(column_mismatches, 0);

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

/// Rows with NULL columns (written by a pre-column binary) are still found via the
/// provenance JSONB fallback, and other actors don't gain matches through it.
#[tokio::test]
async fn created_by_reads_fall_back_to_provenance() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;
    create_person(&mut api, alice(), false).await;
    create_person(&mut api, bob(), false).await;

    null_out_created_by_columns(&api).await;

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

    let other_user = create_second_user(&mut api).await;
    let summary = summarize_created_by(&api, created_by_filter(other_user)).await;
    assert_eq!(summary.count, Some(0));
}
