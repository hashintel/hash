//! Assert persisted seams against the reviewed scenario manifest, without producer snapshots.

use alloc::collections::BTreeMap;

use duckdb::types::Value as Cell;
use serde_json::{Value, json};
use similar_asserts::assert_eq;

use super::expected::{BASE, Fixtures, array, number, text};
use crate::{
    ArtifactRef, Rows, RunContext, Target, Workspace,
    graph::OperationKind,
    run::{table::load_table, tests::fixtures},
    sql::{Identifier, literal},
    stage::{capture::CaptureOutput, diff::DiffOutput, plan::PlanOutput},
};

pub(super) type HashRows = BTreeMap<String, (String, bool)>;

async fn read(
    context: &RunContext,
    workspace: &Workspace,
    artifact: &ArtifactRef,
    table: &str,
    columns: &[(&str, &str)],
) -> Rows {
    load_table(context, workspace, artifact, table.into())
        .await
        .expect("should load the durable table");
    let actual = workspace
        .query(
            format!(
                "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = \
                 {} ORDER BY ordinal_position",
                literal(table)
            )
            .into_boxed_str(),
        )
        .await
        .expect("should read the decoded schema");
    let expected: Vec<_> = columns
        .iter()
        .map(|(name, kind)| vec![Cell::Text((*name).into()), Cell::Text((*kind).into())])
        .collect();
    assert_eq!(
        actual.iter().map(<[_]>::to_vec).collect::<Vec<_>>(),
        expected
    );
    workspace
        .query(format!("SELECT * FROM {} ORDER BY rowid", Identifier::new(table)).into_boxed_str())
        .await
        .expect("should read the persisted order")
}

pub(super) async fn captures(
    context: &RunContext,
    workspace: &Workspace,
    fixture: &Fixtures,
    variant: Option<&str>,
    captured: &CaptureOutput,
) {
    let Some(variant) = variant else {
        assert!(
            captured.sources.is_empty(),
            "should capture no sources for empty restore"
        );
        return;
    };
    assert_eq!(captured.sources.len(), 2);
    for (source, captured) in &captured.sources {
        let source = source.to_string();
        let expected = json!({"schema":format!("capture_{source}"), "rows":fixture.source_rows(variant,&source)});
        assert_eq!(captured.rows, array(&expected["rows"]).len() as u64);
        fixtures::assert_table(
            context,
            workspace,
            &captured.file,
            &format!("capture/{source}"),
            &expected,
        )
        .await;
    }
}

fn desired(fixture: &Fixtures, scenario: &str, run: u64) -> BTreeMap<String, bool> {
    let mut wanted: BTreeMap<_, _> = BASE
        .into_iter()
        .map(|alias| (alias.to_owned(), true))
        .collect();
    let archived: &[&str] = match (scenario, run) {
        ("S3", 2) | ("S9", 3 | 4) => &["AC-N100", "L-N100-ESSA"],
        ("S3", 5) | ("S5", 2) => &["AC-SEXXX", "AC-N100", "L-N100-ESSA", "L-SEXXX-ESSA"],
        ("S7", 2) => &["AC-SEXXX", "L-SEXXX-ESSA"],
        ("S7", 3) => &["AC-GABCD", "L-GABCD-ESSB"],
        ("S8", 2) => &["AF-ESSB"],
        ("S8", 3) => &["AF-ESGG"],
        ("S8", 4) => &[
            "AC-SEXXX",
            "AC-N100",
            "AF-ESSB",
            "AF-ESSA",
            "L-N100-ESSA",
            "L-SEXXX-ESSA",
            "AF-ESGG",
        ],
        _ => &[],
    };
    let added: &[&str] = match (scenario, run) {
        ("S5", 2) => &["AC2-SEXXX", "AC2-N100", "L2-SEXXX-ESSA", "L2-N100-ESSA"],
        ("S7", 2 | 3) => &["AC-GABCD", "L-GABCD-ESSB"],
        ("S8", 2..=4) => &["AF-ESGG"],
        _ => &[],
    };
    wanted.extend(added.iter().map(|alias| ((*alias).into(), true)));
    for alias in archived {
        wanted.insert((*alias).into(), false);
    }
    wanted
        .into_iter()
        .map(|(alias, live)| (text(&fixture.identity(&alias)["entity_id"]).into(), live))
        .collect()
}

pub(super) async fn hashes(
    context: &RunContext,
    workspace: &Workspace,
    fixture: &Fixtures,
    scenario: &str,
    expected: &Value,
    output: &DiffOutput,
    history: &BTreeMap<u64, HashRows>,
) -> HashRows {
    let rows = read(
        context,
        workspace,
        &output.hashes,
        "hashes",
        &[
            ("entity_id", "VARCHAR"),
            ("kind", "VARCHAR"),
            ("target", "VARCHAR"),
            ("source_id", "VARCHAR"),
            ("content_hash", "VARCHAR"),
            ("live", "BOOLEAN"),
        ],
    )
    .await;
    let run = number(&expected["number"]);
    let wanted = desired(fixture, scenario, run);
    let mut hashes = BTreeMap::new();
    let mut ordered = Vec::new();
    for row in rows.iter() {
        let [
            Cell::Text(id),
            Cell::Text(kind),
            Cell::Text(target),
            Cell::Text(source),
            Cell::Text(hash),
            Cell::Boolean(live),
        ] = row
        else {
            panic!("should preserve hash schema and required cells");
        };
        let (_, identity) = fixture.identities["entities"]
            .as_object()
            .expect("should supply identities")
            .iter()
            .find(|(_, identity)| identity["entity_id"] == id.as_str())
            .expect("should use a specified entity identity");
        assert_eq!(kind, text(&identity["kind"]));
        assert_eq!(source, text(&identity["source_id"]));
        let target_expected =
            if scenario == "S4" && run >= 2 && identity["target"] == "sink-aircraft" {
                "sink-planes"
            } else {
                text(&identity["target"])
            };
        assert_eq!(target, target_expected);
        assert_eq!(wanted.get(id), Some(live));
        assert!(
            hash.len() == 32
                && hash
                    .bytes()
                    .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte)),
            "should preserve lowercase MD5 shape"
        );
        assert!(
            hashes.insert(id.clone(), (hash.clone(), *live)).is_none(),
            "should keep global identities unique"
        );
        ordered.push(id.clone());
    }
    assert_eq!(ordered, wanted.keys().cloned().collect::<Vec<_>>());
    assert_eq!(hashes.len() as u64, number(&expected["hashes"]["total"]));
    assert_eq!(
        hashes.values().filter(|(_, live)| *live).count() as u64,
        number(&expected["hashes"]["live"])
    );
    compare_hashes(fixture, expected, &hashes, history);
    hashes
}

fn compare_hashes(
    fixture: &Fixtures,
    run: &Value,
    hashes: &HashRows,
    history: &BTreeMap<u64, HashRows>,
) {
    let rules = &run["hashes"];
    if let Some(reference) = rules["equal_to_run"].as_u64() {
        assert_eq!(hashes, &history[&reference]);
    }
    for rule in [
        "same_content_hashes_as_run",
        "original_six_hashes_equal_to_run",
    ] {
        if let Some(reference) = rules[rule].as_u64() {
            for alias in BASE {
                let id = text(&fixture.identity(alias)["entity_id"]);
                assert_eq!(hashes[id].0, history[&reference][id].0);
            }
        }
    }
    if let Some(changed) = rules["different_from_previous"].as_array() {
        let previous = &history[&(number(&run["number"]) - 1)];
        for (id, (hash, _)) in hashes {
            let changed = changed
                .iter()
                .any(|alias| fixture.identity(text(alias))["entity_id"] == id.as_str());
            assert_eq!(
                hash != &previous[id].0,
                changed,
                "should match the independently specified hash change"
            );
        }
    }
}

pub(super) async fn diff_rows(
    context: &RunContext,
    workspace: &Workspace,
    fixture: &Fixtures,
    scenario: &str,
    run: &Value,
    output: &DiffOutput,
) {
    let mut archives = Vec::new();
    let mut changes: BTreeMap<String, Vec<(&str, &str)>> = BTreeMap::new();
    for group in array(&run["writes"]) {
        let [operation, change, _, aliases] = array(group) else {
            panic!("should specify write group");
        };
        for alias in array(aliases).iter().map(text) {
            let identity = fixture.identity(alias);
            let target = run["target_overrides"]
                .get(alias)
                .unwrap_or_else(|| &identity["target"]);
            if text(operation).starts_with("archive_") {
                archives.push(json!([
                    identity["entity_id"],
                    identity["kind"],
                    target,
                    identity["source_id"]
                ]));
            } else {
                changes
                    .entry(format!("{}/{}", text(&identity["kind"]), text(target)))
                    .or_default()
                    .push((alias, text(change)));
            }
        }
    }
    archives.sort_by(|left, right| {
        (text(&left[1]), text(&left[0])).cmp(&(text(&right[1]), text(&right[0])))
    });
    fixtures::assert_table(
        context,
        workspace,
        &output.archives,
        "archives",
        &json!({"schema":"archives","rows":archives}),
    )
    .await;
    fixtures::assert_table(
        context,
        workspace,
        &output.issues,
        "diff_issues",
        &json!({"schema":"issues","rows":[]}),
    )
    .await;
    let present: Vec<_> = output
        .targets
        .iter()
        .filter(|(_, output)| output.changes.is_some())
        .map(|(target, _)| target.to_string())
        .collect();
    assert_eq!(present, changes.keys().cloned().collect::<Vec<_>>());
    for (target, mut aliases) in changes {
        aliases.sort_by_key(|(alias, _)| text(&fixture.identity(alias)["entity_id"]));
        let target_id: Target = target.parse().expect("should parse expected target");
        let actual = &output.targets[&target_id];
        let artifact = actual
            .changes
            .as_ref()
            .expect("should produce the expected changed rows");
        assert_eq!(
            actual.counts.inserted,
            aliases
                .iter()
                .filter(|(_, change)| *change == "insert")
                .count() as u64
        );
        assert_eq!(
            actual.counts.updated,
            aliases
                .iter()
                .filter(|(_, change)| *change == "update")
                .count() as u64
        );
        assert_eq!(
            actual.counts.resent,
            aliases
                .iter()
                .filter(|(_, change)| *change == "resend")
                .count() as u64
        );
        changed_rows(
            context,
            workspace,
            fixture,
            scenario,
            run,
            (&target, artifact),
            &aliases,
        )
        .await;
    }
    for target in output.targets.values() {
        assert_eq!(target.counts.without_id, 0);
    }
}

async fn changed_rows(
    context: &RunContext,
    workspace: &Workspace,
    fixture: &Fixtures,
    scenario: &str,
    run: &Value,
    (target, artifact): (&str, &ArtifactRef),
    aliases: &[(&str, &str)],
) {
    let link = target.starts_with("link/");
    let aircraft = target.ends_with("sink-aircraft") || target.ends_with("sink-planes");
    let mut columns = vec![
        ("_row", "UBIGINT"),
        ("_entity_id", "VARCHAR"),
        ("_change", "VARCHAR"),
        ("_source_id", "VARCHAR"),
        ("_key", "VARCHAR"),
    ];
    let properties: &[&str] = if link {
        &[]
    } else if aircraft {
        if scenario == "S4" && number(&run["number"]) == 3 {
            &["EMPTY_MASS", "MASS_UNIT", "FIRST_FLIGHT"]
        } else {
            &["EMPTY_MASS", "MASS_UNIT", "FIRST_FLIGHT", "MODEL"]
        }
    } else {
        &["FIELD_NAME"]
    };
    if link {
        columns.extend([
            ("_left_entity_id", "VARCHAR"),
            ("_right_entity_id", "VARCHAR"),
        ]);
    }
    columns.extend(properties.iter().map(|name| (*name, "VARCHAR")));
    let actual = read(context, workspace, artifact, target, &columns).await;
    let expected: Vec<Vec<Cell>> = aliases
        .iter()
        .enumerate()
        .map(|(index, (alias, change))| {
            let identity = fixture.identity(alias);
            let values = fixture.source_values(
                Fixtures::variant(scenario, run).expect("should have a definition"),
                alias,
            );
            let key = if aircraft || link {
                json!({"TAIL":values["TAIL"]})
            } else {
                json!({"ICAO":values["ICAO"]})
            };
            let mut row = vec![
                Cell::UBigInt(index as u64),
                Cell::Text(text(&identity["entity_id"]).into()),
                Cell::Text((*change).into()),
                Cell::Text(text(&identity["source_id"]).into()),
                Cell::Text(
                    serde_json::to_string(&key).expect("should encode expected primary key"),
                ),
            ];
            if link {
                row.extend([
                    Cell::Text(text(&identity["left_entity_id"]).into()),
                    Cell::Text(text(&identity["right_entity_id"]).into()),
                ]);
            }
            row.extend(
                properties
                    .iter()
                    .map(|name| Cell::Text(text(&values[*name]).into())),
            );
            row
        })
        .collect();
    assert_eq!(
        actual.iter().map(<[_]>::to_vec).collect::<Vec<_>>(),
        expected
    );
}

pub(super) async fn plan_rows(
    context: &RunContext,
    workspace: &Workspace,
    expected: &Value,
    output: &PlanOutput,
) {
    fixtures::assert_table(context, workspace, &output.writes, "writes", expected).await;
    fixtures::assert_table(
        context,
        workspace,
        &output.issues,
        "plan_issues",
        &json!({"schema":"issues","rows":[]}),
    )
    .await;
    let mut counts = BTreeMap::from([
        (OperationKind::UpsertEntity, 0),
        (OperationKind::UpsertLink, 0),
        (OperationKind::ArchiveLink, 0),
        (OperationKind::ArchiveEntity, 0),
    ]);
    for row in array(&expected["rows"]) {
        *counts
            .get_mut(&OperationKind::from_stored(text(&row[2])).expect("should specify operation"))
            .expect("should cover every operation") += 1;
    }
    assert_eq!(output.counts, counts);
    let batches = array(&expected["rows"])
        .last()
        .map_or(0, |row| number(&row[1]) + 1);
    assert_eq!(u64::from(output.batches), batches);
}
