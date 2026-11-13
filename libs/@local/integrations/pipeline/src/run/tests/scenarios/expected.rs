//! Independent scenario inputs and expected checkpoint rows.

use alloc::collections::BTreeMap;

use serde_json::{Value, json};
use time::{Duration, OffsetDateTime, macros::datetime};
use type_system::knowledge::entity::id::EntityId;

use crate::{
    OperationRequest, RunRequest,
    run::tests::{apply, run_id},
    sql::literal,
};

pub(super) const BASE: [&str; 6] = [
    "AC-SEXXX",
    "AC-N100",
    "AF-ESSB",
    "AF-ESSA",
    "L-N100-ESSA",
    "L-SEXXX-ESSA",
];

pub(super) struct Fixtures {
    pub manifest: Value,
    pub identities: Value,
    bodies: Value,
    sources: Value,
}

pub(super) fn text(value: &Value) -> &str {
    value.as_str().expect("should specify fixture text")
}

pub(super) fn number(value: &Value) -> u64 {
    value.as_u64().expect("should specify a fixture number")
}

pub(super) fn array(value: &Value) -> &[Value] {
    value.as_array().expect("should specify a fixture array")
}

pub(super) fn capture_time(run: u64) -> OffsetDateTime {
    datetime!(2026-11-06 12:00 UTC)
        + Duration::hours(i64::try_from(run - 1).expect("should fit the fixture hour"))
}

impl Fixtures {
    pub(super) fn new() -> Self {
        let decode =
            |value| serde_json::from_str(value).expect("should decode independent expectations");
        Self {
            manifest: decode(include_str!("../../../../tests/fixtures/scenarios.json")),
            identities: decode(include_str!("../../../../tests/fixtures/entity-ids.json")),
            bodies: decode(include_str!("../../../../tests/fixtures/requests.json")),
            sources: decode(include_str!("../../../../tests/fixtures/source-rows.json")),
        }
    }

    pub(super) fn runs(&self, scenario: &str) -> &[Value] {
        array(&self.manifest["scenarios"][scenario]["runs"])
    }

    pub(super) fn identity(&self, alias: &str) -> &Value {
        &self.identities["entities"][alias]
    }

    pub(super) fn id(&self, alias: &str) -> EntityId {
        serde_json::from_value(self.identity(alias)["entity_id"].clone())
            .expect("should decode the independently fixed identity")
    }

    pub(super) fn source_rows(&self, variant: &str, source: &str) -> Value {
        let definition = &self.manifest["definition_variants"][variant];
        definition["source_rows"].get(source).map_or_else(
            || {
                definition["from"].as_str().map_or_else(
                    || self.sources["sources"][source]["rows"].clone(),
                    |parent| self.source_rows(parent, source),
                )
            },
            Clone::clone,
        )
    }

    pub(super) fn definition(&self, variant: &str) -> String {
        let edits = &self.manifest["definition_variants"][variant];
        let mut definition = edits["from"].as_str().map_or_else(
            || include_str!("../../../../tests/fixtures/aviation.yaml").to_owned(),
            |parent| self.definition(parent),
        );
        if let Some(sources) = edits["source_rows"].as_object() {
            for (source, rows) in sources {
                self.replace_source(&mut definition, source, rows);
            }
        }
        if edits["source_coverage"]["aircraft"] == "complete-or-empty" {
            definition = definition.replace(
                "  aircraft:\n",
                "  aircraft:\n    coverage: complete-or-empty\n",
            );
        }
        if edits.get("rename_sink").is_some() {
            definition = definition.replace("sink-aircraft", "sink-planes");
        }
        if edits.get("remove_properties").is_some() {
            definition = definition.replace(
                "              ${TYPES}/property-type/model/v/1: MODEL\n",
                "",
            );
        }
        if edits.get("replace_entity_type").is_some() {
            definition =
                definition.replace("/entity-type/aircraft/v/1", "/entity-type/aircraft/v/2");
        }
        definition
    }

    fn replace_source(&self, definition: &mut String, source: &str, rows: &Value) {
        let start = definition
            .find(&format!("  {source}:\n"))
            .expect("should find the source block");
        let after = if source == "aircraft" {
            "  airfields:\n"
        } else {
            "pipelines:\n"
        };
        let end = definition
            .get(start..)
            .expect("should start at a source block boundary")
            .find(after)
            .expect("should find the next source section")
            + start;
        let columns = array(&self.sources["sources"][source]["columns"]);
        let empty = array(rows).is_empty();
        let rows = if empty {
            &self.sources["sources"][source]["rows"]
        } else {
            rows
        };
        let values = array(rows)
            .iter()
            .map(|row| {
                format!(
                    "({})",
                    array(row)
                        .iter()
                        .map(|value| literal(text(value)))
                        .collect::<Vec<_>>()
                        .join(", ")
                )
            })
            .collect::<Vec<_>>()
            .join(",\n        ");
        let names = columns.iter().map(text).collect::<Vec<_>>().join(", ");
        let primary = text(columns.first().expect("should specify the primary key"));
        let filter = if empty { " WHERE false" } else { "" };
        definition.replace_range(
            start..end,
            &format!(
                "  {source}:\n    primaryKey: [{primary}]\n    sql: |\n      SELECT * FROM \
                 (VALUES\n        {values}\n      ) t({names}){filter}\n\n"
            ),
        );
    }

    pub(super) fn request(&self, run: &Value) -> RunRequest {
        let mut request = apply(run_id(u128::from(number(&run["number"]))), "");
        request.operation = match text(&run["request"]["operation"]) {
            "apply" => OperationRequest::Apply {
                definition: self
                    .definition(text(&run["request"]["definition"]))
                    .into_boxed_str(),
                namespace: "aviation".into(),
                resend_all: false,
            },
            "restore" => OperationRequest::Restore {
                target: run["request"]["target"]
                    .as_u64()
                    .map(|run| run_id(u128::from(run))),
            },
            "reconcile" => OperationRequest::Reconcile,
            _ => panic!("should use a specified scenario operation"),
        };
        request
    }

    pub(super) fn variant<'a>(scenario: &str, run: &'a Value) -> Option<&'a str> {
        if run["request"]["operation"] == "restore" && run["request"]["target"].is_null() {
            return None;
        }
        // Adopted scenarios all return to D0; their independently specified captures are run 1
        // or S9 run 3 (D0 without N100).
        Some(run["request"]["definition"].as_str().unwrap_or_else(|| {
            if scenario == "S9" && number(&run["capture_run"]) == 3 {
                "without_n100"
            } else {
                "D0"
            }
        }))
    }

    pub(super) fn body(&self, scenario: &str, run: &Value, alias: &str, kind: &str) -> String {
        let run_number = number(&run["number"]);
        let body_alias = match (scenario, run_number, alias) {
            ("S2", 2 | 3, "AC-N100") | ("S7" | "S8", 2, "AC-N100") => "AC-N100-changed-model",
            ("S2", 3, "AC-SEXXX") => "AC-SEXXX-without-mass",
            _ => alias,
        };
        let body = text(&self.bodies["bodies"][body_alias][kind]);
        let body = body.replace(
            "2026-11-06T12:00:00.000000000Z",
            &format!(
                "2026-11-06T{:02}:00:00.000000000Z",
                11 + number(&run["capture_run"])
            ),
        );
        if scenario == "S4" && run_number == 3 && alias.starts_with("AC-") && kind != "archive" {
            let mut value: Value =
                serde_json::from_str(&body).expect("should decode independently supplied body");
            let properties = if kind == "create" {
                &mut value["properties"]["value"]
            } else {
                &mut value["properties"][0]["property"]["value"]
            };
            properties
                .as_object_mut()
                .expect("should specify properties")
                .remove("https://example.com/@demo/types/property-type/model/");
            value.sort_all_objects();
            serde_json::to_string(&value).expect("should encode the specified property removal")
        } else {
            body
        }
    }

    pub(super) fn writes(&self, scenario: &str, run: &Value) -> Value {
        let mut rows = Vec::new();
        for group in array(&run["writes"]) {
            let cells = array(group);
            let [operation, change, batch, aliases] = cells else {
                panic!("should supply a write group");
            };
            let archive = text(change) == "archive";
            for alias in array(aliases).iter().map(text) {
                let identity = self.identity(alias);
                let target = run["target_overrides"]
                    .get(alias)
                    .unwrap_or_else(|| &identity["target"]);
                rows.push(json!([
                    rows.len(),
                    batch,
                    operation,
                    change,
                    identity["entity_id"],
                    target,
                    identity["source_id"],
                    if archive {
                        Value::Null
                    } else {
                        identity["left_entity_id"].clone()
                    },
                    if archive {
                        Value::Null
                    } else {
                        identity["right_entity_id"].clone()
                    },
                    if archive {
                        Value::Null
                    } else {
                        json!(self.body(scenario, run, alias, "create"))
                    },
                    self.body(
                        scenario,
                        run,
                        alias,
                        if archive { "archive" } else { "patch" }
                    ),
                ]));
            }
        }
        json!({"schema":"writes", "rows":rows})
    }

    pub(super) fn properties(&self, alias: &str) -> Value {
        let body: Value = serde_json::from_str(text(&self.bodies["bodies"][alias]["create"]))
            .expect("should decode the independent property object");
        body["properties"].clone()
    }

    pub(super) fn source_values(&self, variant: &str, alias: &str) -> BTreeMap<String, Value> {
        let identity = self.identity(alias);
        let source = if text(&identity["target"]) == "sink-airfields" {
            "airfields"
        } else {
            "aircraft"
        };
        let source_id = if identity["kind"] == "link" {
            text(&identity["source_id"])
                .split("::")
                .nth(1)
                .expect("should specify the link's source")
        } else {
            text(&identity["source_id"])
        };
        let rows = self.source_rows(variant, source);
        let row = array(&rows)
            .iter()
            .find(|row| row[0] == source_id)
            .expect("should supply the source row");
        array(&self.sources["sources"][source]["columns"])
            .iter()
            .map(text)
            .zip(array(row))
            .map(|(column, value)| (column.to_owned(), value.clone()))
            .collect()
    }
}
