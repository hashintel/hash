//! Rounds that `hash-integrations-collect` collects into Delta tables, and that a [`Follower`]
//! takes through every stage into the Graph.

use alloc::collections::BTreeMap;
use std::{fs, path::Path, process::Command};

use hash_crypto::Secret;
use hash_graph_store::pool::StorePool as _;
use hash_integrations_ledger::{
    Follower, IntegrationNamespace, RunId, S3Bucket, Step, Storage, status,
};
use pretty_assertions::assert_eq;
use serde_json::{Value, json};
use tempfile::TempDir;
use type_system::principal::{actor::ActorEntityUuid, actor_group::WebId};

use super::{AVIATION, counts, database, fixtures, graph, minio};

/// The bucket of the MinIO container on `port`.
fn bucket(port: u16) -> S3Bucket {
    S3Bucket {
        uri: "s3://captures".into(),
        region: "us-east-1".into(),
        endpoint: Some(format!("localhost:{port}").into()),
        use_ssl: false,
        key_id: "minioadmin".into(),
        secret: Secret::from_vec(b"minioadmin".to_vec()),
    }
}

/// Collects round `round` of the rows in `collected/` into the aviation integration of `web`,
/// with `hash-integrations-collect`, configured as dlt's configuration files say.
async fn collect(port: u16, web: WebId, round: u8) {
    let config = TempDir::new().expect("should create a directory");
    fs::create_dir_all(config.path().join(".dlt")).expect("should create the configuration folder");
    fs::write(
        config.path().join(".dlt/config.toml"),
        format!(
            "[integration]\nweb = \"{web}\"\nconnector = \"aviation\"\nbucket_uri = \
             \"s3://captures\"\n"
        ),
    )
    .expect("should write the configuration");
    fs::write(
        config.path().join(".dlt/secrets.toml"),
        format!(
            "[destination.filesystem.credentials]\naws_access_key_id = \"minioadmin\"\n\
             aws_secret_access_key = \"minioadmin\"\nregion_name = \"us-east-1\"\nendpoint_url = \
             \"http://localhost:{port}\"\n"
        ),
    )
    .expect("should write the secrets");

    let repository = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../..");
    let rows = Path::new(env!("CARGO_MANIFEST_DIR")).join("ledger/collected");
    let table = |table: &str| {
        format!(
            "{table}={}",
            rows.join(format!("round-{round}-{table}.json")).display()
        )
    };
    let mut command = Command::new("uv");
    command
        .current_dir(repository)
        .args([
            "run",
            "--all-packages",
            "--frozen",
            "hash-integrations-collect",
            "--once",
        ])
        .arg("--config-dir")
        .arg(config.path())
        .arg("json")
        .args([
            "--table",
            &table("aircraft"),
            "--table",
            &table("airfields"),
        ])
        .args(["--key", "aircraft=TAIL", "--key", "airfields=ICAO"]);
    let status = tokio::task::spawn_blocking(move || command.status())
        .await
        .expect("the collector should not panic")
        .expect("`uv` should run");
    assert!(status.success(), "round {round} should be collected");
}

/// Takes one step of `follower` and returns the run it completed.
async fn completed(follower: &Follower) -> RunId {
    match follower.step().await.expect("the step should succeed") {
        Step::Completed { run } => run,
        Step::Idle => panic!("the step should take a run through every stage"),
    }
}

/// Send's counts of `run`, as `sync status` prints them.
async fn sent(storage: &Storage, run: RunId) -> Value {
    let status = status(storage, Some(run))
        .await
        .expect("should read the run's status");
    serde_json::to_value(status).expect("the status should serialize")["send"].clone()
}

/// The rounds of `update_rounds`, collected with dlt instead of written as capture files: each
/// round's rows are the source's whole state, a deleted row is marked, and an unchanged row is
/// not written again.
#[tokio::test(flavor = "multi_thread")]
async fn collected_rounds() {
    let pool = database::pool();
    let mut store = pool
        .acquire(None)
        .await
        .expect("the database connection should open");
    let (actor, web_id) = fixtures::seed(&mut store).await;
    let (_minio, port) = minio::minio().await;
    let connector = "aviation".parse().expect("should be a connector ID");
    let storage = Storage::s3(
        bucket(port),
        &IntegrationNamespace::new(web_id.into(), &connector),
    )
    .expect("should open the bucket");
    let follower = Follower::new(
        bucket(port),
        AVIATION,
        web_id,
        ActorEntityUuid::from(actor),
        graph(),
    )
    .expect("should follow the integration");

    assert_eq!(
        follower.step().await.expect("the step should succeed"),
        Step::Idle,
        "nothing should run before the tables are collected"
    );

    collect(port, web_id, 1).await;
    let run = completed(&follower).await;
    assert_eq!(
        sent(&storage, run).await,
        json!({ "created": 9, "updated": 0, "archived": 0, "mismatches": 0, "failed": 0 }),
        "three airfields, three aircraft and their links should be created"
    );

    collect(port, web_id, 2).await;
    let run = completed(&follower).await;
    assert_eq!(
        sent(&storage, run).await,
        json!({ "created": 3, "updated": 3, "archived": 3, "mismatches": 0, "failed": 0 }),
        "`ESOW`, `SE-BBB` and its link should be created, `ESSB`, `N100` and its link updated, \
         and `G-OLD`, its link and `ESGG` archived"
    );
    let after_two = counts(&mut store, actor, web_id).await;
    assert_eq!(
        after_two,
        BTreeMap::from([
            ("aircraft".to_owned(), [3, 1]),
            ("airfield".to_owned(), [3, 1]),
            ("based-at".to_owned(), [3, 1]),
        ])
    );

    collect(port, web_id, 2).await;
    assert_eq!(
        follower.step().await.expect("the step should succeed"),
        Step::Idle,
        "collecting the same rows again should leave nothing to run"
    );
    assert_eq!(counts(&mut store, actor, web_id).await, after_two);
}
