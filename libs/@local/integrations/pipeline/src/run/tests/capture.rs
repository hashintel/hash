//! The capture producer must satisfy the independent checkpoint consumer fixture.

use std::fs;

use hash_integrations_definition::{SourceName, Variables};
use similar_asserts::assert_eq;
use tempfile::TempDir;

use super::{apply, context, fixtures, run_id};
use crate::{
    CaptureLimits, CaptureStore, SourceReader, sources::tests::NoSecrets, stage::capture::capture,
    start,
};

#[tokio::test]
async fn capture_matches_independent_checkpoint_on_fresh_scratch() {
    let directory = TempDir::new().expect("should create fixture storage");
    let producer = context(directory.path());
    let local = directory.path().join("local");
    fs::create_dir_all(&local).expect("should create the local source root");
    let sources = SourceReader::new(
        CaptureStore::new(&local, producer.storage.clone()).expect("should open the source reader"),
        CaptureLimits::default(),
    );
    let input = start(
        &producer,
        apply(
            run_id(1),
            include_str!("../../../tests/fixtures/aviation.yaml"),
        ),
    )
    .await
    .expect("should pin the canonical definition");
    let captured = capture(&producer, &input, &sources, &NoSecrets)
        .await
        .expect("should capture the canonical sources");
    let expected = fixtures::first_run();
    let expected_capture = &expected["run_1"]["capture"];
    assert_eq!(captured.captured_at, producer.clock.now());
    assert_eq!(captured.adopted_from, None);
    assert_eq!(
        captured.sources.len(),
        expected_capture["sources"]
            .as_object()
            .expect("should contain independent source expectations")
            .len()
    );

    // The successor has only durable references; deleting scratch rules out accidental reuse.
    fs::remove_dir_all(&producer.scratch).expect("should discard producer scratch");
    let consumer = context(directory.path());
    let workspace = consumer
        .open_workspace(Variables::default())
        .await
        .expect("should open an independent consumer workspace");
    for (source, table) in expected_capture["sources"]
        .as_object()
        .expect("should contain independent source expectations")
    {
        let name: SourceName = source
            .parse()
            .expect("should parse the expected source name");
        let actual = captured
            .sources
            .get(&name)
            .expect("should capture every expected source");
        assert_eq!(
            actual.rows,
            table["count"]
                .as_u64()
                .expect("should specify the source row count")
        );
        fixtures::assert_table(&consumer, &workspace, &actual.file, source, table).await;
    }
    workspace.close().await.expect("should close the consumer");
    assert_eq!(
        capture(&consumer, &input, &sources, &NoSecrets)
            .await
            .expect("should replay the durable capture marker"),
        captured
    );
}
