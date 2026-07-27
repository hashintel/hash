//! Reading query plans as structure rather than as milliseconds.
//!
//! A plan's wall-clock time depends on the cache, the machine and the load;
//! its shape does not. What a statement scans, which index it enters through,
//! how many rows a filter discards and whether a sort spills are properties of
//! the query and the data, so they compare across runs and machines where a
//! duration cannot.
//!
//! The input is whatever `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` produced —
//! from `auto_explain`'s log, from a statement issued by a harness, or from a
//! session at hand. The source does not matter, so a plan taken from a running
//! server against real data reads the same way as one from a seeded fixture.

use alloc::borrow::Cow;
use core::fmt;

use serde::Deserialize;

/// One node of a plan, flattened out of the tree.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PlanNode {
    /// How deep the node sits in the plan tree, for rendering.
    pub depth: usize,
    /// `Seq Scan`, `Bitmap Index Scan`, `Sort`, and so on.
    pub node_type: String,
    /// The relation a scan reads, where the node reads one.
    pub relation: Option<String>,
    /// The index a scan enters through, where the node uses one.
    pub index: Option<String>,
    /// Rows the node actually produced, summed over its loops.
    pub actual_rows: u64,
    /// Rows the node read and discarded — the work a better path would skip.
    pub rows_removed_by_filter: u64,
    /// `quicksort`, `external merge`, and so on, on sort nodes.
    pub sort_method: Option<String>,
    /// Blocks written to temporary files: a sort or hash that left memory.
    pub temp_written_blocks: u64,
    /// Blocks read past the buffer cache.
    pub shared_read_blocks: u64,
}

/// A plan reduced to the properties that survive a change of machine.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PlanFingerprint {
    /// The statement the plan belongs to, where the source names one.
    ///
    /// This is what tells one plan of a request from the next, so it is kept —
    /// but only the statement, never the parameters bound to it. `auto_explain`
    /// reports those separately and only when
    /// `auto_explain.log_parameter_max_length` allows it, and they hold the
    /// values a caller filtered by. They are not read here, so no configuration
    /// of the server can carry them into a plan.
    ///
    /// The statement itself is safe for as long as the values reach Postgres as
    /// bound parameters rather than as literals in the text.
    pub query: Option<String>,
    /// The nodes in plan order, outermost first.
    pub nodes: Vec<PlanNode>,
}

/// The plan JSON carried by a notice from `auto_explain`.
///
/// `auto_explain` reports a plan as `duration: <n> ms  plan:` followed by the
/// plan itself, whatever severity it was configured to report at. Any other
/// message the server sends yields [`None`], which is how a caller tells a plan
/// from an unrelated notice.
#[must_use]
pub fn plan_notice(message: &str) -> Option<&str> {
    let plan = message.split_once("plan:")?.1;
    // Keying on the severity would break as soon as `auto_explain.log_level`
    // is changed, so the message's own shape decides.
    if !message.starts_with("duration:") {
        return None;
    }

    Some(plan.trim_start())
}

/// The fields read out of a plan.
///
/// `Query Parameters` is not among them, and its absence is the point: it holds
/// the values a caller bound, and never reading it keeps them out of a
/// fingerprint whatever the server is configured to report.
#[derive(Deserialize)]
struct RawPlan {
    #[serde(rename = "Query Text")]
    query_text: Option<String>,
    #[serde(rename = "Plan")]
    plan: RawNode,
}

#[derive(Deserialize)]
struct RawNode {
    #[serde(rename = "Node Type")]
    node_type: String,
    #[serde(rename = "Relation Name")]
    relation_name: Option<String>,
    #[serde(rename = "Index Name")]
    index_name: Option<String>,
    #[serde(rename = "Actual Rows", default)]
    actual_rows: f64,
    /// Absent on a node that ran once.
    #[serde(rename = "Actual Loops")]
    actual_loops: Option<f64>,
    #[serde(rename = "Rows Removed by Filter", default)]
    rows_removed_by_filter: f64,
    #[serde(rename = "Rows Removed by Join Filter", default)]
    rows_removed_by_join_filter: f64,
    #[serde(rename = "Sort Method")]
    sort_method: Option<String>,
    #[serde(rename = "Temp Written Blocks", default)]
    temp_written_blocks: u64,
    #[serde(rename = "Shared Read Blocks", default)]
    shared_read_blocks: u64,
    #[serde(rename = "Plans", default)]
    plans: Vec<Self>,
}

/// Folds per-loop figures into the total the path paid for them.
///
/// A plan states rows as an average per loop and carries decimals for it, so the
/// total is only recoverable as the product — and a total number of rows is a
/// whole number again. Several figures are summed at once because a node can
/// discard rows in more than one way.
#[expect(
    clippy::float_arithmetic,
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
    reason = "the product of a decimal average and its loop count is the only way to the total, \
              which is then a row count and so a whole, non-negative number"
)]
fn total_rows(per_loop: &[f64], loops: f64) -> u64 {
    (per_loop.iter().copied().sum::<f64>() * loops)
        .round()
        .max(0.0) as u64
}

impl RawNode {
    fn flatten(self, depth: usize, into: &mut Vec<PlanNode>) {
        // A plan states rows per loop, but what a path costs is the total, so
        // the loops are folded in here rather than at each use.
        let loops = self.actual_loops.unwrap_or(1.0);

        into.push(PlanNode {
            depth,
            node_type: self.node_type,
            relation: self.relation_name,
            index: self.index_name,
            actual_rows: total_rows(&[self.actual_rows], loops),
            rows_removed_by_filter: total_rows(
                &[
                    self.rows_removed_by_filter,
                    self.rows_removed_by_join_filter,
                ],
                loops,
            ),
            sort_method: self.sort_method,
            temp_written_blocks: self.temp_written_blocks,
            shared_read_blocks: self.shared_read_blocks,
        });

        for child in self.plans {
            child.flatten(depth + 1, into);
        }
    }
}

impl PlanFingerprint {
    /// Reads a plan from the object `EXPLAIN (FORMAT JSON)` produces.
    ///
    /// Accepts both the array the statement returns and a single plan object,
    /// which is what `auto_explain` writes.
    ///
    /// # Errors
    ///
    /// - if the value is not a plan in `FORMAT JSON`
    pub fn from_json(value: &serde_json::Value) -> Result<Self, serde_json::Error> {
        let plan = value
            .as_array()
            .and_then(|plans| plans.first())
            .unwrap_or(value);

        let raw = RawPlan::deserialize(plan)?;
        let mut nodes = Vec::new();
        raw.plan.flatten(0, &mut nodes);

        Ok(Self {
            query: raw.query_text,
            nodes,
        })
    }

    /// Reads a plan from its JSON text.
    ///
    /// # Errors
    ///
    /// - if the text is not a plan in `FORMAT JSON`
    pub fn from_json_str(text: &str) -> Result<Self, serde_json::Error> {
        Self::from_json(&serde_json::from_str(text)?)
    }

    /// Whether any scan enters through the named index.
    #[must_use]
    pub fn uses_index(&self, name: &str) -> bool {
        self.nodes
            .iter()
            .any(|node| node.index.as_deref() == Some(name))
    }

    /// The relations read by a sequential scan.
    ///
    /// A sequential scan is not a fault in itself — reading most of a table is
    /// what it is for. It is a finding when the statement returns few rows.
    #[must_use]
    pub fn sequentially_scanned(&self) -> Vec<&str> {
        self.nodes
            .iter()
            .filter(|node| node.node_type.contains("Seq Scan"))
            .filter_map(|node| node.relation.as_deref())
            .collect()
    }

    /// Whether a sort or hash left memory for temporary files.
    #[must_use]
    pub fn spills(&self) -> bool {
        self.nodes.iter().any(|node| {
            node.temp_written_blocks > 0 || node.sort_method.as_deref() == Some("external merge")
        })
    }

    /// Rows read and discarded across the whole plan.
    ///
    /// The ratio against the rows a statement returns says how much of its work
    /// went into finding out what to leave out.
    #[must_use]
    pub fn rows_discarded(&self) -> u64 {
        self.nodes
            .iter()
            .map(|node| node.rows_removed_by_filter)
            .sum()
    }

    /// The rows the plan returned.
    #[must_use]
    pub fn rows_returned(&self) -> u64 {
        self.nodes.first().map_or(0, |node| node.actual_rows)
    }
}

impl fmt::Display for PlanFingerprint {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        if let Some(query) = &self.query {
            writeln!(fmt, "{query}")?;
        }

        for node in &self.nodes {
            let indent = "  ".repeat(node.depth);
            let target = match (&node.relation, &node.index) {
                (Some(relation), Some(index)) => Cow::Owned(format!(" {relation} via {index}")),
                (Some(relation), None) => Cow::Owned(format!(" {relation}")),
                (None, Some(index)) => Cow::Owned(format!(" via {index}")),
                (None, None) => Cow::Borrowed(""),
            };

            write!(
                fmt,
                "{indent}{}{target} rows={}",
                node.node_type, node.actual_rows
            )?;

            if node.rows_removed_by_filter > 0 {
                write!(fmt, " discarded={}", node.rows_removed_by_filter)?;
            }
            if let Some(method) = &node.sort_method {
                write!(fmt, " sort={method}")?;
            }
            if node.temp_written_blocks > 0 {
                write!(fmt, " temp_written={}", node.temp_written_blocks)?;
            }

            writeln!(fmt)?;
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::PlanFingerprint;

    /// A page read that enters through an index and returns what it reads.
    fn index_bounded_plan() -> serde_json::Value {
        json!({
            "Plan": {
                "Node Type": "Limit",
                "Actual Rows": 23.0,
                "Actual Loops": 1,
                "Plans": [{
                    "Node Type": "Bitmap Heap Scan",
                    "Relation Name": "entity_edition_cache",
                    "Actual Rows": 23.0,
                    "Actual Loops": 1,
                    "Plans": [{
                        "Node Type": "Bitmap Index Scan",
                        "Index Name": "entity_edition_cache_versioned_urls",
                        "Actual Rows": 55.0,
                        "Actual Loops": 1
                    }]
                }]
            }
        })
    }

    /// The same read once the index it entered through is gone.
    fn scanning_plan() -> serde_json::Value {
        json!({
            "Plan": {
                "Node Type": "Limit",
                "Actual Rows": 23.0,
                "Actual Loops": 1,
                "Plans": [{
                    "Node Type": "Parallel Seq Scan",
                    "Relation Name": "entity_temporal_metadata",
                    "Actual Rows": 239_484.0,
                    "Actual Loops": 3,
                    "Rows Removed by Join Filter": 79_823.0
                }]
            }
        })
    }

    #[test]
    fn an_index_bounded_read_is_told_from_a_scanning_one() {
        let bounded =
            PlanFingerprint::from_json(&index_bounded_plan()).expect("the plan should parse");
        let scanning = PlanFingerprint::from_json(&scanning_plan()).expect("the plan should parse");

        assert!(bounded.uses_index("entity_edition_cache_versioned_urls"));
        assert!(bounded.sequentially_scanned().is_empty());
        assert_eq!(bounded.rows_discarded(), 0);

        assert!(!scanning.uses_index("entity_edition_cache_versioned_urls"));
        assert_eq!(
            scanning.sequentially_scanned(),
            ["entity_temporal_metadata"],
        );
        // Both return 23 rows; the difference is what they read to find them.
        assert_eq!(scanning.rows_returned(), bounded.rows_returned());
        assert!(scanning.rows_discarded() > 200_000);
    }

    #[test]
    fn a_sort_that_leaves_memory_is_visible() {
        let plan = json!({
            "Plan": {
                "Node Type": "Limit",
                "Actual Rows": 500.0,
                "Actual Loops": 1,
                "Plans": [{
                    "Node Type": "Sort",
                    "Sort Method": "external merge",
                    "Actual Rows": 660.0,
                    "Actual Loops": 3,
                    "Temp Written Blocks": 9859
                }]
            }
        });

        let fingerprint = PlanFingerprint::from_json(&plan).expect("the plan should parse");

        assert!(fingerprint.spills());
        assert!(
            !PlanFingerprint::from_json(&index_bounded_plan())
                .expect("the plan should parse")
                .spills(),
        );
    }

    #[test]
    fn a_plan_notice_is_told_from_an_unrelated_one() {
        let plan = super::plan_notice("duration: 37.354 ms  plan:\n{\"Plan\": {}}")
            .expect("the notice should carry a plan");
        assert_eq!(plan, "{\"Plan\": {}}");

        // The server sends plenty of notices of its own, and a stray mention of
        // a plan must not be mistaken for one.
        assert_eq!(
            super::plan_notice("relation \"entity_ids\" already exists, skipping"),
            None,
        );
        assert_eq!(
            super::plan_notice("SET LOCAL can only be used in transaction blocks"),
            None,
        );
        assert_eq!(super::plan_notice("the plan: do nothing"), None);
    }

    #[test]
    fn a_captured_notice_reads_as_a_fingerprint() {
        // The shape a running server actually sent, trimmed to the fields read.
        let plan = r#"{
          "Query Text": "SELECT count(*) FROM generate_series(1, $1) AS g WHERE g % 1000 = 0",
          "Plan": {
            "Node Type": "Aggregate",
            "Actual Rows": 1.00,
            "Actual Loops": 1,
            "Plans": [{
              "Node Type": "Function Scan",
              "Relation Name": "generate_series",
              "Actual Rows": 10.00,
              "Actual Loops": 1,
              "Rows Removed by Filter": 9990.00
            }]
          }
        }"#;
        let notice = format!("duration: 0.099 ms  plan:\n{plan}");

        let json = super::plan_notice(&notice).expect("the notice should carry a plan");
        let fingerprint = PlanFingerprint::from_json_str(json).expect("the plan should parse");

        assert_eq!(fingerprint.rows_returned(), 1);
        assert_eq!(fingerprint.rows_discarded(), 9990);
    }

    #[test]
    fn a_plan_keeps_its_statement_and_drops_its_parameters() {
        // What a server configured to report parameters sends. The values are a
        // caller's filter, so they must not survive into a fingerprint that ends
        // up in a log or a trace.
        let plan = json!({
            "Query Text": "SELECT * FROM entity_ids WHERE web_id = $1",
            "Query Parameters": "$1 = 'a-value-a-caller-filtered-by'",
            "Plan": {
                "Node Type": "Seq Scan",
                "Relation Name": "entity_ids",
                "Actual Rows": 1.0,
                "Actual Loops": 1
            }
        });

        let fingerprint = PlanFingerprint::from_json(&plan).expect("the plan should parse");

        assert_eq!(
            fingerprint.query.as_deref(),
            Some("SELECT * FROM entity_ids WHERE web_id = $1"),
        );
        assert!(
            !format!("{fingerprint:?}").contains("a-value-a-caller-filtered-by"),
            "a bound value must not reach the fingerprint",
        );
        assert!(!format!("{fingerprint}").contains("a-value-a-caller-filtered-by"));
    }

    #[test]
    fn loops_are_folded_into_the_row_counts() {
        // A node inside a nested loop reports per-loop rows, so a plan read
        // node by node would understate what the path actually touched.
        let fingerprint =
            PlanFingerprint::from_json(&scanning_plan()).expect("the plan should parse");
        let scan = &fingerprint.nodes[1];

        assert_eq!(scan.actual_rows, 239_484 * 3);
        assert_eq!(scan.rows_removed_by_filter, 79_823 * 3);
    }
}
