use alloc::collections::BTreeSet;
use core::str::FromStr as _;

use deltalake_core::writer::{DeltaWriter as _, RecordBatchWriter};
use pretty_assertions::assert_eq;
use testcontainers::ContainerAsync;
use testcontainers_modules::minio::MinIO;
use type_system::{
    knowledge::{
        entity::id::{EntityId, EntityUuid},
        property::PropertyObjectWithMetadata,
    },
    ontology::VersionedUrl,
    principal::actor_group::WebId,
};
use uuid::Uuid;

use super::{Op, SyncRow, SyncTableError, open, read, row, write};
use crate::{
    RunId,
    storage::Storage,
    testing::{bucket, minio, namespace},
};

/// A bucket on a new MinIO container that lives as long as the returned container.
async fn storage() -> (ContainerAsync<MinIO>, Storage) {
    let (minio, port) = minio().await;
    let storage = Storage::s3(bucket(port), &namespace()).expect("should open the bucket");
    (minio, storage)
}

fn entity(uuid: u128) -> EntityId {
    EntityId {
        web_id: WebId::new(Uuid::from_u128(1)),
        entity_uuid: EntityUuid::new(Uuid::from_u128(uuid)),
        draft_id: None,
    }
}

fn entity_type(name: &str) -> VersionedUrl {
    VersionedUrl::from_str(&format!("https://hash.ai/@h/types/entity-type/{name}/v/1"))
        .expect("should be a versioned URL")
}

fn name(value: &str) -> PropertyObjectWithMetadata {
    serde_json::from_value(serde_json::json!({
        "value": {
            "https://hash.ai/@h/types/property-type/name/": {
                "value": value,
                "metadata": { "dataTypeId": "https://hash.ai/@h/types/data-type/text/v/1" },
            },
        },
    }))
    .expect("should be properties with metadata")
}

/// The rows of a run with entities and a link, in the order they are read back.
fn rows(run: RunId) -> Vec<SyncRow> {
    let row =
        |seq, op, entity_id, entity_type, link: Option<(EntityId, EntityId)>, properties| SyncRow {
            run,
            seq,
            op,
            entity_id,
            entity_type,
            left_entity_id: link.map(|(left, _)| left),
            right_entity_id: link.map(|(_, right)| right),
            properties,
        };
    vec![
        row(
            1,
            Op::CreateEntity,
            entity(2),
            entity_type("person"),
            None,
            name("Ada"),
        ),
        row(
            1,
            Op::CreateEntity,
            entity(3),
            entity_type("person"),
            None,
            name("Grace"),
        ),
        row(
            2,
            Op::CreateLink,
            entity(4),
            entity_type("knows"),
            Some((entity(2), entity(3))),
            name(""),
        ),
        row(
            3,
            Op::UpdateEntity,
            entity(2),
            entity_type("person"),
            None,
            PropertyObjectWithMetadata::default(),
        ),
        row(
            4,
            Op::ArchiveLink,
            entity(4),
            entity_type("knows"),
            Some((entity(2), entity(3))),
            PropertyObjectWithMetadata::default(),
        ),
    ]
}

#[tokio::test]
async fn rows_round_trip() {
    let (_minio, storage) = storage().await;
    let run = RunId::new();
    let expected = rows(run);

    write(&storage, run, expected.iter().rev().cloned().collect())
        .await
        .expect("should write the run");

    assert_eq!(
        read(&storage, run).await.expect("should read the run"),
        expected,
        "should read the rows back in order, with every column unchanged"
    );
}

#[tokio::test]
async fn read_returns_only_its_run() {
    let (_minio, storage) = storage().await;
    let (first, second, never) = (RunId::new(), RunId::new(), RunId::new());

    assert_eq!(
        read(&storage, never)
            .await
            .expect("should read a table that does not exist"),
        [],
        "a table that does not exist should have no rows"
    );
    write(&storage, first, rows(first))
        .await
        .expect("should write the first run");
    write(&storage, second, rows(second))
        .await
        .expect("should write the second run");

    assert_eq!(
        read(&storage, second)
            .await
            .expect("should read the second run"),
        rows(second),
        "should read no rows of another run"
    );
    assert_eq!(
        read(&storage, never)
            .await
            .expect("should read a run that was never written"),
        [],
        "a run that was never written should have no rows"
    );
}

#[tokio::test]
async fn second_write_replaces_rows() {
    let (_minio, storage) = storage().await;
    let run = RunId::new();
    let first = rows(run);
    let second = first.get(..2).expect("should have two rows").to_vec();

    write(&storage, run, first)
        .await
        .expect("should write the run");
    write(&storage, run, second.clone())
        .await
        .expect("should write the run again");

    assert_eq!(
        read(&storage, run).await.expect("should read the run"),
        second,
        "the second write should replace the rows of the first"
    );
}

#[tokio::test]
async fn empty_write_removes_rows() {
    let (_minio, storage) = storage().await;
    let run = RunId::new();

    write(&storage, run, rows(run))
        .await
        .expect("should write the run");
    write(&storage, run, Vec::new())
        .await
        .expect("should write the run without rows");

    assert_eq!(
        read(&storage, run).await.expect("should read the run"),
        [],
        "a write without rows should leave the run without rows"
    );
}

#[tokio::test]
async fn write_repeats_uncommitted_write() {
    let (_minio, storage) = storage().await;
    let (earlier, run) = (RunId::new(), RunId::new());
    let expected = rows(run);
    write(&storage, earlier, rows(earlier))
        .await
        .expect("should create the table");

    // A write that stopped before its commit: its files are in the run's partition, but no
    // commit names them.
    let table = open(&storage).await.expect("should open the table");
    let mut writer = RecordBatchWriter::for_table(&table).expect("should open a writer");
    let batch = row::to_batch(&expected, &writer.arrow_schema()).expect("should build the batch");
    writer.write(batch).await.expect("should write the batch");
    writer.flush().await.expect("should write the files");

    write(&storage, run, expected.clone())
        .await
        .expect("should write the run");

    assert_eq!(
        read(&storage, run).await.expect("should read the run"),
        expected,
        "the rows should be in the table once"
    );
}

#[tokio::test]
async fn rows_of_another_run_are_invalid() {
    let (_minio, storage) = storage().await;

    let error = write(&storage, RunId::new(), rows(RunId::new()))
        .await
        .expect_err("should refuse rows of another run");
    assert_eq!(*error.current_context(), SyncTableError::Invalid);
}

#[tokio::test]
async fn storage_without_bucket_is_invalid() {
    let error = read(&Storage::memory(), RunId::new())
        .await
        .expect_err("should refuse a storage without a bucket");
    assert_eq!(*error.current_context(), SyncTableError::Invalid);
}

#[test]
fn columns_are_the_fields_of_a_row() {
    let row = rows(RunId::new())
        .into_iter()
        .next()
        .expect("should have a row");
    let serde_json::Value::Object(fields) =
        serde_json::to_value(&row).expect("should serialize the row")
    else {
        panic!("a row should serialize as an object");
    };
    let columns = row::columns()
        .iter()
        .map(|column| column.name().clone())
        .collect::<BTreeSet<_>>();

    assert_eq!(
        fields.keys().cloned().collect::<BTreeSet<_>>(),
        columns,
        "the columns should be the fields of `SyncRow`"
    );
}
