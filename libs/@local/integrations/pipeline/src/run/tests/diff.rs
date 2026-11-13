//! Actual Capture-to-Diff output checked against independent successor fixtures.

use alloc::collections::BTreeMap;
use std::fs;

use duckdb::types::Value;
use hash_integrations_definition::Variables;
use serde_json::Value as JsonValue;
use similar_asserts::assert_eq;
use tempfile::TempDir;

use super::{apply, context, fixtures, reader, run_id};
use crate::{
    ArtifactRef, RunContext, Target, Workspace,
    run::table::load_table,
    sources::tests::NoSecrets,
    stage::{
        capture::capture,
        diff::{DiffCounts, diff},
    },
    start,
};

async fn assert_produced_hashes(
    context: &RunContext,
    workspace: &Workspace,
    artifact: &ArtifactRef,
    expected: &JsonValue,
) {
    load_table(context, workspace, artifact, "hashes".into())
        .await
        .expect("should load durable hashes");
    let rows = workspace
        .query("SELECT * FROM hashes ORDER BY rowid".into())
        .await
        .expect("should read hash rows in persisted order");
    assert_eq!(
        rows.columns(),
        [
            "entity_id",
            "kind",
            "target",
            "source_id",
            "content_hash",
            "live"
        ]
        .map(Box::<str>::from)
        .as_slice()
    );
    let expected_rows: Vec<_> = expected["rows"]
        .as_array()
        .expect("should supply independently specified hash rows")
        .iter()
        .map(|row| {
            let [entity, kind, target, source, _, live] = row
                .as_array()
                .expect("should contain ordered hash cells")
                .as_slice()
            else {
                panic!("should supply the six hash columns");
            };
            vec![
                Value::Text(entity.as_str().expect("should specify an entity ID").into()),
                Value::Text(kind.as_str().expect("should specify a kind").into()),
                Value::Text(target.as_str().expect("should specify a target").into()),
                Value::Text(source.as_str().expect("should specify a source ID").into()),
                Value::Boolean(live.as_bool().expect("should specify liveness")),
            ]
        })
        .collect();
    let mut hashes = BTreeMap::new();
    let actual_rows: Vec<_> = rows
        .iter()
        .map(|row| {
            let [
                entity @ Value::Text(entity_id),
                kind @ Value::Text(_),
                target @ Value::Text(_),
                source @ Value::Text(_),
                Value::Text(hash),
                live @ Value::Boolean(_),
            ] = row
            else {
                panic!("should preserve hash column types and non-null values");
            };
            assert!(
                hash.len() == 32
                    && hash
                        .bytes()
                        .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte)),
                "should produce a lowercase MD5 digest"
            );
            assert!(hashes.insert(entity_id.as_str(), hash.as_str()).is_none());
            vec![
                entity.clone(),
                kind.clone(),
                target.clone(),
                source.clone(),
                live.clone(),
            ]
        })
        .collect();
    assert_eq!(actual_rows, expected_rows);
    assert_hash_rules(expected, &hashes);
}

fn assert_hash_rules(expected: &JsonValue, hashes: &BTreeMap<&str, &str>) {
    // Opaque consumer seed hashes are deliberately excluded above. These independent rules
    // constrain producer digests without manufacturing expectations from the producer.
    let identities: JsonValue =
        serde_json::from_str(include_str!("../../../tests/fixtures/entity-ids.json"))
            .expect("should decode independent entity identities");
    let hash_for = |alias: &str| {
        let entity = identities["entities"][alias]["entity_id"]
            .as_str()
            .expect("should resolve the independent fixture identity");
        *hashes
            .get(entity)
            .expect("should produce the expected entity hash")
    };
    let checks = &expected["producer_hash_checks"];
    for (rule, equal) in [("equal_pairs", true), ("different_pairs", false)] {
        for pair in checks[rule]
            .as_array()
            .expect("should specify hash relationships")
        {
            let [left, right] = pair.as_array().expect("should supply a pair").as_slice() else {
                panic!("should compare two fixture identities");
            };
            assert_eq!(
                hash_for(left.as_str().expect("should name the left fixture"))
                    == hash_for(right.as_str().expect("should name the right fixture")),
                equal,
                "should satisfy {rule}"
            );
        }
    }
    for (alias, literal) in checks["literal_values"]
        .as_object()
        .expect("should specify fixed digest vectors")
    {
        assert_eq!(
            hash_for(alias),
            literal.as_str().expect("should supply a digest")
        );
    }
}

#[tokio::test]
async fn diff_matches_independent_checkpoint_on_fresh_scratch() {
    let directory = TempDir::new().expect("should create fixture storage");
    let capture_context = context(directory.path());
    let sources = reader(&capture_context, directory.path());
    let input = start(
        &capture_context,
        apply(
            run_id(1),
            include_str!("../../../tests/fixtures/aviation.yaml"),
        ),
    )
    .await
    .expect("should pin the canonical definition");
    let captured = capture(&capture_context, &input, &sources, &NoSecrets)
        .await
        .expect("should capture canonical sources");
    fs::remove_dir_all(&capture_context.scratch).expect("should discard capture scratch");
    let diff_context = context(directory.path());
    let output = diff(&diff_context, &input, &captured)
        .await
        .expect("should diff actual capture files");
    assert_eq!(output.base, None);
    assert_eq!(output.resent, []);
    fs::remove_dir_all(&diff_context.scratch).expect("should discard diff scratch");

    let consumer = context(directory.path());
    let workspace = consumer
        .open_workspace(Variables::default())
        .await
        .expect("should open an independent successor workspace");
    let expected = fixtures::first_run();
    let expected_diff = &expected["run_1"]["diff"];
    assert_produced_hashes(
        &consumer,
        &workspace,
        &output.hashes,
        &expected_diff["hashes"],
    )
    .await;
    for (name, artifact) in [("archives", &output.archives), ("issues", &output.issues)] {
        fixtures::assert_table(&consumer, &workspace, artifact, name, &expected_diff[name]).await;
    }
    let expected_changes = expected_diff["changes"]
        .as_object()
        .expect("should contain independent target changes");
    assert_eq!(output.targets.len(), expected_changes.len());
    for (target, table) in expected_changes {
        let target_id: Target = target.parse().expect("should parse the expected target");
        let actual = output
            .targets
            .get(&target_id)
            .expect("should produce the target");
        let counts: DiffCounts =
            serde_json::from_value(expected_diff["target_counts"][target].clone())
                .expect("should specify independent target counts");
        assert_eq!(actual.counts, counts);
        fixtures::assert_table(
            &consumer,
            &workspace,
            actual
                .changes
                .as_ref()
                .expect("should produce the inserted rows"),
            target,
            table,
        )
        .await;
    }
    workspace.close().await.expect("should close the successor");
    assert_eq!(
        diff(&consumer, &input, &captured)
            .await
            .expect("should replay the durable diff marker"),
        output
    );
}
