use alloc::collections::BTreeSet;
use core::str::FromStr as _;

use deltalake_core::{
    kernel::{
        Action, DataType, StructField,
        transaction::{CommitBuilder, CommitProperties},
    },
    protocol::{DeltaOperation, SaveMode},
    writer::{DeltaWriter as _, RecordBatchWriter},
};
use futures_util::TryStreamExt as _;
use hash_crypto::Secret;
use object_store::path::Path as Location;
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

use super::{Op, RUN, SyncRow, SyncTableError, open, order_key, read, row, write};
use crate::{
    RunId, S3Bucket,
    storage::{Storage, open_bucket},
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

    write(&storage, second, Vec::new())
        .await
        .expect("should write the second run without rows");
    assert_eq!(
        read(&storage, first)
            .await
            .expect("should read the first run"),
        rows(first),
        "writing a run should leave the rows of another run"
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
    let run = RunId::new();
    write(&storage, run, rows(run))
        .await
        .expect("should write the run");

    let mut mixed = rows(run);
    if let Some(last) = mixed.last_mut() {
        last.run = RunId::new();
    }
    let error = write(&storage, run, mixed)
        .await
        .expect_err("should refuse a row of another run");
    assert_eq!(
        *error.current_context(),
        SyncTableError::Invalid,
        "a row of another run should be invalid"
    );
    assert_eq!(
        read(&storage, run).await.expect("should read the run"),
        rows(run),
        "a refused write should leave the run's rows"
    );
}

#[tokio::test]
async fn storage_without_bucket_is_invalid() {
    let error = read(&Storage::memory(), RunId::new())
        .await
        .expect_err("should refuse a storage without a bucket");
    assert_eq!(
        *error.current_context(),
        SyncTableError::Invalid,
        "a storage without a bucket should be invalid"
    );
}

#[tokio::test]
async fn table_is_below_the_bucket_prefix() {
    let (_minio, port) = minio().await;
    let storage = Storage::s3(
        S3Bucket {
            uri: "s3://captures/prefix/".into(),
            ..bucket(port)
        },
        &namespace(),
    )
    .expect("should open the bucket");
    let run = RunId::new();
    write(&storage, run, rows(run))
        .await
        .expect("should write the run");

    let root = storage
        .bucket()
        .and_then(|bucket| bucket.uri.strip_prefix("s3://captures/"))
        .expect("should have a bucket with a prefix")
        .to_owned();
    let keys: Vec<String> = open_bucket(&bucket(port))
        .expect("should open the bucket")
        .list(Some(&Location::from(root.as_str())))
        .map_ok(|object| object.location.to_string())
        .try_collect()
        .await
        .expect("should list the bucket");
    assert!(
        keys.contains(&format!("{root}/sync/_delta_log/00000000000000000000.json")),
        "the log should be under `{root}/sync`, found {keys:?}"
    );
    assert!(
        keys.iter()
            .any(|key| key.starts_with(&format!("{root}/sync/{RUN}={run}/"))),
        "the run's files should be in its partition under `{root}/sync`, found {keys:?}"
    );
}

#[tokio::test]
async fn run_in_several_files() {
    let (_minio, storage) = storage().await;
    let (earlier, run) = (RunId::new(), RunId::new());
    let expected = rows(run);
    write(&storage, earlier, rows(earlier))
        .await
        .expect("should create the table");

    // Two files whose rows interleave in the order of the run.
    let table = open(&storage).await.expect("should open the table");
    let mut adds = Vec::new();
    for indices in [[0, 3].as_slice(), [1, 2, 4].as_slice()] {
        let part = indices
            .iter()
            .map(|&index| expected.get(index).expect("should have the row").clone())
            .collect::<Vec<_>>();
        let mut writer = RecordBatchWriter::for_table(&table).expect("should open a writer");
        let batch = row::to_batch(&part, &writer.arrow_schema()).expect("should build the batch");
        writer.write(batch).await.expect("should write the batch");
        adds.extend(
            writer
                .flush()
                .await
                .expect("should write the file")
                .into_iter()
                .map(Action::Add),
        );
    }
    CommitBuilder::from(CommitProperties::default())
        .with_actions(adds)
        .build(
            Some(table.snapshot().expect("should have a snapshot")),
            table.log_store(),
            DeltaOperation::Write {
                mode: SaveMode::Append,
                partition_by: Some(vec![RUN.to_owned()]),
                predicate: None,
            },
        )
        .await
        .expect("should commit both files");

    assert_eq!(
        read(&storage, run).await.expect("should read the run"),
        expected,
        "should read the rows of both files in order"
    );
    let subset = expected.get(..2).expect("should have two rows").to_vec();
    write(&storage, run, subset.clone())
        .await
        .expect("should write the run again");
    assert_eq!(
        read(&storage, run).await.expect("should read the run"),
        subset,
        "a write should replace the rows of every file of the run"
    );
}

#[tokio::test]
async fn wrong_credentials_are_storage_errors() {
    let (_minio, port) = minio().await;
    let storage = Storage::s3(
        S3Bucket {
            secret: Secret::from_vec(b"not the secret".to_vec()),
            ..bucket(port)
        },
        &namespace(),
    )
    .expect("should open the bucket");
    let run = RunId::new();

    let error = read(&storage, run)
        .await
        .expect_err("should not read with wrong credentials");
    assert_eq!(
        *error.current_context(),
        SyncTableError::Storage,
        "a refused read should be a storage error, not an empty run"
    );
    let error = write(&storage, run, rows(run))
        .await
        .expect_err("should not write with wrong credentials");
    assert_eq!(
        *error.current_context(),
        SyncTableError::Storage,
        "a refused write should be a storage error"
    );
}

#[tokio::test]
async fn table_with_other_columns_is_invalid() {
    let (_minio, storage) = storage().await;
    let run = RunId::new();
    open(&storage)
        .await
        .expect("should open the place of the table")
        .create()
        .with_columns([StructField::new("id", DataType::LONG, false)])
        .await
        .expect("should create another table");

    let error = read(&storage, run)
        .await
        .expect_err("should refuse a table with other columns");
    assert_eq!(
        *error.current_context(),
        SyncTableError::Invalid,
        "a table with other columns should be invalid"
    );
    let error = write(&storage, run, rows(run))
        .await
        .expect_err("should refuse a table with other columns");
    assert_eq!(
        *error.current_context(),
        SyncTableError::Invalid,
        "a table with other columns should be invalid"
    );
}

#[test]
fn order_key_compares_web_ids_first() {
    let id = |web: u128, entity: u128| EntityId {
        web_id: WebId::new(Uuid::from_u128(web)),
        entity_uuid: EntityUuid::new(Uuid::from_u128(entity)),
        draft_id: None,
    };
    assert!(
        order_key(&id(1, 2)) < order_key(&id(2, 1)),
        "the web id should decide before the entity UUID"
    );
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
