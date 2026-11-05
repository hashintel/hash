use core::future::ready;
#[cfg(unix)]
use std::os::unix::fs::symlink;
use std::{
    fs,
    path::{Path, PathBuf},
};

use axum::Router;
use duckdb::types::Value;
use error_stack::Report;
use hash_crypto::Secret;
use hash_integrations_definition::{Definition, SecretReference};
use reqwest::{
    Client, Url,
    dns::{Addrs, Name, Resolve, Resolving},
    redirect::Policy,
};
use rstest::rstest;
use tempfile::TempDir;
use testcontainers::{
    ContainerAsync, ImageExt as _,
    core::{CmdWaitFor, ExecCommand},
    runners::AsyncRunner as _,
};
use testcontainers_modules::minio::MinIO;
use tokio::{net::TcpListener, task::JoinHandle};
use uuid::Uuid;

use super::{
    CaptureLimits, CaptureRun, CaptureStore, SecretStore, SecretValue, SourceError, SourceReader,
    fingerprint,
};
use crate::{CaptureStorage, S3Bucket, Workspace, WorkspaceConfig};

pub(super) struct Server {
    url: String,
    task: JoinHandle<()>,
}

impl Server {
    pub(super) fn url(&self) -> &str {
        &self.url
    }
}

impl Drop for Server {
    fn drop(&mut self) {
        self.task.abort();
    }
}

pub(super) async fn server(router: Router) -> Server {
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .expect("should bind the test server");
    let address = listener.local_addr().expect("should get the test address");
    let task = tokio::spawn(async move {
        axum::serve(listener, router)
            .await
            .expect("should serve test responses");
    });
    Server {
        url: format!("http://{address}"),
        task,
    }
}

pub(super) fn public_client(server: &Server) -> (Client, String) {
    let parsed = Url::parse(&server.url).expect("should parse the test URL");
    let port = parsed.port().expect("should have an explicit port");
    let client = Client::builder()
        .no_proxy()
        .redirect(Policy::none())
        .resolve("public.test", ([127, 0, 0, 1], port).into())
        .build()
        .expect("should build the test client");
    (client, format!("http://public.test:{port}"))
}

/// Resolves names without the public destination policy, for fixtures on the local machine.
pub(super) struct AnyResolver;

impl Resolve for AnyResolver {
    fn resolve(&self, name: Name) -> Resolving {
        Box::pin(async move {
            let addresses = tokio::net::lookup_host((name.as_str().to_owned(), 0)).await?;
            Ok(Box::new(addresses) as Addrs)
        })
    }
}

struct NoSecrets;

impl SecretStore for NoSecrets {
    fn read(
        &self,
        _: Uuid,
        _: Uuid,
        _: SecretReference,
    ) -> impl Future<Output = Result<SecretValue, Report<SourceError>>> + Send {
        ready(Err(Report::new(SourceError::Secret)))
    }
}

/// Publishes something other than a capture at `target` while handing out malformed credentials,
/// so the live capture fails and recovering a concurrently published capture fails too.
struct ConflictingSecrets {
    target: PathBuf,
}

impl SecretStore for ConflictingSecrets {
    fn read(
        &self,
        _: Uuid,
        _: Uuid,
        _: SecretReference,
    ) -> impl Future<Output = Result<SecretValue, Report<SourceError>>> + Send {
        fs::create_dir_all(&self.target).expect("should occupy the capture target");
        ready(Ok(Secret::from_vec(b"{}".to_vec())))
    }
}

fn postgres_definition() -> Definition {
    Definition::from_yaml(&format!(
        "
        connector: test
        sources:
          items:
            postgres:
              connection: postgresql://database.example/demo
              schema: public
              table: items
              credentials:
                secretEntityUuid: {}
            primaryKey: [id]
        pipelines:
          entities:
            - source: items
              steps: []
        ",
        Uuid::new_v4(),
    ))
    .expect("should parse a PostgreSQL source")
}

fn sql_definition() -> Definition {
    Definition::from_yaml(
        "
        connector: test
        sources:
          items:
            sql: |
              SELECT
                7 AS id,
                'initial' AS value
            primaryKey: [id]
        pipelines:
          entities:
            - source: items
              steps: []
        ",
    )
    .expect("should parse a SQL source")
}

fn remote_definition() -> Definition {
    Definition::from_yaml(&format!(
        "
        connector: test
        sources:
          items:
            rest:
              url: \
         https://unavailable.invalid
              auth:
                type: bearer
                secretEntityUuid: {}
            primaryKey: [id]
        pipelines:
          entities:
            - source: items
              steps: []
        ",
        Uuid::new_v4(),
    ))
    .expect("should parse a remote source")
}

fn run() -> CaptureRun {
    CaptureRun {
        web: Uuid::new_v4(),
        actor: Uuid::new_v4(),
        id: Uuid::new_v4(),
    }
}

fn reader(directory: &Path) -> SourceReader {
    reader_with(directory, CaptureStorage::Local(directory.join("captures")))
}

fn reader_with(directory: &Path, captures: CaptureStorage) -> SourceReader {
    let local = directory.join("local");
    fs::create_dir_all(&local).expect("should create the local source root");
    SourceReader::new(
        CaptureStore::new(&local, captures).expect("should open capture storage"),
        CaptureLimits::default(),
    )
}

/// Starts MinIO with an empty `captures` bucket and returns it with its API port.
async fn minio() -> (ContainerAsync<MinIO>, u16) {
    let minio = MinIO::default()
        .with_name("ghcr.io/hashdeps/minio")
        .with_tag("RELEASE.2025-09-07T16-13-09Z")
        .start()
        .await
        .expect("the MinIO fixture should start");
    minio
        .exec(
            ExecCommand::new([
                "sh",
                "-c",
                "mc alias set local http://localhost:9000 minioadmin minioadmin && mc mb \
                 local/captures",
            ])
            .with_cmd_ready_condition(CmdWaitFor::exit_code(0)),
        )
        .await
        .expect("should create the bucket");
    let port = minio
        .get_host_port_ipv4(9000)
        .await
        .expect("the MinIO port should be mapped");
    (minio, port)
}

fn s3_storage(port: u16, staging: PathBuf) -> CaptureStorage {
    CaptureStorage::S3 {
        staging,
        bucket: S3Bucket {
            uri: "s3://captures/tenants".into(),
            region: "us-east-1".into(),
            endpoint: Some(format!("localhost:{port}").into()),
            use_ssl: false,
            key_id: "minioadmin".into(),
            secret: Secret::from_vec(b"minioadmin".to_vec()),
        },
    }
}

async fn open_workspace(directory: &Path, name: &str) -> Workspace {
    Workspace::open(directory.join(name), WorkspaceConfig::default())
        .await
        .expect("should open a workspace")
}

#[rstest]
#[case::local(false)]
#[case::s3(true)]
#[tokio::test]
async fn capture_retry_and_restore(#[case] s3: bool) {
    let directory = TempDir::new().expect("should create source storage");
    let minio = if s3 { Some(minio().await) } else { None };
    // In S3 each reader stages in its own directory, so the restore has to download the capture.
    let captures = |staging: &str| match &minio {
        Some((_, port)) => s3_storage(*port, directory.path().join(staging)),
        None => CaptureStorage::Local(directory.path().join("captures")),
    };
    let run = run();
    let workspace = open_workspace(directory.path(), "run.duckdb").await;
    let first = reader_with(directory.path(), captures("first"))
        .capture_sources(&workspace, &sql_definition(), run, &NoSecrets)
        .await
        .expect("should publish the earlier capture");
    workspace
        .close()
        .await
        .expect("should close the first workspace");

    let restored = open_workspace(directory.path(), "restored.duckdb").await;
    let definition = remote_definition();
    let captures = reader_with(directory.path(), captures("restore"))
        .capture_sources(&restored, &definition, run, &NoSecrets)
        .await
        .expect("should reuse a capture without contacting the source or secret store");
    let tables = SourceReader::stage_sources(&restored, &definition, &captures)
        .await
        .expect("should stage a restored capture");
    assert_eq!(tables.len(), 1, "should stage one source");
    let rows = restored
        .query(
            r#"
                SELECT id, value, _op, _key
                FROM "_source/items"
                "#
            .into(),
        )
        .await
        .expect("should query the restored rows");
    let expected = [
        Value::Int(7),
        Value::Text("initial".to_owned()),
        Value::Text("snapshot".to_owned()),
        Value::Text("{\"id\":7}".to_owned()),
    ];
    assert_eq!(
        rows.iter().collect::<Vec<_>>(),
        [expected.as_slice()],
        "the complete captured row and its staging metadata should survive recovery"
    );
    restored
        .close()
        .await
        .expect("should close the restored workspace");
}

#[rstest]
#[case::different_web(|run: CaptureRun| CaptureRun { web: Uuid::new_v4(), ..run })]
#[case::different_run(|run: CaptureRun| CaptureRun { id: Uuid::new_v4(), ..run })]
#[case::changed_definition(|run: CaptureRun| run)]
#[tokio::test]
async fn capture_isolation(#[case] change_identity: fn(CaptureRun) -> CaptureRun) {
    let directory = TempDir::new().expect("should create source storage");
    let workspace = open_workspace(directory.path(), "run.duckdb").await;
    let run = run();
    let reader = reader(directory.path());
    reader
        .capture_sources(&workspace, &sql_definition(), run, &NoSecrets)
        .await
        .expect("should capture SQL");
    let error = reader
        .capture_sources(
            &workspace,
            &remote_definition(),
            change_identity(run),
            &NoSecrets,
        )
        .await
        .expect_err("another web, run or definition should not recover this capture");
    assert!(
        matches!(error.current_context(), SourceError::Secret),
        "should capture the live source again, resolving its credentials"
    );
    workspace.close().await.expect("should close the workspace");
}

#[tokio::test]
async fn failed_recovery_keeps_the_capture_error() {
    let directory = TempDir::new().expect("should create source storage");
    let workspace = open_workspace(directory.path(), "run.duckdb").await;
    let run = run();
    let definition = postgres_definition();
    let (name, source) = definition
        .sources()
        .iter()
        .next()
        .expect("should define a source");
    let resolver = ConflictingSecrets {
        target: directory
            .path()
            .join("captures")
            .join(run.web.to_string())
            .join(run.id.to_string())
            .join(format!("{name}.{}.parquet", fingerprint(source))),
    };
    let error = reader(directory.path())
        .capture_sources(&workspace, &definition, run, &resolver)
        .await
        .expect_err("should fail both the capture and its recovery");
    assert!(
        matches!(error.current_context(), SourceError::Secret),
        "should report the capture failure"
    );
    assert!(
        error
            .frames()
            .filter_map(|frame| frame.downcast_ref::<SourceError>())
            .any(|context| matches!(context, SourceError::Read)),
        "should keep the recovery failure in the report"
    );
    workspace.close().await.expect("should close the workspace");
}

#[rstest]
#[case::same(".")]
#[case::captures_in_local("captures")]
#[case::local_in_captures("..")]
fn overlapping_roots(#[case] captures: &str) {
    let directory = TempDir::new().expect("should create the directory");
    let local = directory.path().join("local");
    fs::create_dir_all(&local).expect("should create the local source root");
    let error = CaptureStore::new(&local, CaptureStorage::Local(local.join(captures)))
        .expect_err("should keep captures outside the local source root");
    assert!(
        matches!(error.current_context(), SourceError::Configuration),
        "overlapping roots should be rejected as invalid configuration"
    );
}

#[rstest]
#[case::parent_traversal("../source.parquet")]
#[case::absolute_path("/etc/passwd")]
#[case::empty_path("")]
fn local_root_invalid_key(#[case] key: &str) {
    let directory = TempDir::new().expect("should create the directory");
    let captures = TempDir::new().expect("should create the capture directory");
    let store = CaptureStore::new(
        directory.path(),
        CaptureStorage::Local(captures.path().to_owned()),
    )
    .expect("should open storage");
    let error = store
        .local_file(key)
        .expect_err("should reject an invalid source key");
    assert!(
        matches!(error.current_context(), SourceError::Configuration),
        "invalid source keys should fail validation before accessing the filesystem"
    );
}

#[cfg(unix)]
#[test]
fn local_root_symlink() {
    let directory = TempDir::new().expect("should create the directory");
    let outside = TempDir::new().expect("should create the outside directory");
    fs::write(outside.path().join("source.parquet"), b"outside").expect("should write a source");
    let captures = TempDir::new().expect("should create the capture directory");
    let store = CaptureStore::new(
        directory.path(),
        CaptureStorage::Local(captures.path().to_owned()),
    )
    .expect("should open storage");
    symlink(outside.path(), directory.path().join("escape"))
        .expect("should create the test symlink");
    let error = store
        .local_file("escape/source.parquet")
        .expect_err("should reject a symlink escaping the local root");
    assert!(
        matches!(error.current_context(), SourceError::Read),
        "the resolved source path should remain inside its configured root"
    );
}
