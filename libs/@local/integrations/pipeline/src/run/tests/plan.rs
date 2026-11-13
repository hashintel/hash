//! Exact planning output across producer and independently seeded checkpoint seams.

use alloc::collections::BTreeMap;
use std::fs;

use hash_integrations_definition::Variables;
use rstest::rstest;
use similar_asserts::assert_eq;
use tempfile::TempDir;
use time::macros::datetime;

use super::{apply, context, fixtures, reader, run_id};
use crate::{
    FixedClock,
    graph::OperationKind,
    sources::tests::NoSecrets,
    stage::{capture::capture, diff::diff, plan::plan},
    start,
};

#[rstest]
#[case::actual_predecessors(true)]
#[case::independent_checkpoint(false)]
#[tokio::test]
async fn plan_fresh_scratch(#[case] actual_predecessors: bool) {
    let directory = TempDir::new().expect("should create fixture storage");
    let producer = context(directory.path());
    let input = start(
        &producer,
        apply(
            run_id(1),
            include_str!("../../../tests/fixtures/aviation.yaml"),
        ),
    )
    .await
    .expect("should pin the canonical definition");
    let (captured, diffed) = if actual_predecessors {
        let sources = reader(&producer, directory.path());
        let captured = capture(&producer, &input, &sources, &NoSecrets)
            .await
            .expect("should capture canonical sources");
        fs::remove_dir_all(&producer.scratch).expect("should discard capture scratch");
        let diff_context = context(directory.path());
        let diffed = diff(&diff_context, &input, &captured)
            .await
            .expect("should diff actual capture files");
        fs::remove_dir_all(&diff_context.scratch).expect("should discard diff scratch");
        (captured, diffed)
    } else {
        let checkpoints = fixtures::checkpoints(&producer).await;
        fs::remove_dir_all(&producer.scratch).expect("should discard fixture scratch");
        (checkpoints.capture, checkpoints.diff)
    };

    let mut planner = context(directory.path());
    // A later consumer clock must not change the edition provenance of persisted captures.
    planner.clock = Box::new(FixedClock(datetime!(2030-01-01 00:00 UTC)));
    let output = plan(&planner, &input, &captured, &diffed)
        .await
        .expect("should plan from durable predecessor checkpoints");
    fs::remove_dir_all(&planner.scratch).expect("should discard planning scratch");

    let consumer = context(directory.path());
    let workspace = consumer
        .open_workspace(Variables::default())
        .await
        .expect("should open a fresh successor workspace");
    let expected = fixtures::first_run();
    let expected_plan = &expected["run_1"]["plan"];
    let counts: BTreeMap<OperationKind, u64> =
        serde_json::from_value(expected_plan["counts"].clone())
            .expect("should specify independent operation counts");
    assert_eq!(output.counts, counts);
    assert_eq!(
        u64::from(output.batches),
        expected_plan["batches"]
            .as_u64()
            .expect("should specify the independent batch count")
    );
    for (name, artifact) in [("writes", &output.writes), ("issues", &output.issues)] {
        fixtures::assert_table(&consumer, &workspace, artifact, name, &expected_plan[name]).await;
    }
    workspace.close().await.expect("should close the successor");
    assert_eq!(
        plan(&consumer, &input, &captured, &diffed)
            .await
            .expect("should replay the durable plan marker"),
        output
    );
}
