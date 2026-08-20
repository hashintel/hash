//! Exercises [`EntityStore::search_entities`] against an externally seeded database.
//!
//! The suite is ignored by default: it requires a database holding real entities, embeddings,
//! and policies, and measures rather than asserts behaviour that depends on that data.
#![expect(
    unreachable_pub,
    reason = "the shared test harness exports more than this suite consumes"
)]

#[path = "../common/mod.rs"]
mod common;

use hash_graph_postgres_store::store::AsClient as _;
use hash_graph_store::{
    entity::{EntityStore as _, SearchEntitiesFilter, SearchEntitiesParams},
    filter::SemanticDistance,
};
use hash_graph_types::Embedding;
use type_system::principal::actor::{ActorId, UserId};
use uuid::Uuid;

use self::common::DatabaseTestWrapper;

#[tokio::test]
#[ignore = "requires a seeded database with embeddings and policies"]
async fn search_with_real_policies() {
    let mut database = DatabaseTestWrapper::new().await;

    let actor_rows = database
        .connection
        .as_client()
        .query("SELECT id FROM user_actor LIMIT 2", &[])
        .await
        .expect("the seeded database should hold user actors");
    let embedding = database
        .connection
        .as_client()
        .query_one(
            "SELECT embedding FROM entity_embeddings
              WHERE property IS NULL
              LIMIT 1",
            &[],
        )
        .await
        .expect("the seeded database should hold embeddings")
        .get::<_, Embedding>(0)
        .into_owned();

    // The compose container caps shared memory below what a parallel plan requests.
    database
        .connection
        .as_client()
        .execute("SET max_parallel_workers_per_gather = 0", &[])
        .await
        .expect("disabling parallel workers should succeed");

    for actor_row in actor_rows {
        // The rows come from `user_actor`, so the type is known without a lookup.
        let actor_id = ActorId::User(UserId::new(actor_row.get::<_, Uuid>(0)));

        for run in ["cold", "warm"] {
            let started = std::time::Instant::now();
            let response = database
                .connection
                .search_entities(
                    actor_id,
                    SearchEntitiesParams {
                        embedding: embedding.to_owned(),
                        maximum_semantic_distance: SemanticDistance::try_from(2.0)
                            .expect("2.0 should be a valid cosine distance"),
                        limit: 100,
                        include_entity_types: false,
                        filter: SearchEntitiesFilter::default(),
                    },
                )
                .await
                .expect("the search should succeed");

            println!(
                "actor {actor_id}: {run} search returned {count} entities in {elapsed:?}",
                count = response.entities.len(),
                elapsed = started.elapsed(),
            );
        }
    }
}
