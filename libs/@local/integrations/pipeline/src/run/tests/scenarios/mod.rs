//! One shared, stateful S1–S9 suite across all actual pipeline stages.

mod checkpoints;
mod expected;
mod graph;

use alloc::collections::BTreeMap;
use core::time::Duration;
use std::fs;

use hash_integrations_definition::Variables;
use rstest::rstest;
use serde_json::Value;
use similar_asserts::assert_eq;
use tempfile::TempDir;
use time::OffsetDateTime;

use self::expected::{Fixtures, array, capture_time, number, text};
use super::{context, fixtures, reader, run_id};
use crate::{
    ByteSize, Clock, Code, FixedClock, Operation, RunContext, RunInput, RunRequest, StageError,
    graph::FakeGraph,
    run::{current, marker},
    sources::{SourceReader, tests::NoSecrets},
    stage::{
        capture::{CaptureOutput, capture},
        diff::diff,
        plan::plan,
        send::{SendCounts, SendOutput, send},
    },
    start,
};

struct NoClock;
impl Clock for NoClock {
    fn now(&self) -> OffsetDateTime {
        panic!("should retain the adopted capture time without reading a clock");
    }
}

fn discard(context: &RunContext) {
    fs::remove_dir_all(&context.scratch).expect("should remove all scratch before the successor");
}

fn assert_input(fixture: &Fixtures, scenario: &str, run: &Value, input: &RunInput) {
    let expected = Fixtures::variant(scenario, run).map(|variant| fixture.definition(variant));
    assert_eq!(input.definition.as_deref(), expected.as_deref());
    assert_eq!(input.namespace.as_ref(), "aviation");
    let operation = match text(&run["request"]["operation"]) {
        "apply" => Operation::Apply { resend_all: false },
        "restore" => Operation::Restore {
            target: run["request"]["target"]
                .as_u64()
                .map(|run| run_id(u128::from(run))),
        },
        "reconcile" => Operation::Reconcile {
            target: run_id(u128::from(number(&run["request"]["resolved_target"]))),
        },
        _ => panic!("should specify the scenario operation"),
    };
    assert_eq!(input.operation, operation);
}

fn assert_capture(run: &Value, captured: &CaptureOutput, history: &BTreeMap<u64, CaptureOutput>) {
    assert_eq!(
        captured.captured_at,
        capture_time(number(&run["capture_run"]))
    );
    let adopted = run["adopted_from"].as_u64();
    assert_eq!(
        captured.adopted_from,
        adopted.map(|run| run_id(u128::from(run)))
    );
    if let Some(adopted) = adopted {
        assert_eq!(
            captured.sources, history[&adopted].sources,
            "should adopt the exact published capture references"
        );
    }
}

async fn assert_send(
    context: &RunContext,
    run: &Value,
    output: &Result<SendOutput, error_stack::Report<StageError>>,
) {
    let marker = marker::finished::<SendOutput>(
        context,
        &context
            .namespace
            .send_output(run_id(u128::from(number(&run["number"]))).into()),
    )
    .await
    .expect("should read delivery completion");
    if run.get("stage_error").is_some() {
        let report = output
            .as_ref()
            .expect_err("should stop the interrupted send");
        assert_eq!(*report.current_context(), StageError::Retryable);
        assert_eq!(Code::of(report), Some(Code::GraphUnavailable));
        assert_eq!(marker, None, "should not bind incomplete delivery");
    } else {
        let output = output.as_ref().expect("should complete the scenario send");
        let count = |field| run["send_counts"][field].as_u64().unwrap_or(0);
        assert_eq!(
            output.counts,
            SendCounts {
                created: count("created"),
                patched: count("patched"),
                archived: count("archived"),
                absent: count("absent"),
                rejected: count("rejected")
            }
        );
        assert_eq!(marker.as_ref(), Some(output));
        if let Some(rejected) = &output.rejected {
            assert!(
                run.get("rejected_fixture").is_some(),
                "should reject only the specified scenario rows"
            );
            let expected: Value = serde_json::from_str(include_str!(
                "../../../../tests/fixtures/rejected-rows.json"
            ))
            .expect("should decode independent rejection rows");
            let workspace = context
                .open_workspace(Variables::default())
                .await
                .expect("should read rejected checkpoint");
            fixtures::assert_table(context, &workspace, rejected, "rejected", &expected).await;
            workspace
                .close()
                .await
                .expect("should close rejection consumer");
        } else {
            assert!(
                run.get("rejected_fixture").is_none(),
                "should preserve required rejection records"
            );
        }
    }
    let state = current::read(context)
        .await
        .expect("should read committed control state");
    assert_eq!(
        state.committed,
        run["current"]["committed"]
            .as_u64()
            .map(|run| run_id(u128::from(run)))
    );
    let sending: Vec<_> = array(&run["current"]["sending"])
        .iter()
        .map(|run| run_id(u128::from(number(run))))
        .collect();
    assert_eq!(state.sending, sending);
}

async fn assert_replay(
    context: &RunContext,
    request: RunRequest,
    sources: &SourceReader,
    graph: &FakeGraph,
    output: &SendOutput,
) {
    let before = context
        .storage
        .read_versioned(&context.namespace.current())
        .await
        .expect("should read state before replay")
        .expect("should have committed control state")
        .bytes;
    let replay = crate::run(context, request, sources, &NoSecrets, graph)
        .await
        .expect("should replay the public composition");
    assert_eq!(&replay, output);
    assert!(
        graph.requests().is_empty(),
        "should send no request when every stage is completed"
    );
    let after = context
        .storage
        .read_versioned(&context.namespace.current())
        .await
        .expect("should read state after replay")
        .expect("should retain committed control state")
        .bytes;
    assert_eq!(
        after, before,
        "should preserve the exact current-state bytes"
    );
}

#[rstest]
#[case::first_load("S1")]
#[case::property_changes("S2")]
#[case::deletion_and_coverage("S3")]
#[case::sink_rename("S4")]
#[case::type_version("S5")]
#[case::rejection_recovery("S6")]
#[case::interrupted_send("S7")]
#[case::restore("S8")]
#[case::reconcile("S9")]
#[tokio::test]
async fn pipeline_scenarios(#[case] scenario: &str) {
    let directory = TempDir::new().expect("should create isolated scenario storage");
    let fixture = Fixtures::new();
    let graph = FakeGraph::default();
    let mut captures = BTreeMap::new();
    let mut hashes = BTreeMap::new();
    for run in fixture.runs(scenario) {
        let number = number(&run["number"]);
        let mut capture_context = context(directory.path());
        capture_context.clock = Box::new(FixedClock(capture_time(number)));
        let sources = reader(&capture_context, directory.path());
        let request = fixture.request(run);
        let input = start(&capture_context, request.clone())
            .await
            .expect("should start the scenario run");
        assert_input(&fixture, scenario, run, &input);
        if run.get("adopted_from").is_some() {
            capture_context.clock = Box::new(NoClock);
            // D0 has only SQL sources. A fresh SQL read would need a workspace and fail
            // this zero-byte disk allowance; adoption must only return durable references.
            capture_context.workspace.disk_limit = Some(ByteSize::from_bytes(0));
        }
        let captured = capture(&capture_context, &input, &sources, &NoSecrets)
            .await
            .expect("should capture or adopt scenario sources");
        assert_capture(run, &captured, &captures);
        discard(&capture_context);

        let diff_context = context(directory.path());
        let diffed = diff(&diff_context, &input, &captured)
            .await
            .expect("should diff durable capture files");
        assert_eq!(
            diffed.base,
            run["base"].as_u64().map(|run| run_id(u128::from(run)))
        );
        assert_eq!(
            diffed.resent,
            array(&run["resent"])
                .iter()
                .map(|run| run_id(u128::from(expected::number(run))))
                .collect::<Vec<_>>()
        );
        discard(&diff_context);
        let plan_context = context(directory.path());
        let planned = plan(&plan_context, &input, &captured, &diffed)
            .await
            .expect("should plan durable diff files");
        discard(&plan_context);

        let consumer = context(directory.path());
        let workspace = consumer
            .open_workspace(Variables::default())
            .await
            .expect("should open independent checkpoint inspection");
        checkpoints::captures(
            &consumer,
            &workspace,
            &fixture,
            Fixtures::variant(scenario, run),
            &captured,
        )
        .await;
        let hash_rows = checkpoints::hashes(
            &consumer, &workspace, &fixture, scenario, run, &diffed, &hashes,
        )
        .await;
        checkpoints::diff_rows(&consumer, &workspace, &fixture, scenario, run, &diffed).await;
        let writes = fixture.writes(scenario, run);
        checkpoints::plan_rows(&consumer, &workspace, &writes, &planned).await;
        workspace
            .close()
            .await
            .expect("should close checkpoint inspection");
        discard(&consumer);

        let mut sender = context(directory.path());
        sender.send.first_wait = Duration::ZERO;
        sender.send.longest_wait = Duration::ZERO;
        graph::prepare(&fixture, scenario, run, input.actor, &graph).await;
        let output = send(&sender, &input, &diffed, &planned, &graph).await;
        assert_send(&sender, run, &output).await;
        graph::assert_requests(
            &fixture,
            scenario,
            run,
            &writes,
            input.actor,
            &graph.requests(),
        );
        graph::assert_state(&fixture, scenario, number, &graph);
        if let Ok(output) = output {
            assert_replay(&sender, request, &sources, &graph, &output).await;
        }
        discard(&sender);
        captures.insert(number, captured);
        hashes.insert(number, hash_rows);
    }
}
