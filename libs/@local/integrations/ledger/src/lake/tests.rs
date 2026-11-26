use std::{sync::Barrier, thread};

use duckdb::Connection;
use futures_util::TryStreamExt as _;
use object_store::path::Path as Location;
use pretty_assertions::assert_eq;
use rstest::rstest;
use tempfile::TempDir;
use testcontainers::ContainerAsync;
use testcontainers_modules::minio::MinIO;

use super::{Column, Columns, Lake, LakeError, LakeSettings, failed};
use crate::{
    RunId,
    storage::{Storage, open_bucket},
    testing::{bucket, minio, namespace},
};

/// A bucket on a new MinIO container that lives as long as the container.
struct Bucket {
    _minio: ContainerAsync<MinIO>,
    port: u16,
    storage: Storage,
}

impl Bucket {
    async fn start() -> Self {
        let (minio, port) = minio().await;
        Self {
            _minio: minio,
            port,
            storage: Storage::s3(bucket(port), &namespace()).expect("should open the bucket"),
        }
    }

    /// The keys of the objects below `key` in the integration's place in the bucket, relative to
    /// that place.
    async fn keys(&self, key: &str) -> Vec<String> {
        let root = self
            .storage
            .bucket()
            .and_then(|bucket| bucket.uri.strip_prefix("s3://captures/"))
            .expect("the storage should have a place in the bucket")
            .to_owned();
        open_bucket(&bucket(self.port))
            .expect("should open the bucket")
            .list(Some(&Location::from(format!("{root}/{key}"))))
            .map_ok(|object| {
                object
                    .location
                    .as_ref()
                    .trim_start_matches(&format!("{root}/"))
                    .to_owned()
            })
            .try_collect()
            .await
            .expect("should list the bucket")
    }

    fn settings(&self) -> LakeSettings {
        LakeSettings::of(&self.storage).expect("the storage should have a bucket")
    }

    fn lake(&self) -> Lake {
        self.settings().open().expect("should open the lake")
    }
}

/// Appends the rows `query` gives as the rows of `run` to the table at `key`.
fn append(lake: &Lake, key: &str, run: RunId, query: &str) -> Result<u64, LakeError> {
    lake.table(key)
        .and_then(|table| table.append_run(run, &lake.stage_query(query)?))
        .map_err(|report| *report.current_context())
}

/// The values of the text columns `a` and `b` of `run` in the table at `key`.
fn read(lake: &Lake, key: &str, run: RunId) -> Vec<(String, String)> {
    let mut rows = lake
        .table(key)
        .and_then(|table| {
            table.read_run(
                run,
                &Columns::new([Column::new("a", "VARCHAR"), Column::new("b", "VARCHAR")]),
                |report| report,
                |row| Ok((row.get(0).map_err(failed)?, row.get(1).map_err(failed)?)),
            )
        })
        .expect("should read the rows");
    rows.sort();
    rows
}

#[rstest]
#[case::parser("SELEC 1")]
#[case::binder("SELECT missing FROM (SELECT 1 AS present)")]
#[case::catalog("SELECT * FROM missing")]
#[case::conversion("SELECT 'x'::INTEGER")]
#[case::out_of_range("SELECT 300::TINYINT")]
#[case::missing_file("SELECT * FROM read_parquet('/missing/aircraft.parquet')")]
fn query_errors_are_invalid(#[case] query: &str) {
    let connection = Connection::open_in_memory().expect("should open an in-memory database");
    let error = connection
        .execute_batch(query)
        .expect_err("the query should fail");

    assert_eq!(
        LakeError::of(&error),
        LakeError::Invalid,
        "an error that fails the same way every time should be invalid: {error}"
    );
}

#[rstest]
#[case::drop_after_select("SELECT 1 AS id; DROP TABLE kept")]
#[case::two_selects("SELECT 1 AS id; SELECT 2 AS id")]
#[case::drop("DROP TABLE kept")]
#[case::copy("COPY kept TO '/tmp/kept.csv'")]
fn stage_query_runs_one_select(#[case] query: &str) {
    let connection = Connection::open_in_memory().expect("should open an in-memory database");
    let lake = Lake {
        connection,
        root: "s3://captures".into(),
        names: core::cell::Cell::new(0),
        checkpoint_runs: super::CHECKPOINT_RUNS,
    };
    lake.connection
        .execute_batch("CREATE TABLE kept (id INTEGER)")
        .expect("should create a table");

    let error = lake
        .stage_query(query)
        .expect_err("a text that is not one `SELECT` should be refused");

    assert_eq!(*error.current_context(), LakeError::Invalid, "{error:?}");
    assert!(
        lake.connection.execute_batch("SELECT * FROM kept").is_ok(),
        "no statement of the text should run"
    );
}

#[test]
fn errors_of_duckdb_rs_are_invalid() {
    let connection = Connection::open_in_memory().expect("should open an in-memory database");
    let error = connection
        .execute("SELECT ?", [])
        .expect_err("a missing parameter should fail");

    assert_eq!(LakeError::of(&error), LakeError::Invalid, "{error}");
}

#[test]
fn storage_without_bucket_is_unconfigured() {
    let error = LakeSettings::of(&Storage::memory()).expect_err("there is no bucket");

    assert_eq!(*error.current_context(), LakeError::Unconfigured);
}

#[tokio::test]
async fn unreachable_bucket_is_storage() {
    let storage = Storage::s3(bucket(1), &namespace()).expect("should configure the bucket");
    let error = tokio::task::spawn_blocking(move || {
        let lake = LakeSettings::of(&storage)?.open()?;
        lake.table("sync")?.exists()
    })
    .await
    .expect("the task should finish")
    .expect_err("the bucket should be unreachable");

    assert_eq!(*error.current_context(), LakeError::Storage, "{error:?}");
}

#[tokio::test]
async fn append_run_repeated() {
    let bucket = Bucket::start().await;
    let run = RunId::new();
    tokio::task::spawn_blocking(move || {
        let lake = bucket.lake();
        let first = append(&lake, "rows", run, "SELECT 'a1' AS a, 'b1' AS b");
        let second = append(
            &lake,
            "rows",
            run,
            "SELECT 'a2' AS a, 'b2' AS b UNION ALL SELECT 'a3', 'b3'",
        );

        assert_eq!(
            (first, second),
            (Ok(1), Ok(1)),
            "a second append of a run should leave its rows"
        );
        assert_eq!(read(&lake, "rows", run), [("a1".into(), "b1".into())]);
    })
    .await
    .expect("the test should not panic");
}

#[tokio::test]
async fn append_run_matches_columns_by_name() {
    let bucket = Bucket::start().await;
    let (first, second) = (RunId::new(), RunId::new());
    tokio::task::spawn_blocking(move || {
        let lake = bucket.lake();
        append(&lake, "rows", first, "SELECT 'a1' AS a, 'b1' AS b")
            .expect("should append the first run");
        append(&lake, "rows", second, "SELECT 'b2' AS B, 'a2' AS a")
            .expect("should append columns of the same names in another order");

        assert_eq!(
            read(&lake, "rows", second),
            [("a2".into(), "b2".into())],
            "each value should be in the column of its name"
        );
    })
    .await
    .expect("the test should not panic");
}

#[rstest]
#[case::renamed("SELECT 'a2' AS a, 'c2' AS c")]
#[case::missing("SELECT 'a2' AS a")]
#[case::added("SELECT 'a2' AS a, 'b2' AS b, 'c2' AS c")]
#[case::run("SELECT 'a2' AS a, 'b2' AS b, 'x' AS run")]
#[tokio::test]
async fn append_run_other_columns(#[case] query: &'static str) {
    let bucket = Bucket::start().await;
    let (first, second) = (RunId::new(), RunId::new());
    tokio::task::spawn_blocking(move || {
        let lake = bucket.lake();
        append(&lake, "rows", first, "SELECT 'a1' AS a, 'b1' AS b")
            .expect("should append the first run");

        assert_eq!(
            append(&lake, "rows", second, query),
            Err(LakeError::Invalid),
            "rows with other columns than the table should be refused"
        );
        assert!(
            !lake
                .table("rows")
                .and_then(|table| table.has_run(second))
                .expect("should read the log"),
            "a refused run should not be marked as appended"
        );
    })
    .await
    .expect("the test should not panic");
}

#[tokio::test]
async fn failed_query_creates_no_table() {
    let bucket = Bucket::start().await;
    let (first, second) = (RunId::new(), RunId::new());
    tokio::task::spawn_blocking(move || {
        let lake = bucket.lake();
        assert_eq!(
            append(&lake, "rows", first, "SELECT 'x'::INTEGER AS a, 'b1' AS b"),
            Err(LakeError::Invalid)
        );

        append(&lake, "rows", second, "SELECT 'a2' AS a, 'b2' AS b")
            .expect("a fixed query should create the table with its own columns");
        assert_eq!(read(&lake, "rows", second), [("a2".into(), "b2".into())]);
    })
    .await
    .expect("the test should not panic");
}

#[tokio::test]
async fn copy_run_keeps_the_order_of_the_query() {
    let bucket = Bucket::start().await;
    let run = RunId::new();
    let directory = TempDir::new().expect("should create a directory");
    let database = directory.path().join("copy.duckdb");
    let copied = database.clone();
    tokio::task::spawn_blocking(move || {
        let lake = bucket.lake();
        let table = lake.table("rows").expect("should attach the table");
        let staged = lake
            .stage_query("SELECT * FROM range(999, -1, -1) AS ids(id)")
            .expect("should run the query")
            .numbered("_seq");
        assert_eq!(table.append_run(run, &staged).ok(), Some(1000));

        let target = lake
            .attach_database(&database)
            .expect("should attach the database");
        table
            .copy_run(run, &target, "copy", "_seq")
            .expect("should copy the run");
        target.detach().expect("should detach the database");
    })
    .await
    .expect("the test should not panic");

    let connection = Connection::open(&copied).expect("should open the copy");
    let ids = connection
        .prepare("SELECT id FROM copy ORDER BY rowid")
        .and_then(|mut statement| {
            statement
                .query_map([], |row| row.get::<_, i64>(0))?
                .collect::<duckdb::Result<Vec<_>>>()
        })
        .expect("should read the copy");
    assert_eq!(
        ids,
        (0..1000).rev().collect::<Vec<_>>(),
        "the copy should hold the rows in the order the query gave them"
    );
}

#[tokio::test]
async fn append_run_concurrent() {
    let bucket = Bucket::start().await;
    let settings = [bucket.settings(), bucket.settings()];
    tokio::task::spawn_blocking(move || {
        // Creates the table, so that both appends race on the run, not on the table.
        append(
            &settings[0].open().expect("should open the lake"),
            "rows",
            RunId::new(),
            "SELECT 'a0' AS a, 'b0' AS b",
        )
        .expect("should create the table");
        for _ in 0..3 {
            let run = RunId::new();
            let barrier = Barrier::new(2);
            let appended = thread::scope(|scope| {
                let appends = settings.each_ref().map(|settings| {
                    let barrier = &barrier;
                    scope.spawn(move || {
                        let lake = settings.open().expect("should open the lake");
                        let table = lake.table("rows").expect("should attach the table");
                        let staged = lake
                            .stage_query("SELECT 'a' AS a, 'b' AS b UNION ALL SELECT 'c', 'd'")
                            .expect("should run the query");
                        barrier.wait();
                        table
                            .append_run(run, &staged)
                            .map_err(|report| *report.current_context())
                    })
                });
                appends.map(|append| append.join().expect("the append should not panic"))
            });

            assert_eq!(
                appended,
                [Ok(2), Ok(2)],
                "both appends of a run should succeed with the rows of one"
            );
        }
    })
    .await
    .expect("the test should not panic");
}

#[tokio::test]
async fn append_run_checkpoints() {
    let bucket = Bucket::start().await;
    let append_runs = |runs: usize| {
        let settings = LakeSettings::of(&bucket.storage).expect("should have a bucket");
        tokio::task::spawn_blocking(move || {
            let lake = settings
                .open()
                .expect("should open the lake")
                .checkpoint_every(3);
            for _ in 0..runs {
                append(&lake, "rows", RunId::new(), "SELECT 'a' AS a, 'b' AS b")
                    .expect("should append the run");
            }
        })
    };
    let checkpointed = |keys: &[String]| {
        keys.iter()
            .any(|key| key == "rows/_delta_log/_last_checkpoint")
    };

    append_runs(2).await.expect("should not panic");
    assert!(
        !checkpointed(&bucket.keys("rows/_delta_log").await),
        "two runs should not be compacted yet"
    );
    append_runs(1).await.expect("should not panic");
    let keys = bucket.keys("rows/_delta_log").await;
    assert!(
        checkpointed(&keys) && keys.iter().any(|key| key.ends_with(".checkpoint.parquet")),
        "the third run should compact the log into a checkpoint, found {keys:?}"
    );
}
