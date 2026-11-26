use core::str::FromStr as _;

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

use super::{Op, SyncRow, SyncTableError, order_key, read, write};
use crate::{
    RunId, S3Bucket,
    lake::LakeSettings,
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
async fn second_write_leaves_rows() {
    let (_minio, storage) = storage().await;
    let run = RunId::new();
    let first = rows(run);
    let second = first.get(..2).expect("should have two rows").to_vec();

    write(&storage, run, first.clone())
        .await
        .expect("should write the run");
    write(&storage, run, second)
        .await
        .expect("should leave a written run");

    assert_eq!(
        read(&storage, run).await.expect("should read the run"),
        first,
        "a run should keep the rows of its first write"
    );
}

#[tokio::test]
async fn empty_write_leaves_no_rows() {
    let (_minio, storage) = storage().await;
    let run = RunId::new();

    write(&storage, run, Vec::new())
        .await
        .expect("should write the run without rows");

    assert_eq!(
        read(&storage, run).await.expect("should read the run"),
        [],
        "a run written without rows should have no rows"
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
async fn storage_without_bucket_is_unconfigured() {
    let error = read(&Storage::memory(), RunId::new())
        .await
        .expect_err("should refuse a storage without a bucket");
    assert_eq!(*error.current_context(), SyncTableError::Unconfigured);
}

#[tokio::test]
async fn table_with_other_columns_is_invalid() {
    let (_minio, storage) = storage().await;
    let run = RunId::new();
    let settings = LakeSettings::of(&storage).expect("should have a bucket");
    tokio::task::spawn_blocking(move || {
        let lake = settings.open().expect("should open the lake");
        let staged = lake
            .stage_query("SELECT 1 AS id")
            .expect("should stage the rows");
        lake.table("sync")
            .and_then(|table| table.append_run(run, &staged))
            .expect("should create a table with other columns");
    })
    .await
    .expect("should not panic");

    let error = read(&storage, run)
        .await
        .expect_err("a table with other columns should be refused");
    assert_eq!(
        *error.current_context(),
        SyncTableError::Invalid,
        "a table with other columns fails the same way every time"
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
            .any(|key| key.starts_with(&format!("{root}/sync/run={run}/"))),
        "the run's files should be in its partition under `{root}/sync`, found {keys:?}"
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
