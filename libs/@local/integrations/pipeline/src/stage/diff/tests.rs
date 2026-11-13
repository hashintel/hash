//! Stage-boundary checks use literal predecessor checkpoints and real captures.
use alloc::collections::BTreeMap;

use bytes::Bytes;
use duckdb::types::Value;
use hash_integrations_definition::Variables;
use rstest::rstest;
use serde_json::json;
use similar_asserts::assert_eq;
use tempfile::TempDir;

use super::{DiffOutput, diff};
use crate::{
    ArtifactRef, Code, Operation, RunContext, RunId, RunInput, Workspace,
    run::{
        current::Current,
        marker::{finish, finished},
        table::load_table,
        tests::{apply, context, fixtures::store_expected, reader, run_id},
    },
    sources::tests::NoSecrets,
    stage::{
        capture::{CaptureOutput, capture},
        plan::PlanOutput,
        send::{SendCounts, SendOutput},
    },
    start,
};

const EMPTY_HASH: &str = "d41d8cd98f00b204e9800998ecf8427e";
// UUID-v5 vectors checked independently from the namespace/name rule in stage-2-rows.md.
const ID0: &str = "00000000-0000-4000-8000-000000000001~6797432a-0e7a-5e1b-93e4-bb7355dd73ee";
const ID65535: &str = "00000000-0000-4000-8000-000000000001~8357f013-c750-578a-89e4-3c9750b0a40d";
const ID65536: &str = "00000000-0000-4000-8000-000000000001~e34f8463-73b1-5a56-914a-d31bd046b4cb";
const ID131072: &str = "00000000-0000-4000-8000-000000000001~45229dba-4b5e-5da2-a499-69c04c1cd93a";
const ID149999: &str = "00000000-0000-4000-8000-000000000001~127d7aa6-bd5b-5d23-9c7c-2e26daefda77";

fn definition(query: &str, extra_steps: &str, properties: &str) -> String {
    format!("connector: aviation\nsources:\n  items:\n    primaryKey: [K]\n    sql: |\n      {}\npipelines:\n  entities:\n    - source: items\n      steps:\n{}        - id: sink\n          sink:\n            entityType: https://example.com/entity/v/1\n            entityId: ID\n{}", query.replace('\n', "\n      "), extra_steps, properties)
}

async fn captured(
    context: &RunContext,
    directory: &TempDir,
    text: &str,
    run: RunId,
) -> (RunInput, CaptureOutput) {
    let mut request = apply(run, text);
    if let crate::OperationRequest::Apply { namespace, .. } = &mut request.operation {
        *namespace = "demo".into();
    }
    let input = start(context, request).await.expect("should start run");
    let capture = capture(
        context,
        &input,
        &reader(context, directory.path()),
        &NoSecrets,
    )
    .await
    .expect("should capture actual source");
    (input, capture)
}

async fn current(context: &RunContext, committed: Option<RunId>, sending: Vec<RunId>) {
    context
        .storage
        .replace_if(
            &context.namespace.current(),
            None,
            Bytes::from(
                serde_json::to_vec(&Current { committed, sending }).expect("should encode current"),
            ),
        )
        .await
        .expect("should set current");
}

async fn predecessor(context: &RunContext, run: RunId, rows: serde_json::Value) -> DiffOutput {
    let output = DiffOutput {
        base: None,
        resent: vec![],
        targets: BTreeMap::new(),
        hashes: store_expected(context, &json!({"schema":"hashes","rows":rows})).await,
        archives: store_expected(context, &json!({"schema":"archives","rows":[]})).await,
        issues: store_expected(context, &json!({"schema":"issues","rows":[]})).await,
    };
    finish(context, &context.namespace.diff_output(run.into()), &output)
        .await
        .expect("should bind independent prior diff");
    output
}

async fn sender(
    context: &RunContext,
    run: RunId,
    rows: serde_json::Value,
    writes: serde_json::Value,
) {
    let output = predecessor(context, run, rows).await;
    // Diff consumes entity IDs only. Request body cells are deliberately minimal JSON;
    // operation vocabulary, ordering, metadata, and counts follow the checkpoint contract.
    let writes_count = writes.as_array().expect("should contain write rows").len() as u64;
    let plan = PlanOutput {
        writes: store_expected(context, &json!({"schema":"writes","rows":writes})).await,
        issues: output.issues,
        batches: 1,
        counts: BTreeMap::from([
            (crate::graph::OperationKind::UpsertEntity, writes_count),
            (crate::graph::OperationKind::UpsertLink, 0),
            (crate::graph::OperationKind::ArchiveLink, 0),
            (crate::graph::OperationKind::ArchiveEntity, 0),
        ]),
    };
    finish(context, &context.namespace.plan_output(run.into()), &plan)
        .await
        .expect("should bind independent plan");
}

async fn query_file(
    context: &RunContext,
    workspace: &Workspace,
    file: &ArtifactRef,
    table: &str,
    sql: &str,
) -> Vec<Vec<Value>> {
    load_table(context, workspace, file, table.into())
        .await
        .expect("should load checkpoint into fresh consumer");
    workspace
        .query(sql.into())
        .await
        .expect("should query stored rows")
        .iter()
        .map(<[Value]>::to_vec)
        .collect()
}

#[tokio::test]
#[expect(
    clippy::too_many_lines,
    reason = "literal predecessor and output rows keep the full recovery scenario reviewable \
              together"
)]
async fn diff_loads_base_rejections_and_all_failed_senders() {
    let directory = TempDir::new().expect("should create fixture");
    let context = context(directory.path());
    let (input, capture) = captured(
        &context,
        &directory,
        &definition(
            "SELECT ID AS K, ID FROM (VALUES ('0'), ('65536')) AS t(ID)",
            "",
            "",
        ),
        run_id(10),
    )
    .await;
    predecessor(
        &context,
        run_id(1),
        json!([
            [ID0, "entity", "old-sink", "0", EMPTY_HASH, true],
            [ID65535, "entity", "sink", "65535", EMPTY_HASH, true],
            [ID65536, "entity", "sink", "65536", EMPTY_HASH, false],
            [ID131072, "entity", "sink", "131072", EMPTY_HASH, false]
        ]),
    )
    .await;
    let rejected = store_expected(&context, &json!({"schema":"rejected","rows":[[ID0,"upsert_entity","insert","old-sink","0",422,"graph_status"]]})).await;
    finish(
        &context,
        &context.namespace.send_output(run_id(1).into()),
        &SendOutput {
            rejected: Some(rejected),
            counts: SendCounts {
                created: 2,
                rejected: 1,
                ..SendCounts::default()
            },
        },
    )
    .await
    .expect("should bind rejected base send");
    sender(
        &context,
        run_id(2),
        json!([[
            ID149999,
            "entity",
            "earlier",
            "old-source",
            "old-hash",
            true
        ]]),
        json!([[
            0,
            0,
            "upsert_entity",
            "insert",
            ID149999,
            "earlier",
            "old-source",
            null,
            null,
            "{}",
            "{}"
        ]]),
    )
    .await;
    sender(
        &context,
        run_id(3),
        json!([
            [
                ID149999,
                "entity",
                "latest",
                "latest-source",
                "latest-hash",
                true
            ],
            [ID0, "entity", "wrong", "wrong", "wrong", true]
        ]),
        json!([
            [
                0,
                0,
                "upsert_entity",
                "insert",
                ID149999,
                "latest",
                "latest-source",
                null,
                null,
                "{}",
                "{}"
            ],
            [
                1,
                0,
                "upsert_entity",
                "resend",
                ID0,
                "wrong",
                "wrong",
                null,
                null,
                "{}",
                "{}"
            ]
        ]),
    )
    .await;
    current(&context, Some(run_id(1)), vec![run_id(2), run_id(3)]).await;
    let output = diff(&context, &input, &capture)
        .await
        .expect("should compute from durable predecessors");
    assert_eq!(output.base, Some(run_id(1)));
    assert_eq!(output.resent, [run_id(2), run_id(3)]);
    let sink = &output.targets[&"entity/sink".parse().expect("should parse target")];
    assert_eq!(
        (
            sink.counts.inserted,
            sink.counts.updated,
            sink.counts.resent,
            sink.counts.archived
        ),
        (0, 1, 1, 1)
    );
    let workspace = context
        .open_workspace(Variables::default())
        .await
        .expect("should open consumer");
    let rows = query_file(
        &context,
        &workspace,
        &output.hashes,
        "hashes",
        "SELECT source_id, target, content_hash, live FROM hashes ORDER BY source_id",
    )
    .await;
    assert_eq!(
        rows,
        vec![
            vec![
                Value::Text("0".into()),
                Value::Text("sink".into()),
                Value::Text(EMPTY_HASH.into()),
                Value::Boolean(true)
            ],
            vec![
                Value::Text("131072".into()),
                Value::Text("sink".into()),
                Value::Text(EMPTY_HASH.into()),
                Value::Boolean(false)
            ],
            vec![
                Value::Text("65535".into()),
                Value::Text("sink".into()),
                Value::Text(EMPTY_HASH.into()),
                Value::Boolean(false)
            ],
            vec![
                Value::Text("65536".into()),
                Value::Text("sink".into()),
                Value::Text(EMPTY_HASH.into()),
                Value::Boolean(true)
            ],
            vec![
                Value::Text("latest-source".into()),
                Value::Text("latest".into()),
                Value::Text("latest-hash".into()),
                Value::Boolean(false)
            ],
        ]
    );
    assert_eq!(
        query_file(
            &context,
            &workspace,
            &output.archives,
            "archives",
            "SELECT source_id FROM archives ORDER BY source_id"
        )
        .await,
        vec![
            vec![Value::Text("65535".into())],
            vec![Value::Text("latest-source".into())]
        ]
    );
    assert_eq!(
        query_file(
            &context,
            &workspace,
            sink.changes.as_ref().expect("should write changes"),
            "changes",
            "SELECT _row, _source_id, _change FROM changes ORDER BY _row"
        )
        .await,
        vec![
            vec![
                Value::UBigInt(0),
                Value::Text("0".into()),
                Value::Text("resend".into())
            ],
            vec![
                Value::UBigInt(1),
                Value::Text("65536".into()),
                Value::Text("update".into())
            ]
        ]
    );
    workspace.close().await.expect("should close consumer");
    let mut invalid = input;
    invalid.definition = Some("invalid: [".into());
    assert_eq!(
        diff(&context, &invalid, &capture)
            .await
            .expect("marker should win before parsing or current read"),
        output
    );
}

#[rstest]
#[case("_key")]
#[case("_Op")]
#[tokio::test]
async fn diff_reserved_accessors_keep_stage_error(#[case] name: &str) {
    let directory = TempDir::new().expect("should create fixture");
    let context = context(directory.path());
    let properties = format!("            properties:\n              https://example.com/a/v/1: {{ column: MISSING }}\n              https://example.com/z/v/1: {{ column: {name} }}\n");
    let (input, capture) = captured(
        &context,
        &directory,
        &definition("SELECT '0' AS K, '0' AS ID WHERE false", "", &properties),
        run_id(1),
    )
    .await;
    let error = diff(&context, &input, &capture)
        .await
        .expect_err("reserved accessor must fail even on empty table");
    assert_eq!(Code::of(&error), Some(Code::ReservedColumn));
    assert!(
        finished::<DiffOutput>(&context, &context.namespace.diff_output(input.run.into()))
            .await
            .expect("should inspect marker")
            .is_none()
    );
}

#[tokio::test]
async fn diff_metadata_alias_changes_are_unique_and_typed() {
    let directory = TempDir::new().expect("should create fixture");
    let context = context(directory.path());
    let (input, capture) = captured(&context,&directory,&definition("SELECT '0' AS K, '0' AS ID", "        - id: alias\n          sql: SELECT * EXCLUDE (_key), _key AS _KEY, _key AS source_key, _op AS source_op FROM input\n", "            properties:\n              https://example.com/a/v/1: { column: source_key }\n              https://example.com/b/v/1: { column: source_op }\n"),run_id(1)).await;
    let output = diff(&context, &input, &capture)
        .await
        .expect("aliased metadata should be valid properties");
    let changes = output
        .targets
        .values()
        .next()
        .expect("should have target")
        .changes
        .as_ref()
        .expect("should have changes");
    let workspace = context
        .open_workspace(Variables::default())
        .await
        .expect("should open consumer");
    load_table(&context, &workspace, changes, "changes".into())
        .await
        .expect("should load exact handoff");
    assert_eq!(
        super::rows::table_columns(&workspace, "changes")
            .await
            .expect("should list columns")
            .iter()
            .map(AsRef::<str>::as_ref)
            .collect::<Vec<_>>(),
        [
            "_row",
            "_entity_id",
            "_change",
            "_source_id",
            "_key",
            "source_key",
            "source_op"
        ]
    );
    let rows = workspace
        .query("SELECT _row, _key = source_key, source_op FROM changes".into())
        .await
        .expect("should inspect aliases");
    assert_eq!(
        rows.iter().collect::<Vec<_>>(),
        [&[
            Value::UBigInt(0),
            Value::Boolean(true),
            Value::Text("snapshot".into())
        ][..]]
    );
    workspace.close().await.expect("should close consumer");
}

#[tokio::test]
async fn diff_duplicate_identity_across_targets_has_no_marker() {
    let directory = TempDir::new().expect("should create fixture");
    let context = context(directory.path());
    let mut text = definition("SELECT '0' AS K, '0' AS ID", "", "");
    text.push_str("        - id: duplicate\n          sink:\n            entityType: https://example.com/entity/v/1\n            entityId: ID\n");
    let (input, capture) = captured(&context, &directory, &text, run_id(1)).await;
    let error = diff(&context, &input, &capture)
        .await
        .expect_err("global duplicate guard must reject targets sharing ID");
    assert_eq!(Code::of(&error), Some(Code::DuplicateEntityId));
    assert!(format!("{error:?}").contains("entity/sink"));
    assert!(
        finished::<DiffOutput>(&context, &context.namespace.diff_output(input.run.into()))
            .await
            .expect("should inspect marker")
            .is_none()
    );
}

#[rstest]
#[case(false)]
#[case(true)]
#[tokio::test]
async fn diff_archive_guard_applies_to_version_bumps_and_restore(#[case] restore: bool) {
    let directory = TempDir::new().expect("should create fixture");
    let context = context(directory.path());
    let text = definition(
        "SELECT CAST(range AS VARCHAR) AS K, CAST(range AS VARCHAR) AS ID FROM range(1001)",
        "",
        "",
    );
    let (first, capture) = captured(&context, &directory, &text, run_id(1)).await;
    let baseline = diff(&context, &first, &capture)
        .await
        .expect("should establish actual predecessor");
    assert_eq!(
        baseline
            .targets
            .values()
            .next()
            .expect("should have sink")
            .counts
            .inserted,
        1001
    );
    finish(
        &context,
        &context.namespace.send_output(first.run.into()),
        &SendOutput {
            rejected: None,
            counts: SendCounts::default(),
        },
    )
    .await
    .expect("should seed successful delivery");
    current(&context, Some(first.run), vec![]).await;
    let mut input = first;
    input.run = run_id(2);
    if restore {
        input.definition = None;
        input.operation = Operation::Restore { target: None };
    } else {
        input.definition = Some(
            text.replace(
                "https://example.com/entity/v/1",
                "https://example.com/entity/v/2",
            )
            .into(),
        );
    }
    let capture = capture.clone();
    let error = diff(&context, &input, &capture)
        .await
        .expect_err("1001 of 1001 archives require explicit override");
    assert_eq!(Code::of(&error), Some(Code::ArchiveLimit));
    assert!(
        finished::<DiffOutput>(&context, &context.namespace.diff_output(input.run.into()))
            .await
            .expect("should inspect marker")
            .is_none()
    );
    input.allow_mass_archive = true;
    let output = diff(&context, &input, &capture)
        .await
        .expect("override should permit operation");
    let counts = &output
        .targets
        .values()
        .next()
        .expect("should preserve archived target")
        .counts;
    assert_eq!(counts.archived, 1001);
    assert_eq!(counts.inserted, if restore { 0 } else { 1001 });
}

#[rstest]
#[case("170141183460469231731687303715884105727::HUGEINT", false)]
#[case("[170141183460469231731687303715884105727::HUGEINT]", false)]
#[case("340282366920938463463374607431768211455::UHUGEINT", false)]
#[case("99999999999999999999999999999999999999::HUGEINT", true)]
#[tokio::test]
async fn diff_numeric_checkpoint_validation(#[case] expression: &str, #[case] valid: bool) {
    let directory = TempDir::new().expect("should create fixture");
    let context = context(directory.path());
    let steps = format!(
        "        - id: numeric\n          sql: SELECT *, {expression} AS amount FROM input\n"
    );
    let text = definition(
        "SELECT '0' AS K, '0' AS ID",
        &steps,
        "            properties:\n              https://example.com/amount/v/1: { column: amount \
         }\n",
    );
    let (input, capture) = captured(&context, &directory, &text, run_id(1)).await;
    let result = diff(&context, &input, &capture).await;
    if valid {
        let output = result.expect("38-digit integer should export losslessly");
        let changes = output
            .targets
            .values()
            .next()
            .expect("should have target")
            .changes
            .as_ref()
            .expect("should have changes");
        let workspace = context
            .open_workspace(Variables::default())
            .await
            .expect("should open consumer");
        let rows = query_file(
            &context,
            &workspace,
            changes,
            "changes",
            "SELECT CAST(amount AS VARCHAR), typeof(amount) FROM changes",
        )
        .await;
        assert_eq!(
            rows,
            vec![vec![
                Value::Text("99999999999999999999999999999999999999".into()),
                Value::Text("DECIMAL(38,0)".into())
            ]]
        );
        workspace.close().await.expect("should close consumer");
    } else {
        assert!(
            result.is_err(),
            "invalid numeric must fail checkpoint publication"
        );
        assert!(
            finished::<DiffOutput>(&context, &context.namespace.diff_output(input.run.into()))
                .await
                .expect("should inspect marker")
                .is_none()
        );
    }
}

#[rstest]
#[case("diff")]
#[case("send")]
#[case("plan")]
#[tokio::test]
async fn diff_missing_predecessor_markers_are_permanent(#[case] missing: &str) {
    let directory = TempDir::new().expect("should create fixture");
    let context = context(directory.path());
    let (input, capture) = captured(
        &context,
        &directory,
        &definition("SELECT '0' AS K, '0' AS ID", "", ""),
        run_id(2),
    )
    .await;
    if missing == "send" {
        predecessor(&context, run_id(1), json!([])).await;
    }
    current(
        &context,
        if missing == "plan" {
            None
        } else {
            Some(run_id(1))
        },
        if missing == "plan" {
            vec![run_id(1)]
        } else {
            vec![]
        },
    )
    .await;
    let error = diff(&context, &input, &capture)
        .await
        .expect_err("missing committed/sending checkpoint must fail");
    assert_eq!(Code::of(&error), Some(Code::MarkerMissing));
}

#[rstest]
#[case("complete", true)]
#[case("partial", true)]
#[case("complete-or-empty", false)]
#[tokio::test]
async fn diff_empty_source_coverage_and_removed_target(
    #[case] coverage: &str,
    #[case] protected: bool,
) {
    let directory = TempDir::new().expect("should create fixture");
    let context = context(directory.path());
    let text = definition("SELECT '0' AS K, '0' AS ID WHERE false", "", "").replace(
        "primaryKey: [K]",
        &format!("primaryKey: [K]\n    coverage: {coverage}"),
    );
    let (input, capture) = captured(&context, &directory, &text, run_id(2)).await;
    predecessor(
        &context,
        run_id(1),
        json!([
            [ID0, "entity", "sink", "0", EMPTY_HASH, true],
            [ID65535, "entity", "removed", "65535", EMPTY_HASH, true],
            [ID65536, "entity", "sink", "65536", EMPTY_HASH, true]
        ]),
    )
    .await;
    let rejected = store_expected(&context,&json!({"schema":"rejected","rows":[[ID65536,"upsert_entity","insert","sink","65536",422,"graph_status"]]})).await;
    finish(
        &context,
        &context.namespace.send_output(run_id(1).into()),
        &SendOutput {
            rejected: Some(rejected),
            counts: SendCounts {
                created: 2,
                rejected: 1,
                ..SendCounts::default()
            },
        },
    )
    .await
    .expect("should bind rejected base checkpoint");
    current(&context, Some(run_id(1)), vec![]).await;
    let output = diff(&context, &input, &capture)
        .await
        .expect("should respect captured source coverage");
    let sink = &output.targets[&"entity/sink".parse().expect("should parse target")];
    assert_eq!(sink.counts.archived, if protected { 1 } else { 2 });
    assert_eq!(sink.changes, None);
    assert_eq!(
        output
            .targets
            .contains_key(&"entity/removed".parse().expect("should parse target")),
        !protected
    );
    let workspace = context
        .open_workspace(Variables::default())
        .await
        .expect("should open consumer");
    let rows = query_file(
        &context,
        &workspace,
        &output.hashes,
        "hashes",
        "SELECT source_id, live FROM hashes ORDER BY source_id",
    )
    .await;
    assert_eq!(
        rows,
        vec![
            vec![Value::Text("0".into()), Value::Boolean(protected)],
            vec![Value::Text("65535".into()), Value::Boolean(protected)],
            vec![Value::Text("65536".into()), Value::Boolean(false)]
        ]
    );
    workspace.close().await.expect("should close consumer");
}

#[tokio::test]
async fn diff_late_batch_decimal_failure_leaves_no_marker() {
    let directory = TempDir::new().expect("should create fixture");
    let context = context(directory.path());
    let text = definition(
        "SELECT range AS K, range AS ID FROM range(4097)",
        "        - id: numeric\n          sql: SELECT *, CASE WHEN ID = 4096 THEN \
         170141183460469231731687303715884105727::HUGEINT ELSE 0::HUGEINT END AS amount FROM \
         input\n",
        "            properties:\n              https://example.com/amount/v/1: { column: amount \
         }\n",
    );
    let (input, capture) = captured(&context, &directory, &text, run_id(1)).await;
    let error = diff(&context, &input, &capture)
        .await
        .expect_err("later export batches must validate decimal precision");
    assert_eq!(Code::of(&error), Some(Code::DataInvalid));
    assert!(
        finished::<DiffOutput>(&context, &context.namespace.diff_output(input.run.into()))
            .await
            .expect("should inspect marker")
            .is_none()
    );
}

#[tokio::test]
async fn diff_empty_restore_publishes_typed_empty_files() {
    let directory = TempDir::new().expect("should create fixture");
    let context = context(directory.path());
    let (mut input, capture) = captured(
        &context,
        &directory,
        &definition("SELECT '0' AS K, '0' AS ID", "", ""),
        run_id(1),
    )
    .await;
    input.definition = None;
    input.operation = Operation::Restore { target: None };
    let output = diff(&context, &input, &capture)
        .await
        .expect("should produce empty desired state");
    assert_eq!(output.targets, BTreeMap::new());
    let workspace = context
        .open_workspace(Variables::default())
        .await
        .expect("should open consumer");
    for (name, file, columns) in [
        (
            "hashes",
            &output.hashes,
            vec![
                "entity_id",
                "kind",
                "target",
                "source_id",
                "content_hash",
                "live",
            ],
        ),
        (
            "archives",
            &output.archives,
            vec!["entity_id", "kind", "target", "source_id"],
        ),
        (
            "issues",
            &output.issues,
            vec![
                "kind",
                "target",
                "entity_id",
                "key",
                "issue",
                "property",
                "reason",
            ],
        ),
    ] {
        assert_eq!(
            query_file(
                &context,
                &workspace,
                file,
                name,
                &format!("SELECT count(*) FROM {name}")
            )
            .await,
            vec![vec![Value::BigInt(0)]]
        );
        assert_eq!(
            super::rows::table_columns(&workspace, name)
                .await
                .expect("should list schema")
                .iter()
                .map(AsRef::<str>::as_ref)
                .collect::<Vec<_>>(),
            columns
        );
    }
    workspace.close().await.expect("should close consumer");
}
