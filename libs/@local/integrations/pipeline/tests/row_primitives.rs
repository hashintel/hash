//! Target hashing and reserved-name behavior at the workspace preparation boundary.

extern crate alloc;

use alloc::collections::BTreeMap;

use duckdb::types::Value;
use error_stack::Report;
use hash_integrations_definition::{Definition, PrimaryKey};
use hash_integrations_pipeline::{PreparationError, TableAssertions, Workspace, WorkspaceConfig};
use rstest::rstest;
use serde_json::Value as JsonValue;
use similar_asserts::assert_eq;
use tempfile::TempDir;

fn definition(properties: &str) -> Definition {
    let mut indented = String::new();
    for line in properties.lines() {
        indented.push_str("              ");
        indented.push_str(line);
        indented.push('\n');
    }
    Definition::from_yaml(&format!(
        r#"connector: "primitives"
unitMaps:
  mass:
    units:
      KG: https://example.com/data-type/kg/v/1
      LB: https://example.com/data-type/lb/v/1
sources:
  source:
    primaryKey: [ID]
    sql: SELECT 1 AS ID
pipelines:
  entities:
    - source: source
      steps:
        - id: alias
          sql: SELECT *, _key AS source_key FROM input
        - id: sink
          sink:
            entityType: https://example.com/entity/v/1
            entityId: ID
            properties:
{indented}        - id: save
          checkpoint: data
  links:
    - id: link
      checkpoint: data
      steps:
        - id: link-alias
          sql: SELECT *, _key AS source_key FROM input
      from: {{ entityType: https://example.com/entity/v/1, column: ID }}
      to: {{ entityType: https://example.com/entity/v/1, column: ID }}
      linkType: https://example.com/link/v/1
      properties:
{}"#,
        indented.replace("              ", "        ")
    ))
    .expect("should parse the target definition")
}

async fn workspace(directory: &TempDir, sql: &str) -> Workspace {
    let workspace = Workspace::open(
        directory.path().join("workspace.duckdb"),
        WorkspaceConfig::default(),
    )
    .await
    .expect("should open the workspace");
    workspace
        .stage_table(
            "source".into(),
            sql.into(),
            PrimaryKey::new(["ID".parse().expect("should parse the ID column")])
                .expect("should construct key"),
            TableAssertions::default(),
        )
        .await
        .expect("should stage the source");
    workspace
}

async fn prepare(
    workspace: &Workspace,
    definition: &Definition,
    link: bool,
) -> Result<Box<str>, Report<PreparationError>> {
    if link {
        workspace
            .prepare_link_pipeline(
                definition
                    .link_pipelines()
                    .first()
                    .expect("should contain a link")
                    .clone(),
                BTreeMap::from([(
                    "data".parse().expect("should parse the checkpoint"),
                    "source".into(),
                )]),
            )
            .await
            .map(|prepared| prepared.table)
    } else {
        workspace
            .prepare_pipeline(
                definition
                    .entity_pipelines()
                    .first()
                    .expect("should contain a pipeline")
                    .clone(),
                "source".into(),
                BTreeMap::new(),
            )
            .await
            .map(|mut prepared| prepared.sinks.remove(0).table)
    }
}

#[rstest]
#[case::metadata("https://example.com/property/v/1: _key")]
#[case::absent("https://example.com/property/v/1: _row")]
#[case::coerced("https://example.com/property/v/1: { column: _OP, coerce: trim }")]
#[case::amount(
    "https://example.com/property/v/1: { amount: _source_id, unit: UNIT, unitMap: mass }"
)]
#[case::unit(
    "https://example.com/property/v/1: { amount: AMOUNT, unit: _right_entity_id, unitMap: mass }"
)]
#[case::precedence("https://example.com/a/v/1: MISSING\nhttps://example.com/z/v/1: _row")]
#[tokio::test]
async fn target_reserved_accessors(
    #[case] properties: &str,
    #[values(false, true)] link: bool,
    #[values(false, true)] empty: bool,
) {
    let directory = TempDir::new().expect("should create workspace directory");
    let source = format!(
        "SELECT 7 AS ID, 1 AS AMOUNT, 'KG' AS UNIT{}",
        if empty { " WHERE false" } else { "" }
    );
    let workspace = workspace(&directory, &source).await;
    let failure = prepare(&workspace, &definition(properties), link)
        .await
        .expect_err("should refuse a reserved property input");
    assert!(
        failure.frames().any(|frame| matches!(
            frame.downcast_ref::<PreparationError>(),
            Some(PreparationError::ReservedColumn { .. })
        )),
        "should preserve reserved-column classification through step context"
    );
    workspace.close().await.expect("should close the workspace");
}

#[rstest]
#[case::rowid("rowid")]
#[case::engine_id("_ENTITY_ID")]
#[tokio::test]
async fn target_reserved_schema(#[case] name: &str, #[values(false, true)] link: bool) {
    let directory = TempDir::new().expect("should create workspace directory");
    let workspace = workspace(&directory, &format!("SELECT 7 AS ID, 1 AS \"{name}\"")).await;
    let failure = prepare(&workspace, &definition("{}"), link)
        .await
        .expect_err("should refuse reserved target columns");
    assert!(failure.frames().any(|frame| matches!(
        frame.downcast_ref::<PreparationError>(),
        Some(PreparationError::ReservedColumn { .. })
    )));
    workspace.close().await.expect("should close the workspace");
}

#[rstest]
#[tokio::test]
async fn target_metadata_alias(#[values(false, true)] link: bool) {
    let directory = TempDir::new().expect("should create workspace directory");
    let workspace = workspace(&directory, "SELECT 7 AS ID").await;
    let table = prepare(
        &workspace,
        &definition("https://example.com/property/v/1: source_key"),
        link,
    )
    .await
    .expect("should accept a non-reserved alias");
    let rows = workspace
        .query(format!("SELECT _key, source_key, _content_hash FROM \"{table}\"").into())
        .await
        .expect("should read target metadata and aliased property");
    let row = rows.iter().next().expect("should contain the source row");
    assert_eq!(
        &row[..2],
        &[
            Value::Text("{\"ID\":7}".into()),
            Value::Text("{\"ID\":7}".into())
        ]
    );
    assert_eq!(
        rows.columns(),
        &[
            Box::from("_key"),
            Box::from("source_key"),
            Box::from("_content_hash")
        ]
    );
    workspace.close().await.expect("should close the workspace");
}

#[tokio::test]
async fn target_hash_external_vectors() {
    let fixture: JsonValue = serde_json::from_str(include_str!("fixtures/fallback-hash.json"))
        .expect("should read independent hash vectors");
    let directory = TempDir::new().expect("should create workspace directory");
    // Literal inputs and canonicalRows originate in the independently supplied labs fixture.
    let workspace = workspace(
        &directory,
        "SELECT * FROM (VALUES
        ('M1', '  padded  ', 1.5::DOUBLE, DATE '2026-01-02'),
        ('M2', '', NULL::DOUBLE, NULL::DATE),
        ('M3', NULL, 2::DOUBLE, DATE '1999-12-31'),
        ('M4', 'NULL', 0.1::DOUBLE, DATE '2026-01-02'),
        ('M5', 'Gr\u{fc}\u{df}e, ''\u{4ed3}\u{5e93}''::x', -3.25::DOUBLE, NULL::DATE)
    ) AS source(ID, MAKTX, BRGEW, ERSDA)",
    )
    .await;
    let definition = definition("https://example.com/c-weight/v/1: BRGEW\nhttps://example.com/a-date/v/1: ERSDA\nhttps://example.com/b-name/v/1: MAKTX");
    for link in [false, true] {
        let table = prepare(&workspace, &definition, link)
            .await
            .expect("should hash the mapped properties");
        let actual = workspace
            .query(format!("SELECT ID, _content_hash FROM \"{table}\" ORDER BY ID").into())
            .await
            .expect("should read hashes");
        let expected: Vec<_> = fixture["canonicalRows"]
            .as_array()
            .expect("should contain literal hashes")
            .iter()
            .map(|row| {
                vec![
                    Value::Text(
                        row["_entity_id"]
                            .as_str()
                            .expect("should name the row")
                            .into(),
                    ),
                    Value::Text(
                        row["_content_hash"]
                            .as_str()
                            .expect("should contain a literal digest")
                            .into(),
                    ),
                ]
            })
            .collect();
        assert_eq!(
            actual.iter().map(<[_]>::to_vec).collect::<Vec<_>>(),
            expected
        );
    }
    workspace.close().await.expect("should close the workspace");
}

#[tokio::test]
async fn target_hash_measure_and_empty() {
    let directory = TempDir::new().expect("should create workspace directory");
    let workspace = workspace(
        &directory,
        "SELECT * FROM (VALUES (1, 7, 'KG'), (2, 7, 'LB'), (3, 8, 'KG')) AS source(ID, AMOUNT, \
         UNIT)",
    )
    .await;
    let measure = definition(
        "https://example.com/property/v/1: { amount: AMOUNT, unit: UNIT, unitMap: mass }",
    );
    for link in [false, true] {
        let table = prepare(&workspace, &measure, link)
            .await
            .expect("should hash both measure inputs");
        let actual = workspace
            .query(format!("SELECT count(DISTINCT _content_hash) FROM \"{table}\"").into())
            .await
            .expect("should read distinct hashes");
        assert_eq!(actual.iter().next(), Some([Value::BigInt(3)].as_slice()));
        let table = prepare(&workspace, &definition("{}"), link)
            .await
            .expect("should hash no mapped properties");
        let actual = workspace
            .query(format!("SELECT DISTINCT _content_hash FROM \"{table}\"").into())
            .await
            .expect("should read empty-property hashes");
        assert_eq!(
            actual.iter().next(),
            Some([Value::Text("d41d8cd98f00b204e9800998ecf8427e".into())].as_slice())
        );
    }
    workspace.close().await.expect("should close the workspace");
}
