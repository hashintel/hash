use alloc::collections::BTreeMap;

use duckdb::types::Value;
use hash_integrations_definition::{Definition, Variables};
use rstest::rstest;
use similar_asserts::assert_eq;
use tempfile::TempDir;
use time::macros::datetime;

use super::{Counts, check_archive_limit, check_duplicates, label, totals, union_rows};
use crate::{
    ArtifactRef, Code, StageError, Workspace,
    run::tests::context,
    sources::CapturedSource,
    stage::{
        capture::CaptureOutput,
        diff::{BASE, CARRIED, DiffCounts, RESEND, RESULT, ROWS, TargetRows},
    },
};

// These rows and expectations are transcribed from stage-2-diff.md, fixture F. The small
// IDs and hashes are opaque inputs to classification, not producer hash expectations.
const CURRENT: &str = "SELECT * FROM (VALUES
    ('e01', 'entity', 'open', 's01', 'h1'),
    ('e02', 'entity', 'open', 's02', 'h1'),
    ('e03', 'entity', 'open', 's03', 'h2'),
    ('e04', 'entity', 'open', 's04', 'h1'),
    ('e05', 'entity', 'open', 's05', 'h1'),
    ('e06', 'entity', 'open', 's06', 'h1'),
    ('e07', 'entity', 'renamed', 's07', 'h1')
    ) AS t(entity_id, kind, target, source_id, content_hash)";
const PRIOR: &str = "SELECT * FROM (VALUES
    ('e02', 'entity', 'open', 's02', 'h1', false),
    ('e03', 'entity', 'open', 's03', 'h1', true),
    ('e04', 'entity', 'open', 's04', 'h1', true),
    ('e05', 'entity', 'open', 's05', 'h1', true),
    ('e07', 'entity', 'old', 's07', 'h1', true),
    ('e08', 'entity', 'open', 's08', 'h1', true),
    ('e09', 'entity', 'guarded', 's09', 'h1', true),
    ('e10', 'entity', 'guarded', 's10', 'h1', true),
    ('e11', 'entity', 'open', 's11', 'h1', false),
    ('e12', 'entity', 'open', 's12', 'h1', false),
    ('e14', 'link', 'old-link', 's14', 'h1', true)
    ) AS t(entity_id, kind, target, source_id, content_hash, live)";
const FAILED: &str = "SELECT * FROM (VALUES
    ('e06', 'entity', 'open', 's06', 'h9'),
    ('e13', 'link', 'lost', 's13', 'h9')
    ) AS t(entity_id, kind, target, source_id, content_hash)";
const RETRIES: &str = "SELECT * FROM (VALUES ('e05'), ('e06'), ('e10'), ('e12'), ('e13'))
    AS t(entity_id)";
const EXPECTED: [&str; 14] = [
    "e01|entity|open|s01|h1|true|insert|true|false|false",
    "e02|entity|open|s02|h1|true|update|true|false|false",
    "e03|entity|open|s03|h2|true|update|true|true|false",
    "e04|entity|open|s04|h1|true|-|true|true|false",
    "e05|entity|open|s05|h1|true|resend|true|true|true",
    "e06|entity|open|s06|h1|true|insert|true|false|true",
    "e07|entity|renamed|s07|h1|true|-|true|true|false",
    "e08|entity|open|s08|h1|false|archive|false|true|false",
    "e09|entity|guarded|s09|h1|true|-|false|true|false",
    "e10|entity|guarded|s10|h1|false|archive|false|true|true",
    "e11|entity|open|s11|h1|false|-|false|false|false",
    "e12|entity|open|s12|h1|false|archive|false|false|true",
    "e13|link|lost|s13|h9|false|archive|false|false|true",
    "e14|link|old-link|s14|h1|true|-|false|true|false",
];

async fn table(workspace: &Workspace, name: &str, sql: &str) {
    workspace
        .create_table(name.into(), sql.into())
        .await
        .expect("should create predecessor table");
}

fn target(name: &str, sources: &[&str]) -> TargetRows {
    TargetRows {
        target: name.parse().expect("should parse fixture target"),
        table: format!("_target/{name}").into(),
        columns: Vec::new(),
        sources: sources
            .iter()
            .map(|name| name.parse().expect("should parse fixture source"))
            .collect(),
        without_id: 0,
    }
}

fn capture(sources: &[(&str, u64)]) -> CaptureOutput {
    // Classification consumes only the predecessor's row counts. This reference is never read.
    let file: ArtifactRef = serde_json::from_value(serde_json::json!({
        "version": "v1",
        "value": {
            "key": "fixture/sha256/00/0000000000000000000000000000000000000000000000000000000000000000.parquet",
            "sha256": "0000000000000000000000000000000000000000000000000000000000000000",
            "size": 0,
            "format": "parquet"
        }
    }))
    .expect("should deserialize fixture capture reference");
    CaptureOutput {
        captured_at: datetime!(2026-11-06 12:00 UTC),
        sources: sources
            .iter()
            .map(|(name, rows)| {
                (
                    name.parse().expect("should parse captured source name"),
                    CapturedSource {
                        file: file.clone(),
                        rows: *rows,
                    },
                )
            })
            .collect(),
        adopted_from: None,
    }
}

async fn labels(workspace: &Workspace) -> Vec<String> {
    let rows = workspace
        .query(
            format!(
                "SELECT concat_ws('|', entity_id, kind, target, source_id, content_hash, live,
                coalesce(change, '-'), present, was_live, resend)
             FROM \"{RESULT}\" ORDER BY entity_id"
            )
            .into_boxed_str(),
        )
        .await
        .expect("should read classified rows");
    rows.iter()
        .map(|row| match row {
            [Value::Text(text)] => text.clone(),
            _ => panic!("should return one formatted classification per row"),
        })
        .collect()
}

async fn fixture(workspace: &Workspace) {
    for (name, sql) in [
        (ROWS, CURRENT),
        (BASE, PRIOR),
        (CARRIED, FAILED),
        (RESEND, RETRIES),
    ] {
        table(workspace, name, sql).await;
    }
}

fn definition() -> Definition {
    Definition::from_yaml(
        r#"connector: "labels"
sources:
  some: { primaryKey: [ID], sql: 'SELECT 1 AS ID', coverage: partial }
  none: { primaryKey: [ID], sql: 'SELECT 1 AS ID WHERE false' }
  full: { primaryKey: [ID], sql: 'SELECT 1 AS ID' }
  gone: { primaryKey: [ID], sql: 'SELECT 1 AS ID WHERE false', coverage: complete-or-empty }
  missing-complete: { primaryKey: [ID], sql: 'SELECT 1 AS ID' }
  missing-partial: { primaryKey: [ID], sql: 'SELECT 1 AS ID', coverage: partial }
pipelines:
  entities:
    - { source: some, steps: [{ id: cp-some, checkpoint: cp-some }] }
    - { source: none, steps: [{ id: cp-none, checkpoint: cp-none }] }
    - { source: full, steps: [{ id: cp-full, checkpoint: cp-full }] }
    - { source: gone, steps: [{ id: cp-gone, checkpoint: cp-gone }] }
    - { source: missing-complete, steps: [{ id: cp-complete, checkpoint: cp-complete }] }
    - { source: missing-partial, steps: [{ id: cp-partial, checkpoint: cp-partial }] }
"#,
    )
    .expect("should parse coverage definition")
}

#[rstest]
#[case::ordinary(false)]
#[case::reconcile(true)]
#[tokio::test]
async fn fixture_f_labels_and_totals(#[case] resend_all: bool) {
    let directory = TempDir::new().expect("should create fixture directory");
    let workspace = context(directory.path())
        .open_workspace(Variables::default())
        .await
        .expect("should open fixture workspace");
    fixture(&workspace).await;
    let targets = [
        target("entity/guarded", &["some"]),
        target("entity/open", &["full"]),
        target("entity/renamed", &["full"]),
    ];
    label(
        &workspace,
        &targets,
        Some(&definition()),
        &capture(&[("some", 5), ("full", 3)]),
        resend_all,
    )
    .await
    .expect("should label fixture F");
    let mut expected = EXPECTED;
    if resend_all {
        // The specification names precisely these three changes for resend-all.
        expected[3] = "e04|entity|open|s04|h1|true|resend|true|true|false";
        expected[6] = "e07|entity|renamed|s07|h1|true|resend|true|true|false";
        expected[10] = "e11|entity|open|s11|h1|false|archive|false|false|false";
    }
    assert_eq!(labels(&workspace).await, expected);
    let actual_totals = totals(&workspace).await.expect("should count fixture F");
    let actual = actual_totals
        .into_iter()
        .map(|(target, total)| {
            (
                target.to_string(),
                [
                    total.diff.inserted,
                    total.diff.updated,
                    total.diff.resent,
                    total.diff.unchanged,
                    total.diff.archived,
                    total.limited_archives,
                    total.live_base,
                ],
            )
        })
        .collect::<Vec<_>>();
    let (open, renamed) = if resend_all {
        ([2, 2, 2, 0, 3, 1, 4], [0, 0, 1, 0, 0, 0, 1])
    } else {
        ([2, 2, 1, 1, 2, 1, 4], [0, 0, 0, 1, 0, 0, 1])
    };
    assert_eq!(
        actual,
        [
            ("entity/guarded".to_owned(), [0, 0, 0, 0, 1, 0, 2]),
            ("entity/open".to_owned(), open),
            ("entity/renamed".to_owned(), renamed),
            ("link/lost".to_owned(), [0, 0, 0, 0, 1, 0, 0]),
            ("link/old-link".to_owned(), [0, 0, 0, 0, 0, 0, 1]),
        ]
    );
    workspace
        .close()
        .await
        .expect("should close fixture workspace");
}

#[rstest]
#[case::no_protection(false)]
#[case::restore_to_empty(true)]
#[tokio::test]
async fn fixture_f_without_protection(#[case] restore_to_empty: bool) {
    let directory = TempDir::new().expect("should create fixture directory");
    let workspace = context(directory.path())
        .open_workspace(Variables::default())
        .await
        .expect("should open fixture workspace");
    table(&workspace, BASE, PRIOR).await;
    table(&workspace, CARRIED, FAILED).await;
    table(&workspace, RESEND, RETRIES).await;
    table(
        &workspace,
        ROWS,
        &format!("SELECT * FROM ({CURRENT}) WHERE {}", !restore_to_empty),
    )
    .await;
    label(&workspace, &[], None, &capture(&[]), false)
        .await
        .expect("should label unprotected fixture");
    if restore_to_empty {
        assert_eq!(
            labels(&workspace).await,
            [
                "e02|entity|open|s02|h1|false|-|false|false|false",
                "e03|entity|open|s03|h1|false|archive|false|true|false",
                "e04|entity|open|s04|h1|false|archive|false|true|false",
                "e05|entity|open|s05|h1|false|archive|false|true|true",
                "e06|entity|open|s06|h9|false|archive|false|false|true",
                "e07|entity|old|s07|h1|false|archive|false|true|false",
                "e08|entity|open|s08|h1|false|archive|false|true|false",
                "e09|entity|guarded|s09|h1|false|archive|false|true|false",
                "e10|entity|guarded|s10|h1|false|archive|false|true|true",
                "e11|entity|open|s11|h1|false|-|false|false|false",
                "e12|entity|open|s12|h1|false|archive|false|false|true",
                "e13|link|lost|s13|h9|false|archive|false|false|true",
                "e14|link|old-link|s14|h1|false|archive|false|true|false",
            ]
        );
    } else {
        let mut expected = EXPECTED;
        expected[8] = "e09|entity|guarded|s09|h1|false|archive|false|true|false";
        expected[13] = "e14|link|old-link|s14|h1|false|archive|false|true|false";
        assert_eq!(labels(&workspace).await, expected);
    }
    workspace
        .close()
        .await
        .expect("should close fixture workspace");
}

#[tokio::test]
async fn mixed_coverage_protects_removed_targets_but_resend_overrides() {
    let directory = TempDir::new().expect("should create coverage directory");
    let workspace = context(directory.path())
        .open_workspace(Variables::default())
        .await
        .expect("should open coverage workspace");
    table(&workspace, ROWS, &format!("{CURRENT} WHERE false")).await;
    table(&workspace, CARRIED, &format!("{FAILED} WHERE false")).await;
    table(&workspace, RESEND, "SELECT 'retry'::VARCHAR AS entity_id").await;
    table(
        &workspace,
        BASE,
        "SELECT * FROM (VALUES
        ('a', 'entity', 'a', 'a', 'h', true),
        ('b', 'entity', 'b', 'b', 'h', true),
        ('c', 'entity', 'c', 'c', 'h', true),
        ('d', 'entity', 'd', 'd', 'h', true),
        ('e', 'link', 'e', 'e', 'h', true),
        ('f', 'link', 'f', 'f', 'h', true),
        ('g', 'entity', 'g', 'g', 'h', true),
        ('h', 'entity', 'h', 'h', 'h', true),
        ('i', 'entity', 'i', 'i', 'h', true),
        ('removed', 'link', 'removed', 'removed', 'h', true),
        ('retry', 'entity', 'a', 'retry', 'h', true)
        ) AS t(entity_id, kind, target, source_id, content_hash, live)",
    )
    .await;
    let targets = [
        target("entity/a", &["some"]),
        target("entity/b", &["none"]),
        target("entity/c", &["full"]),
        target("entity/d", &["gone"]),
        target("link/e", &["full", "none"]),
        target("link/f", &[]),
        target("entity/g", &["unknown"]),
        target("entity/h", &["missing-complete"]),
        target("entity/i", &["missing-partial"]),
    ];
    label(
        &workspace,
        &targets,
        Some(&definition()),
        &capture(&[("some", 5), ("none", 0), ("full", 3), ("gone", 0)]),
        true,
    )
    .await
    .expect("should apply mixed coverage even when resending everything");
    assert_eq!(
        labels(&workspace).await,
        [
            "a|entity|a|a|h|true|-|false|true|false",
            "b|entity|b|b|h|true|-|false|true|false",
            "c|entity|c|c|h|false|archive|false|true|false",
            "d|entity|d|d|h|false|archive|false|true|false",
            "e|link|e|e|h|true|-|false|true|false",
            "f|link|f|f|h|false|archive|false|true|false",
            "g|entity|g|g|h|true|-|false|true|false",
            "h|entity|h|h|h|false|archive|false|true|false",
            "i|entity|i|i|h|true|-|false|true|false",
            "removed|link|removed|removed|h|true|-|false|true|false",
            "retry|entity|a|retry|h|false|archive|false|true|true",
        ]
    );
    workspace
        .close()
        .await
        .expect("should close coverage workspace");
}

#[rstest]
#[case::empty(0, 0, 0, 0, None)]
#[case::absolute_boundary(1_000, 1_000, 0, 0, None)]
#[case::half_boundary(1_001, 2_002, 0, 0, None)]
#[case::above_half(1_001, 2_001, 0, 0, Some("entity"))]
#[case::above_both(1_001, 1_001, 0, 0, Some("entity"))]
#[case::link_limit(0, 10, 1_500, 2_000, Some("link"))]
#[case::kinds_separate(600, 600, 600, 600, None)]
fn archive_limit_boundaries(
    #[case] entity_archives: u64,
    #[case] entity_live: u64,
    #[case] link_archives: u64,
    #[case] link_live: u64,
    #[case] failure_kind: Option<&str>,
) {
    let counts = BTreeMap::from([
        (
            "entity/a".parse().expect("should parse entity target"),
            Counts {
                diff: DiffCounts::default(),
                limited_archives: entity_archives,
                live_base: entity_live,
            },
        ),
        (
            "link/a".parse().expect("should parse link target"),
            Counts {
                diff: DiffCounts::default(),
                limited_archives: link_archives,
                live_base: link_live,
            },
        ),
    ]);
    let result = check_archive_limit(&counts);
    if let Some(kind) = failure_kind {
        let error = result.expect_err("should reject excessive archives");
        assert_eq!(Code::of(&error), Some(Code::ArchiveLimit));
        assert_eq!(*error.current_context(), StageError::Permanent);
        assert!(format!("{error:?}").contains(kind));
    } else {
        result.expect("should permit archives within per-kind limit");
    }
}

#[tokio::test]
async fn archive_limit_aggregates_targets_and_excludes_resend_and_tombstones() {
    let directory = TempDir::new().expect("should create archive directory");
    let workspace = context(directory.path())
        .open_workspace(Variables::default())
        .await
        .expect("should open archive workspace");
    table(&workspace, ROWS, &format!("{CURRENT} WHERE false")).await;
    table(&workspace, CARRIED, &format!("{FAILED} WHERE false")).await;
    table(
        &workspace,
        BASE,
        "SELECT range::VARCHAR AS entity_id, 'entity'::VARCHAR AS kind,
        CASE WHEN range < 500 THEN 'first' ELSE 'second' END AS target,
        range::VARCHAR AS source_id, 'h'::VARCHAR AS content_hash, range < 3000 AS live
        FROM range(5000)",
    )
    .await;
    table(
        &workspace,
        RESEND,
        "SELECT range::VARCHAR AS entity_id FROM range(1000, 5000)",
    )
    .await;
    label(&workspace, &[], None, &capture(&[]), false)
        .await
        .expect("should label archive population");
    let mut counts = totals(&workspace)
        .await
        .expect("should count archive population");
    assert_eq!(
        counts
            .values()
            .map(|total| total.diff.archived)
            .sum::<u64>(),
        5_000
    );
    assert_eq!(
        counts
            .values()
            .map(|total| total.limited_archives)
            .sum::<u64>(),
        1_000
    );
    assert_eq!(
        counts.values().map(|total| total.live_base).sum::<u64>(),
        3_000
    );
    check_archive_limit(&counts).expect("should exclude resend-set and tombstone archives");
    // Per-kind aggregation must cross the limit even though neither target does alone.
    for count in counts.values_mut() {
        count.limited_archives = 600;
        count.live_base = 600;
    }
    let error = check_archive_limit(&counts).expect_err("should combine targets of one kind");
    assert_eq!(Code::of(&error), Some(Code::ArchiveLimit));
    workspace
        .close()
        .await
        .expect("should close archive workspace");
}

#[rstest]
#[case::empty(false)]
#[case::two_targets(true)]
#[tokio::test]
async fn target_union_and_fresh_inserts(#[case] with_targets: bool) {
    let directory = TempDir::new().expect("should create union directory");
    let workspace = context(directory.path())
        .open_workspace(Variables::default())
        .await
        .expect("should open union workspace");
    let targets = if with_targets {
        let targets = vec![target("entity/a", &[]), target("link/b", &[])];
        table(
            &workspace,
            &targets[0].table,
            "SELECT 'e1' AS _entity_id, 's1' AS _source_id,
            'h1' AS _content_hash, 'n' AS NAME",
        )
        .await;
        table(
            &workspace,
            &targets[1].table,
            "SELECT 'e2' AS _entity_id, 's2' AS _source_id,
            'h2' AS _content_hash, 'e1' AS _left_entity_id, 'e1' AS _right_entity_id",
        )
        .await;
        targets
    } else {
        Vec::new()
    };
    union_rows(&workspace, &targets)
        .await
        .expect("should union target rows");
    check_duplicates(&workspace)
        .await
        .expect("should have unique identities");
    let rows = workspace
        .query(format!("SELECT * FROM \"{ROWS}\" ORDER BY entity_id").into_boxed_str())
        .await
        .expect("should inspect union schema");
    assert_eq!(
        rows.columns()
            .iter()
            .map(AsRef::<str>::as_ref)
            .collect::<Vec<_>>(),
        ["entity_id", "kind", "target", "source_id", "content_hash"]
    );
    assert_eq!(rows.iter().len(), if with_targets { 2 } else { 0 });
    table(&workspace, BASE, &format!("{PRIOR} WHERE false")).await;
    table(&workspace, CARRIED, &format!("{FAILED} WHERE false")).await;
    table(&workspace, RESEND, &format!("{RETRIES} WHERE false")).await;
    label(&workspace, &targets, None, &capture(&[]), false)
        .await
        .expect("should label new rows");
    let expected: &[&str] = if with_targets {
        &[
            "e1|entity|a|s1|h1|true|insert|true|false|false",
            "e2|link|b|s2|h2|true|insert|true|false|false",
        ]
    } else {
        &[]
    };
    assert_eq!(labels(&workspace).await, expected);
    workspace
        .close()
        .await
        .expect("should close union workspace");
}

#[tokio::test]
async fn duplicate_id_guard_is_global_and_reports_bounded_examples() {
    let directory = TempDir::new().expect("should create duplicates directory");
    let workspace = context(directory.path())
        .open_workspace(Variables::default())
        .await
        .expect("should open duplicates workspace");
    table(
        &workspace,
        ROWS,
        "SELECT * FROM (VALUES
        ('e1', 'entity', 'a'), ('e1', 'link', 'b'),
        ('e2', 'entity', 'a'), ('e2', 'entity', 'a'), ('e2', 'entity', 'a'),
        ('e3', 'entity', 'a'), ('e4', 'entity', 'a'), ('e4', 'entity', 'a'),
        ('e5', 'entity', 'a'), ('e5', 'entity', 'a'),
        ('e6', 'entity', 'a'), ('e6', 'entity', 'a'),
        ('e7', 'entity', 'a'), ('e7', 'entity', 'a'),
        ('e8', 'entity', 'a'), ('e8', 'entity', 'a')
        ) AS t(entity_id, kind, target)",
    )
    .await;
    let error = check_duplicates(&workspace)
        .await
        .expect_err("should reject globally repeated IDs");
    assert_eq!(Code::of(&error), Some(Code::DuplicateEntityId));
    assert_eq!(*error.current_context(), StageError::Permanent);
    let diagnostic = format!("{error:?}");
    assert!(diagnostic.contains("7 duplicate entity IDs"));
    assert!(diagnostic.contains("e1: 2 rows, targets entity/a through link/b"));
    assert!(diagnostic.contains("e2: 3 rows, targets entity/a through entity/a"));
    for included in ["e4:", "e5:", "e6:"] {
        assert!(diagnostic.contains(included));
    }
    for excluded in ["e3:", "e7:", "e8:"] {
        assert!(!diagnostic.contains(excluded));
    }
    workspace
        .close()
        .await
        .expect("should close duplicates workspace");
}
