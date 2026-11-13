use duckdb::types::Value;
use hash_integrations_definition::{Definition, Variables};
use rstest::rstest;
use similar_asserts::assert_eq;
use tempfile::TempDir;

use super::prepare_rows;
use crate::{
    Code, RunContext, RunInput, Workspace,
    run::tests::{apply, context, reader, run_id},
    sources::tests::NoSecrets,
    stage::{
        capture::{CaptureOutput, capture},
        diff::PreparedRows,
    },
    start,
};

struct Fixture {
    _directory: TempDir,
    context: RunContext,
    input: RunInput,
    capture: CaptureOutput,
    definition: Definition,
    workspace: Workspace,
}

impl Fixture {
    async fn new(text: &str) -> Self {
        let directory = TempDir::new().expect("should create row preparation fixture");
        let context = context(directory.path());
        let reader = reader(&context, directory.path());
        let input = start(&context, apply(run_id(1), text))
            .await
            .expect("should pin definition");
        let capture = capture(&context, &input, &reader, &NoSecrets)
            .await
            .expect("should capture sources");
        let definition = input
            .parse_definition()
            .expect("should parse definition")
            .expect("should have definition");
        let workspace = context
            .open_workspace(definition.variables().clone())
            .await
            .expect("should open workspace");
        Self {
            _directory: directory,
            context,
            input,
            capture,
            definition,
            workspace,
        }
    }

    async fn prepare(&self) -> PreparedRows {
        prepare_rows(
            &self.context,
            &self.workspace,
            &self.input,
            Some(&self.definition),
            &self.capture,
        )
        .await
        .expect("should prepare rows")
    }
}

fn definition(query: &str) -> String {
    format!("connector: aviation\nsources:\n  items:\n    primaryKey: [K]\n    sql: |\n      {}\npipelines:\n  entities:\n    - source: items\n      steps:\n        - id: sink\n          sink:\n            entityType: https://example.com/entity/v/1\n            entityId: ID\n", query.replace('\n', "\n      "))
}

#[tokio::test]
async fn rows_aviation_empty_repeat() {
    let text = include_str!("../../../../tests/fixtures/aviation.yaml").replace(
        ") t(TAIL, MODEL, FIRST_FLIGHT, EMPTY_MASS, MASS_UNIT, HOME_BASE)",
        ") t(TAIL, MODEL, FIRST_FLIGHT, EMPTY_MASS, MASS_UNIT, HOME_BASE) WHERE false",
    );
    let fixture = Fixture::new(&text).await;
    for _ in 0..2 {
        let prepared = fixture.prepare().await;
        assert_eq!(
            prepared
                .targets
                .iter()
                .map(|target| target.target.to_string())
                .collect::<Vec<_>>(),
            [
                "entity/sink-airfields",
                "entity/sink-aircraft",
                "link/aircraft-based-at"
            ]
        );
        for target in &prepared.targets {
            let expected_source = if target.target.id() == "sink-airfields" {
                "airfields"
            } else {
                "aircraft"
            };
            assert_eq!(
                target
                    .sources
                    .iter()
                    .map(AsRef::<str>::as_ref)
                    .collect::<Vec<_>>(),
                [expected_source]
            );
            assert_eq!(target.without_id, 0);
            let count = fixture
                .workspace
                .query(format!("SELECT count(*) FROM \"{}\"", target.table).into_boxed_str())
                .await
                .expect("should count target");
            assert_eq!(
                count.iter().collect::<Vec<_>>(),
                [if expected_source == "airfields" {
                    &[Value::BigInt(2)][..]
                } else {
                    &[Value::BigInt(0)][..]
                }]
            );
        }
        assert_eq!(
            prepared.targets[1]
                .columns
                .iter()
                .map(AsRef::<str>::as_ref)
                .collect::<Vec<_>>(),
            ["EMPTY_MASS", "MASS_UNIT", "FIRST_FLIGHT", "MODEL"]
        );
        let issues = fixture
            .workspace
            .query("SELECT * FROM _issues".into())
            .await
            .expect("should read issues");
        assert_eq!(issues.iter().len(), 0);
        assert_eq!(
            issues
                .columns()
                .iter()
                .map(AsRef::<str>::as_ref)
                .collect::<Vec<_>>(),
            [
                "kind",
                "target",
                "entity_id",
                "key",
                "issue",
                "property",
                "reason"
            ]
        );
    }
    fixture
        .workspace
        .close()
        .await
        .expect("should close workspace");
}

#[tokio::test]
async fn rows_checkpoint_source_provenance() {
    let fixture = Fixture::new(
        "connector: aviation
sources:
  a: { sql: 'SELECT 1 AS ID', primaryKey: [ID] }
  b: { sql: 'SELECT \
         1 AS ID', primaryKey: [ID] }
  saved: { checkpoint: cp-b }
pipelines:
  entities:
    - source: \
         saved
      steps:
        - id: sink-saved
          sink: { entityType: 'https://example.com/saved/v/1', \
         entityId: ID }
    - source: b
      inputs: { other: cp-a }
      steps:
        - id: join
          \
         sql: SELECT input.* FROM input JOIN other USING (ID)
        - id: cp-b
          checkpoint: \
         cp-b
    - source: a
      steps:
        - id: cp-a
          checkpoint: cp-a
  links:
    - id: \
         joined
      checkpoint: cp-b
      from: { entityType: 'https://example.com/entity/v/1', column: \
         ID }
      to: { entityType: 'https://example.com/entity/v/1', column: ID }
      linkType: \
         https://example.com/link/v/1
    - id: single
      checkpoint: cp-a
      from: { entityType: \
         'https://example.com/entity/v/1', column: ID }
      to: { entityType: 'https://example.com/entity/v/1', \
         column: ID }
      linkType: https://example.com/link/v/1
",
    )
    .await;
    let prepared = fixture.prepare().await;
    for target in &prepared.targets {
        let sources = target
            .sources
            .iter()
            .map(AsRef::<str>::as_ref)
            .collect::<Vec<_>>();
        if target.target.id() == "single" {
            assert_eq!(sources, ["a"]);
        } else {
            assert_eq!(sources, ["a", "b"]);
        }
    }
    assert_eq!(prepared.targets.len(), 3);
    fixture
        .workspace
        .close()
        .await
        .expect("should close workspace");
}

#[tokio::test]
async fn rows_missing_ids_and_endpoints() {
    let mut text =
        definition("SELECT * FROM (VALUES (1, NULL), (2, ''), (3, '  '), (4, 'A')) t(K, ID)");
    text.push_str("        - id: checkpoint\n          checkpoint: rows\n  links:\n    - id: projected\n      checkpoint: rows\n      steps:\n        - id: project\n          sql: SELECT ID FROM input\n      from: { entityType: 'https://example.com/entity/v/1', column: ID }\n      to: { entityType: 'https://example.com/entity/v/1', column: ID }\n      linkType: https://example.com/link/v/1\n");
    let fixture = Fixture::new(&text).await;
    let prepared = fixture.prepare().await;
    assert_eq!(
        prepared
            .targets
            .iter()
            .map(|target| target.without_id)
            .collect::<Vec<_>>(),
        [3, 3]
    );
    let rows = fixture
        .workspace
        .query("SELECT kind, target, key, issue FROM _issues ORDER BY kind, key".into())
        .await
        .expect("should read missing rows");
    let text = |value: &str| Value::Text(value.to_owned());
    assert_eq!(
        rows.iter().map(<[_]>::to_vec).collect::<Vec<_>>(),
        vec![
            vec![
                text("entity"),
                text("sink"),
                text("{\"K\":1}"),
                text("missing_id")
            ],
            vec![
                text("entity"),
                text("sink"),
                text("{\"K\":2}"),
                text("missing_id")
            ],
            vec![
                text("entity"),
                text("sink"),
                text("{\"K\":3}"),
                text("missing_id")
            ],
            vec![
                text("link"),
                text("projected"),
                Value::Null,
                text("missing_endpoint")
            ],
            vec![
                text("link"),
                text("projected"),
                Value::Null,
                text("missing_endpoint")
            ],
            vec![
                text("link"),
                text("projected"),
                Value::Null,
                text("missing_endpoint")
            ],
        ]
    );
    fixture
        .workspace
        .close()
        .await
        .expect("should close workspace");
}

#[rstest]
#[case::double("1.0::DOUBLE", "1")]
#[case::decimal("8030.00::DECIMAL(10,2)", "8030")]
#[case::timestamp("TIMESTAMP '2026-11-09 10:30:00'", "2026-11-09T10:30:00Z")]
#[tokio::test]
async fn rows_typed_id_text(#[case] sql: &str, #[case] expected: &str) {
    let fixture = Fixture::new(&definition(&format!("SELECT 1 AS K, {sql} AS ID"))).await;
    fixture.prepare().await;
    let rows = fixture
        .workspace
        .query("SELECT _source_id FROM \"_target/entity/sink\"".into())
        .await
        .expect("should query typed ID");
    assert_eq!(
        rows.iter().collect::<Vec<_>>(),
        [&[Value::Text(expected.to_owned())][..]]
    );
    fixture
        .workspace
        .close()
        .await
        .expect("should close workspace");
}

#[tokio::test]
async fn rows_id_range_boundaries() {
    let mut fixture = Fixture::new(&definition(
        "SELECT range AS K, range AS ID FROM range(150000)",
    ))
    .await;
    fixture.input.namespace = "demo".into();
    let prepared = fixture.prepare().await;
    assert_eq!(prepared.targets[0].without_id, 0);
    let counts = fixture
        .workspace
        .query(
            "SELECT count(*), count(DISTINCT _entity_id), count(*) FILTER (WHERE _source_id <> \
             ID::VARCHAR) FROM \"_target/entity/sink\""
                .into(),
        )
        .await
        .expect("should count joined IDs");
    assert_eq!(
        counts.iter().collect::<Vec<_>>(),
        [&[
            Value::BigInt(150_000),
            Value::BigInt(150_000),
            Value::BigInt(0)
        ][..]]
    );
    let boundaries = fixture
        .workspace
        .query(
            "SELECT ID, _entity_id FROM \"_target/entity/sink\" WHERE ID IN \
             (0,65535,65536,131072,149999) ORDER BY ID"
                .into(),
        )
        .await
        .expect("should read boundary IDs");
    let expected = [
        (0, "6797432a-0e7a-5e1b-93e4-bb7355dd73ee"),
        (0xFFFF, "8357f013-c750-578a-89e4-3c9750b0a40d"),
        (0x0001_0000, "e34f8463-73b1-5a56-914a-d31bd046b4cb"),
        (0x0002_0000, "45229dba-4b5e-5da2-a499-69c04c1cd93a"),
        (149_999, "127d7aa6-bd5b-5d23-9c7c-2e26daefda77"),
    ];
    assert_eq!(
        boundaries.iter().map(<[_]>::to_vec).collect::<Vec<_>>(),
        expected
            .into_iter()
            .map(|(id, uuid)| vec![
                Value::BigInt(id),
                Value::Text(format!("00000000-0000-4000-8000-000000000001~{uuid}"))
            ])
            .collect::<Vec<_>>()
    );
    fixture
        .workspace
        .close()
        .await
        .expect("should close workspace");
}

#[tokio::test]
async fn rows_empty_restore_and_missing_capture() {
    let mut fixture = Fixture::new(&definition("SELECT 1 AS K, 1 AS ID")).await;
    let workspace = fixture
        .context
        .open_workspace(Variables::default())
        .await
        .expect("should open empty workspace");
    let empty = prepare_rows(
        &fixture.context,
        &workspace,
        &fixture.input,
        None,
        &fixture.capture,
    )
    .await
    .expect("should prepare empty state");
    assert!(empty.targets.is_empty());
    let tables = workspace
        .query("SELECT table_name FROM information_schema.tables".into())
        .await
        .expect("should inspect empty tables");
    assert_eq!(
        tables.iter().collect::<Vec<_>>(),
        [&[Value::Text("_issues".to_owned())][..]]
    );
    workspace
        .close()
        .await
        .expect("should close empty workspace");
    fixture.capture.sources.clear();
    let failure = prepare_rows(
        &fixture.context,
        &fixture.workspace,
        &fixture.input,
        Some(&fixture.definition),
        &fixture.capture,
    )
    .await
    .expect_err("should require every capture");
    assert_eq!(Code::of(&failure), Some(Code::CaptureMissing));
    fixture
        .workspace
        .close()
        .await
        .expect("should close workspace");
}
