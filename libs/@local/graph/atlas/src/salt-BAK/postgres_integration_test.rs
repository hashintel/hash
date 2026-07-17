//! Live PostgreSQL integration coverage for the Atlas sampling and relation
//! lifecycle.
//!
//! These tests connect to the development database configured through the
//! `HASH_GRAPH_PG_*` environment variables (the same contract as the graph
//! integration harness) and require a running PostgreSQL server. They do not
//! require the graph migrations and never touch real graph data: each test
//! session creates *temporary* `entity_embeddings` and `entity_edge` tables
//! that mirror the production DDL. Temporary tables live in the session's
//! `pg_temp` schema, which PostgreSQL resolves ahead of any real table of
//! the same name, and are dropped automatically when the connection closes.

#![expect(
    clippy::print_stderr,
    clippy::float_arithmetic,
    clippy::indexing_slicing,
    reason = "test-only diagnostics and fixture math"
)]

use core::time::Duration;

use camino::Utf8Path;
use futures::TryStreamExt as _;
use hash_graph_atlas::projection::{Sample, SampleOptions};
use hash_graph_embeddings::Dimension;
use tokio_postgres::{Client, NoTls};
use uuid::Uuid;

const EMBEDDING_DIM: u16 = 3072;
/// The MRL truncation the sample uses; `D64` keeps fixture literals small.
fn sample_options() -> SampleOptions {
    SampleOptions {
        dim: Dimension::new(64).expect("64 is a positive multiple of 8"),
        size: 1_000,
    }
}

async fn connect() -> Client {
    let user = std::env::var("HASH_GRAPH_PG_USER").unwrap_or_else(|_| "graph".to_owned());
    let password = std::env::var("HASH_GRAPH_PG_PASSWORD").unwrap_or_else(|_| "graph".to_owned());
    let host = std::env::var("HASH_GRAPH_PG_HOST").unwrap_or_else(|_| "localhost".to_owned());
    let port = std::env::var("HASH_GRAPH_PG_PORT").unwrap_or_else(|_| "5432".to_owned());
    let database = std::env::var("HASH_GRAPH_PG_DATABASE").unwrap_or_else(|_| "graph".to_owned());

    let (client, connection) = tokio_postgres::config::Config::new()
        .user(&user)
        .password(&password)
        .host(&host)
        .port(port.parse().expect("port should be numeric"))
        .dbname(&database)
        .connect_timeout(Duration::from_secs(5))
        .connect(NoTls)
        .await
        .expect("PostgreSQL should be reachable through HASH_GRAPH_PG_* settings");

    tokio::spawn(async move {
        if let Err(error) = connection.await {
            eprintln!("connection error: {error}");
        }
    });
    client
}

/// One seeded entity: an identity plus a deterministic embedding.
#[derive(Debug, Clone, Copy)]
struct Entity {
    web_id: Uuid,
    entity_uuid: Uuid,
}

/// Creates session-local temporary mirrors of the two tables Atlas reads.
///
/// The mirrors reproduce the production columns (including the `vector`
/// type and the edge enums as plain text checks) without the foreign keys
/// into the wider graph schema, which Atlas never traverses.
async fn create_fixture_tables(client: &Client) {
    client
        .batch_execute(&format!(
            "CREATE TEMPORARY TABLE entity_embeddings (
                 web_id UUID NOT NULL,
                 entity_uuid UUID NOT NULL,
                 draft_id UUID,
                 property TEXT,
                 embedding VECTOR({EMBEDDING_DIM}) NOT NULL,
                 updated_at_decision_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                 updated_at_transaction_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
             );
             CREATE TEMPORARY TABLE entity_edge (
                 source_web_id UUID NOT NULL,
                 source_entity_uuid UUID NOT NULL,
                 target_web_id UUID NOT NULL,
                 target_entity_uuid UUID NOT NULL,
                 kind TEXT NOT NULL,
                 direction TEXT NOT NULL
             );"
        ))
        .await
        .expect("temporary fixture tables should create");
}

/// A deterministic unit-norm embedding for entity `index`.
///
/// Every entity leans onto its own axis group, so distinct entities have
/// distinct embeddings and cosine k-NN behaves sensibly if exercised.
fn embedding_literal(index: usize) -> String {
    let mut values = vec![0.01_f32; usize::from(EMBEDDING_DIM)];
    values[index % 64] = 1.0;
    values[(index * 7 + 1) % 64] = 0.5;
    let norm = values.iter().map(|value| value * value).sum::<f32>().sqrt();
    let rendered = values
        .iter()
        .map(|value| format!("{}", value / norm))
        .collect::<Vec<_>>()
        .join(",");
    format!("[{rendered}]")
}

/// Inserts `count` sampleable entities and returns their identities.
async fn seed_entities(client: &Client, count: usize) -> Vec<Entity> {
    let mut entities = Vec::with_capacity(count);
    for index in 0..count {
        let entity = Entity {
            web_id: Uuid::new_v4(),
            entity_uuid: Uuid::new_v4(),
        };
        client
            .execute(
                "INSERT INTO entity_embeddings (web_id, entity_uuid, embedding)
                 VALUES ($1, $2, $3::text::vector)",
                &[
                    &entity.web_id,
                    &entity.entity_uuid,
                    &embedding_literal(index),
                ],
            )
            .await
            .expect("embedding row should insert");
        entities.push(entity);
    }
    entities
}

/// Inserts a link entity connecting `left` and `right`.
async fn seed_link(client: &Client, left: Entity, right: Entity) {
    let link_web = Uuid::new_v4();
    let link_uuid = Uuid::new_v4();
    client
        .execute(
            "INSERT INTO entity_edge
                 (source_web_id, source_entity_uuid, target_web_id, target_entity_uuid,
                  kind, direction)
             VALUES
                 ($1, $2, $3, $4, 'has-left-entity', 'outgoing'),
                 ($1, $2, $5, $6, 'has-right-entity', 'outgoing')",
            &[
                &link_web,
                &link_uuid,
                &left.web_id,
                &left.entity_uuid,
                &right.web_id,
                &right.entity_uuid,
            ],
        )
        .await
        .expect("link edges should insert");
}

/// Collects the streamed adjacency and validates its ordering contract.
async fn collect_adjacency(
    edges: hash_graph_atlas::projection::QueryEdges<'_>,
    rows: usize,
) -> Vec<(u32, u32)> {
    let collected: Vec<(u32, u32)> = edges
        .try_collect()
        .await
        .expect("adjacency stream should succeed");

    let mut previous: Option<(u32, u32)> = None;
    for &(source, target) in &collected {
        assert!(
            (source as usize) < rows && (target as usize) < rows,
            "endpoint ({source}, {target}) outside {rows} sampled rows"
        );
        assert_ne!(source, target, "self-relations must be removed");
        if let Some(previous) = previous {
            assert!(
                previous < (source, target),
                "adjacency must be strictly ordered: {previous:?} then ({source}, {target})"
            );
        }
        previous = Some((source, target));
    }

    // Symmetry: every (a, b) must appear as (b, a) as well.
    for &(source, target) in &collected {
        assert!(
            collected.contains(&(target, source)),
            "adjacency must be symmetric, ({source}, {target}) has no mirror"
        );
    }
    collected
}

#[tokio::test]
async fn cold_and_hot_sample_paths_agree_and_relations_deduplicate() {
    let mut client = connect().await;
    create_fixture_tables(&client).await;

    // A small known graph over 8 entities:
    //
    // - 0 <-> 1 linked three times (two parallel links plus one reversed), which must collapse to a
    //   single undirected relation;
    // - 2 linked to itself, which must disappear;
    // - 3 linked to 0 and to 1;
    // - 4, 5 in one plain relation;
    // - 6, 7 isolated;
    // - one draft and one property embedding that must never be sampled.
    let entities = seed_entities(&client, 8).await;
    seed_link(&client, entities[0], entities[1]).await;
    seed_link(&client, entities[0], entities[1]).await;
    seed_link(&client, entities[1], entities[0]).await;
    seed_link(&client, entities[2], entities[2]).await;
    seed_link(&client, entities[3], entities[0]).await;
    seed_link(&client, entities[3], entities[1]).await;
    seed_link(&client, entities[4], entities[5]).await;

    client
        .execute(
            "INSERT INTO entity_embeddings (web_id, entity_uuid, draft_id, embedding)
             VALUES ($1, $2, $3, $4::text::vector)",
            &[
                &entities[0].web_id,
                &entities[0].entity_uuid,
                &Uuid::new_v4(),
                &embedding_literal(63),
            ],
        )
        .await
        .expect("draft embedding should insert");
    client
        .execute(
            "INSERT INTO entity_embeddings (web_id, entity_uuid, property, embedding)
             VALUES \
             ($1, $2, 'https://example.com/property/', $3::text::vector)",
            &[
                &entities[1].web_id,
                &entities[1].entity_uuid,
                &embedding_literal(62),
            ],
        )
        .await
        .expect("property embedding should insert");

    let cache = tempfile::tempdir().expect("cache directory should open");
    let out = Utf8Path::from_path(cache.path()).expect("cache path should be UTF-8");

    // Cold path: draws the sample and writes both cache files.
    let sample = Sample::load(&mut client, out, 42, sample_options())
        .await
        .expect("cold sample should load");
    assert!(!sample.from_cache());
    assert_eq!(
        sample.embeddings().len(),
        8,
        "all live whole-entity embeddings are sampled at 100%, drafts and properties excluded"
    );
    assert_eq!(sample.embeddings().dim(), 64);
    for row in 0..sample.embeddings().len() {
        let norm = sample
            .embeddings()
            .row(row)
            .iter()
            .map(|value| f64::from(*value) * f64::from(*value))
            .sum::<f64>()
            .sqrt();
        assert!(
            (norm - 1.0).abs() < 1e-3,
            "sampled embeddings are re-normalized after truncation, row {row} has norm {norm}"
        );
    }
    let embeddings_file = out.join("sample.f32");
    let mappings_file = out.join("sample.pgcopy");
    assert!(embeddings_file.exists());
    assert!(mappings_file.exists());
    assert_eq!(
        std::fs::metadata(&embeddings_file)
            .expect("embedding cache should stat")
            .len(),
        8 * 64 * 4,
        "embedding cache holds exactly the sampled rows"
    );

    // Relations with lenient hub thresholds: no hubs, full dedup behavior.
    let relations = sample
        .relations(1.0, 1_000.0)
        .await
        .expect("relations should prepare");
    assert_eq!(relations.hubs, Vec::new(), "no row exceeds the hub cut");
    let cold_adjacency = collect_adjacency(relations.edges, 8).await;
    // Undirected relations after dedup: (0,1), (0,3), (1,3), (4,5) -> 8
    // directed entries. The self-relation of 2 and the parallel/reversed
    // duplicates of (0,1) are gone.
    assert_eq!(
        cold_adjacency.len(),
        8,
        "duplicates and self-relations must collapse: {cold_adjacency:?}"
    );

    // Per-row degree distribution (undirected): 0 and 1 and 3 have degree 2,
    // 4 and 5 have degree 1, the rest zero.
    let mut degrees = [0_usize; 8];
    for &(source, _) in &cold_adjacency {
        degrees[source as usize] += 1;
    }
    let mut sorted_degrees = degrees;
    sorted_degrees.sort_unstable();
    assert_eq!(sorted_degrees, [0, 0, 0, 1, 1, 2, 2, 2]);

    // Finish commits the snapshot; the temporary sample table is gone
    // afterwards, proving the transaction really ended.
    let embeddings = sample.finish().await.expect("sample should finish");
    assert_eq!(embeddings.len(), 8);
    client
        .query_one("SELECT COUNT(*) FROM atlas_sample", &[])
        .await
        .expect_err("the sampled identity table must drop with the transaction");

    // Hot path: restores the identical mapping from the binary COPY cache.
    let sample = Sample::load(&mut client, out, 42, sample_options())
        .await
        .expect("hot sample should load");
    assert!(sample.from_cache());
    assert_eq!(sample.embeddings().len(), 8);

    let relations = sample
        .relations(1.0, 1_000.0)
        .await
        .expect("relations should prepare on the hot path");
    let hot_adjacency = collect_adjacency(relations.edges, 8).await;
    assert_eq!(
        cold_adjacency, hot_adjacency,
        "the restored mapping must reproduce the cold path's relation view"
    );
    sample.finish().await.expect("hot sample should finish");
}

#[tokio::test]
async fn hub_selection_removes_high_degree_rows_with_stable_identities() {
    let mut client = connect().await;
    create_fixture_tables(&client).await;

    // A 10-entity star plus a chain: entity 0 is linked to every other
    // entity (degree 9); the others additionally form pairs (degree 2 for
    // 1..=8, degree 1 for 9's partner... precisely: 1-2, 3-4, 5-6, 7-8).
    // Degrees: [9, 2, 2, 2, 2, 2, 2, 2, 2, 1].
    let entities = seed_entities(&client, 10).await;
    for other in 1..10 {
        seed_link(&client, entities[0], entities[other]).await;
    }
    for pair in [(1, 2), (3, 4), (5, 6), (7, 8)] {
        seed_link(&client, entities[pair.0], entities[pair.1]).await;
    }

    let cache = tempfile::tempdir().expect("cache directory should open");
    let out = Utf8Path::from_path(cache.path()).expect("cache path should be UTF-8");
    let sample = Sample::load(&mut client, out, 7, sample_options())
        .await
        .expect("sample should load");

    // Median positive degree is 2; the 0.8 quantile of
    // [1, 2, 2, 2, 2, 2, 2, 2, 2, 9] is 2 as well. With a min ratio of 2.0
    // the cut is max(2.0, 4.0) = 4.0, so exactly the star center exceeds it.
    let relations = sample
        .relations(0.8, 2.0)
        .await
        .expect("relations should prepare");
    assert_eq!(relations.hubs.len(), 1, "exactly one hub is expected");
    let hub = relations.hubs[0];
    assert_eq!(
        (Uuid::from(hub.web_id), Uuid::from(hub.entity_uuid)),
        (entities[0].web_id, entities[0].entity_uuid),
        "the hub identity is the stable entity id of the star center"
    );
    assert_eq!(hub.draft_id, None);

    // Every relation touching the hub is gone; the pair relations survive.
    let adjacency = collect_adjacency(relations.edges, 10).await;
    assert_eq!(
        adjacency.len(),
        8,
        "four undirected pair relations survive hub removal: {adjacency:?}"
    );

    sample.finish().await.expect("sample should finish");
}

#[tokio::test]
async fn relation_failure_surfaces_before_any_numerical_work() {
    let mut client = connect().await;
    // The embeddings table is intact, but the session's edge table lacks
    // the columns relational preprocessing reads, so it must fail before
    // producing any relational output.
    client
        .batch_execute(&format!(
            "CREATE TEMPORARY TABLE entity_embeddings (
                 web_id UUID NOT NULL,
                 entity_uuid UUID NOT NULL,
                 draft_id UUID,
                 property TEXT,
                 embedding VECTOR({EMBEDDING_DIM}) NOT NULL
             );
             CREATE TEMPORARY TABLE entity_edge (
                 source_web_id UUID NOT NULL,
                 source_entity_uuid UUID NOT NULL
             );"
        ))
        .await
        .expect("fixture tables should create");
    seed_entities(&client, 4).await;

    let cache = tempfile::tempdir().expect("cache directory should open");
    let out = Utf8Path::from_path(cache.path()).expect("cache path should be UTF-8");
    let sample = Sample::load(&mut client, out, 42, sample_options())
        .await
        .expect("sample should load");

    assert!(
        sample.relations(0.9, 4.0).await.is_err(),
        "relation extraction must fail without the edge table"
    );

    // The failed fit published nothing beyond the sample cache files.
    let published = std::fs::read_dir(cache.path())
        .expect("cache directory should list")
        .map(|entry| entry.expect("entry should read").file_name())
        .filter(|name| {
            let name = name.to_string_lossy();
            !name.starts_with("sample.") && !name.starts_with(".tmp")
        })
        .collect::<Vec<_>>();
    assert_eq!(
        published,
        Vec::<std::ffi::OsString>::new(),
        "a failed relation stage must not leave layout or encoder artifacts"
    );
}
