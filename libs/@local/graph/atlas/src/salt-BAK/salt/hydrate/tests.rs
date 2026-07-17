use type_system::{
    knowledge::entity::id::{EntityId, EntityUuid},
    principal::actor_group::WebId,
};
use uuid::Uuid;

use super::*;

/// Reproduces the serving hydration path against the local dev store.
///
/// Requires the `hash-postgres` dev container with seeded dev users. The
/// actor and root default to the seeded `alice` account; override with
/// `HASH_ATLAS_TEST_ACTOR` / `HASH_ATLAS_TEST_ENTITY` (`web~entity` form)
/// when the seed differs.
#[tokio::test]
#[ignore = "requires live PostgreSQL with seeded dev data"]
async fn live_hydration_resolves_a_seeded_entity_subgraph() {
    let actor_id = std::env::var("HASH_ATLAS_TEST_ACTOR")
        .ok()
        .map_or_else(
            || Uuid::parse_str("52f68345-cd81-40d0-a13c-ec5a3081f386"),
            |raw| Uuid::parse_str(&raw),
        )
        .expect("actor UUID should parse");
    let root = std::env::var("HASH_ATLAS_TEST_ENTITY").map_or_else(
        |_missing| EntityId {
            web_id: WebId::new(actor_id),
            entity_uuid: EntityUuid::new(actor_id),
            draft_id: None,
        },
        |raw| {
            serde_json::from_value(serde_json::Value::String(raw)).expect("entity ID should parse")
        },
    );

    let hydrator = EntityHydrator::connect(&GraphStoreConfiguration {
        host: std::env::var("HASH_GRAPH_PG_HOST").unwrap_or_else(|_missing| "127.0.0.1".to_owned()),
        port: 5432,
        user: "graph".to_owned(),
        database: "graph".to_owned(),
        password_file: None,
        password: Some(
            std::env::var("HASH_GRAPH_PG_PASSWORD").unwrap_or_else(|_missing| "graph".to_owned()),
        ),
        max_connections: NonZeroUsize::new(1).expect("one is non-zero"),
        actor_id,
    })
    .await
    .expect("hydration pool should connect");

    let subgraph = hydrator
        .entity_subgraph(HydrationRequest {
            roots: vec![root],
            traversal: default_traversal(),
            actor_id: None,
            include_drafts: false,
        })
        .await
        .expect("seeded entity should hydrate");

    let serialized = serde_json::to_value(&subgraph).expect("subgraph should serialize");
    let roots = serialized["roots"]
        .as_array()
        .expect("roots should be an array");
    assert!(
        !roots.is_empty(),
        "the seeded root entity should be visible to its own actor"
    );
    assert!(
        serialized["vertices"]
            .as_object()
            .expect("vertices should be an object")
            .contains_key(&root.to_string()),
        "the root entity should appear among the vertices"
    );
}
